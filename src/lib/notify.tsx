import { create } from "zustand";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import clsx from "clsx";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface NotifyState {
  toasts: Toast[];
  add: (message: string, type?: ToastType) => void;
  remove: (id: number) => void;
}

let nextId = 0;

export const useNotify = create<NotifyState>((set) => ({
  toasts: [],
  add: (message, type = "info") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function ToastContainer() {
  const { toasts, remove } = useNotify();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg border animate-in slide-in-from-right",
            t.type === "success" && "bg-emerald-50 border-emerald-200 text-emerald-800",
            t.type === "error" && "bg-red-50 border-red-200 text-red-800",
            t.type === "info" && "bg-blue-50 border-blue-200 text-blue-800"
          )}
        >
          {t.type === "success" && <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />}
          {t.type === "error" && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
          {t.type === "info" && <Info className="w-5 h-5 shrink-0 mt-0.5" />}
          <span className="text-sm font-medium flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Imperative helpers so we can call from non-React code
export function toast(message: string, type: ToastType = "info") {
  useNotify.getState().add(message, type);
}
export function toastSuccess(message: string) {
  useNotify.getState().add(message, "success");
}
export function toastError(message: string) {
  useNotify.getState().add(message, "error");
}
