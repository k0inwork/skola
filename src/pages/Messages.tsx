import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { Send, ArrowLeft, Clock, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { io } from "socket.io-client";
import { format } from "date-fns";

interface Conversation {
  partnerId: string;
  partnerName: string;
  lastMessage: {
    content: string;
    createdAt: string;
    type: string;
    senderId: string;
  };
  unreadCount: number;
}

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  type: string;
  read: boolean;
  lessonId: string | null;
  proposedDate: string | null;
  proposedStartTime: string | null;
  proposedEndTime: string | null;
  createdAt: string;
}

export function Messages() {
  const { partnerId } = useParams<{ partnerId?: string }>();
  const navigate = useNavigate();
  const { token, role } = useAuthStore();
  const userId = useAuthStore(s => {
    // Decode JWT to get user ID
    try {
      const t = s.token;
      if (!t) return null as string | null;
      const payload = JSON.parse(atob(t.split(".")[1]));
      return payload.userId as string;
    } catch { return null as string | null; }
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  // Reschedule request state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", startTime: "", endTime: "", lessonId: "" });
  const [upcomingLessons, setUpcomingLessons] = useState<any[]>([]);

  useEffect(() => {
    fetchConversations();
  }, [token]);

  useEffect(() => {
    if (partnerId) {
      fetchMessages(partnerId);
    }
  }, [partnerId, token]);

  useEffect(() => {
    // Socket.IO for real-time
    const socket = io();
    socketRef.current = socket;

    if (userId) {
      socket.emit("join", userId);
    }

    socket.on("new_message", (data) => {
      if (data.recipientId === userId) {
        // If we're in the conversation with the sender, refresh messages
        if (partnerId && data.message.senderId === partnerId) {
          fetchMessages(partnerId);
        }
        // Always refresh conversations list
        fetchConversations();
      }
    });

    return () => { socket.disconnect(); };
  }, [userId, partnerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/messages/conversations", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setConversations(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (pId: string) => {
    try {
      const res = await fetch(`/api/messages/${pId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !partnerId) return;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientId: partnerId,
          content: newMessage.trim(),
        })
      });
      if (res.ok) {
        setNewMessage("");
        fetchMessages(partnerId);
        fetchConversations();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendRescheduleRequest = async () => {
    if (!partnerId || !rescheduleForm.date || !rescheduleForm.startTime || !rescheduleForm.endTime) return;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientId: partnerId,
          content: `Can we reschedule to ${rescheduleForm.date} at ${rescheduleForm.startTime}?`,
          type: "reschedule_request",
          lessonId: rescheduleForm.lessonId || null,
          proposedDate: rescheduleForm.date,
          proposedStartTime: rescheduleForm.startTime,
          proposedEndTime: rescheduleForm.endTime,
        })
      });
      if (res.ok) {
        setShowReschedule(false);
        setRescheduleForm({ date: "", startTime: "", endTime: "", lessonId: "" });
        fetchMessages(partnerId);
        fetchConversations();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const respondToReschedule = async (messageId: string, action: "approve" | "decline") => {
    try {
      const res = await fetch(`/api/messages/${messageId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        if (partnerId) fetchMessages(partnerId);
        fetchConversations();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch upcoming lessons for reschedule dropdown (student only)
  useEffect(() => {
    if (role === "client" && partnerId && showReschedule) {
      fetch("/api/students/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(student => {
          if (student?.id) {
            return fetch(`/api/students/${student.id}/lessons`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        })
        .then(r => r?.json())
        .then(data => {
          if (Array.isArray(data)) {
            const upcoming = data.filter((l: any) =>
              l.status === "scheduled" || l.status === "rescheduled"
            );
            setUpcomingLessons(upcoming);
            if (upcoming.length > 0) {
              setRescheduleForm(f => ({ ...f, lessonId: upcoming[0].id }));
            }
          }
        })
        .catch(console.error);
    }
  }, [role, partnerId, showReschedule, token]);

  const selectedConv = conversations.find(c => c.partnerId === partnerId);

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      {/* Sidebar - Conversations List */}
      <div className={clsx(
        "w-80 bg-white border-r border-gray-200 flex flex-col shrink-0",
        partnerId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <button
              key={conv.partnerId}
              onClick={() => navigate(`/messages/${conv.partnerId}`)}
              className={clsx(
                "w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                conv.partnerId === partnerId && "bg-blue-50 border-l-2 border-l-blue-500"
              )}
            >
              <div className="flex justify-between items-start">
                <div className="font-medium text-gray-900 text-sm">{conv.partnerName}</div>
                {conv.unreadCount > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{conv.lastMessage.content}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                {format(new Date(conv.lastMessage.createdAt), "MMM d, HH:mm")}
              </p>
            </button>
          ))}
          {conversations.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-400 text-sm">
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={clsx(
        "flex-1 flex flex-col",
        !partnerId ? "hidden md:flex" : "flex"
      )}>
        {!partnerId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a conversation to start messaging
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
              <button onClick={() => navigate("/messages")} className="md:hidden text-gray-500 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="font-bold text-gray-900">{selectedConv?.partnerName || "Chat"}</h2>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {messages.map(msg => {
                const isMine = msg.senderId === userId;

                if (msg.type === "reschedule_request") {
                  return (
                    <div key={msg.id} className={clsx("flex", isMine ? "justify-end" : "justify-start")}>
                      <div className={clsx(
                        "max-w-sm rounded-xl p-4 shadow-sm border",
                        isMine ? "bg-blue-600 text-white border-blue-600" : "bg-white border-amber-200"
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <RotateCcw className="w-4 h-4" />
                          <span className="font-semibold text-sm">Reschedule Request</span>
                        </div>
                        <p className="text-sm mb-2">{msg.content}</p>
                        <div className={clsx("text-xs flex items-center gap-1", isMine ? "text-blue-200" : "text-gray-500")}>
                          <Clock className="w-3 h-3" />
                          {msg.proposedDate} {msg.proposedStartTime}-{msg.proposedEndTime}
                        </div>

                        {/* Action buttons for instructor */}
                        {!isMine && (role === "admin" || role === "instructor") && (
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => respondToReschedule(msg.id, "approve")}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                            <button
                              onClick={() => respondToReschedule(msg.id, "decline")}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 transition border border-red-200"
                            >
                              <XCircle className="w-3 h-3" /> Decline
                            </button>
                          </div>
                        )}
                        <div className={clsx("text-[10px] mt-2", isMine ? "text-blue-200" : "text-gray-400")}>
                          {format(new Date(msg.createdAt), "MMM d, HH:mm")}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (msg.type === "reschedule_approved") {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-emerald-50 text-emerald-800 px-4 py-2 rounded-lg text-sm border border-emerald-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                if (msg.type === "reschedule_declined") {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-red-50 text-red-800 px-4 py-2 rounded-lg text-sm border border-red-200 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                if (msg.type === "lesson_cancelled") {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-red-50 text-red-800 px-4 py-2 rounded-lg text-sm border border-red-200 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Regular chat message
                return (
                  <div key={msg.id} className={clsx("flex", isMine ? "justify-end" : "justify-start")}>
                    <div className={clsx(
                      "max-w-sm rounded-xl px-4 py-3 shadow-sm",
                      isMine ? "bg-blue-600 text-white" : "bg-white text-gray-900 border border-gray-100"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className={clsx("text-[10px] mt-1", isMine ? "text-blue-200" : "text-gray-400")}>
                        {format(new Date(msg.createdAt), "HH:mm")}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reschedule Request Modal */}
            {showReschedule && (
              <div className="border-t border-gray-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-sm mb-3">Request Reschedule</h3>
                {upcomingLessons.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select lesson</label>
                    <select
                      value={rescheduleForm.lessonId}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, lessonId: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white"
                    >
                      {upcomingLessons.map((l: any) => (
                        <option key={l.id} value={l.id}>{l.date} {l.startTime}-{l.endTime}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">New Date</label>
                    <input
                      type="date"
                      value={rescheduleForm.date}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                    <input
                      type="time"
                      value={rescheduleForm.startTime}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, startTime: e.target.value })}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                    <input
                      type="time"
                      value={rescheduleForm.endTime}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, endTime: e.target.value })}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={sendRescheduleRequest}
                    disabled={!rescheduleForm.date || !rescheduleForm.startTime}
                    className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    Send Request
                  </button>
                  <button
                    onClick={() => setShowReschedule(false)}
                    className="px-4 py-2 text-gray-600 text-sm hover:text-gray-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
              <div className="flex gap-2">
                {role === "client" && (
                  <button
                    onClick={() => setShowReschedule(!showReschedule)}
                    className="px-3 py-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition text-sm font-medium border border-amber-200 shrink-0"
                    title="Request reschedule"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
