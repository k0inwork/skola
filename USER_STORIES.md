# Scola User Stories & Project Status

## Available Features (Story Completion)
- **Authentication**: Users can log in as Admin, Instructor, or Client (Student). Google Login is available.
- **Real-time Calendar**: Students and Instructors see the same live schedule. Bookings appear instantly across sessions via WebSockets.
- **Booking Flow**: Students can select available slots and book driving lessons.
- **Instructor Dashboard**: Overview of active students, upcoming lessons, and payment statuses.
- **Student Profiles**: Instructors can view a student’s full lesson history (sorted with newest on top), including comments, location, and payment status.
- **Lesson Management**: Instructors can mark lessons as paid, add internal comments/notes, and set the meeting place (location) for each lesson. 
- **Real-time Sync**: WebSockets ensure that when a student books or an instructor updates a lesson, all users see the change immediately.
- **Automated Calculations**: Student profile shows total value of paid lessons (based on 30 EUR/lesson default).
- **Availability Control**: Instructors can toggle "Working" vs "Off" for specific days and adjust slot durations.

## Product Backlog (Planned Features)
- **Dedicated Payments Dashboard**: A separate panel to track revenue and pending fees (removed from v1).
- **Google Maps Integration**: Select lesson pickup points on a real map.
- **Location Management**: Create a reusable list of locations/pickup points with names (e.g., "Main Station", "School Entry") and mark them on the map.
- **Dynamic Timetable Modification**: Drag and drop lessons to reschedule them directly on the calendar.
- **Flexible Pricing**: Store specific amounts paid per lesson instead of using a global default rate.
- **Notification System**: Push notifications or emails for lesson reminders and payment requests.
- **Vehicle Selection**: Track which car is used for each driving lesson.
- **Student Progress Tracker**: Visual list of driving skills/milestones achieved by the student.

## Technical Details
- **Architecture**: Full-stack React + Express + SQLite (Drizzle ORM).
- **Communication**: WebSocket (Socket.io) for live synchronization.
- **Naming Convention**: Application title is "Skola" as per user request.
