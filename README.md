<p align="right">
  <img src="https://github.com/user-attachments/assets/ddbb6961-2f80-4a1b-a36d-208701f05dec" width="170"/>
</p>

# Ex2: Vibe Coding & Deep Designing: Web-based Teaching Tool
**Team:** Salman Batheesh, Ade Kassem · Ariel University


https://github.com/user-attachments/assets/51f12456-cc6f-40f1-ab99-084d2b47395a


A web app for live lectures. Students check in by scanning a moving QR code on the projector. Lecturers get a live attendance sheet, polls, anonymous questions, slides they can draw on, and AI help with lecture summaries and homework.


## The problem

Paper sign-in sheets and fixed QR codes are easy to cheat: a friend signs for you, or someone sends a photo of the code to the group chat. Questions, polls, slides and homework also live in separate tools, and many students don't ask questions out loud.

This app puts all of it in one place and makes attendance hard to fake. The QR code changes 5 times a second, every frame is signed, and the database only accepts a scan that was captured live, in the room.

## Scope of work

**Goal.** Attendance that students can't fake, taken in seconds, plus everything a lecturer needs during and after the lecture, in one website.

**Success means:**
- a student checks in with their phone in under 5 seconds;
- a photo or video of the code sent from outside the room doesn't work;
- the lecturer ends the lecture with an attendance sheet they can export to Excel.

**What we deliver:**
- The website: 6 student pages and 10 lecturer pages, in English, Hebrew and Arabic.
- The database (`supabase/schema.sql`), with the access rules and the check-in checks.
- Check-in with a moving, signed QR code, and an optional Wi-Fi, location and second check.
- An attendance sheet with Excel and CSV export.
- Live polls, anonymous questions, slides and a whiteboard.
- AI lecture summaries and AI homework review.
- 62 automated tests, these documents, and user guides for lecturers and students.

**Not included:** grades (the AI review only helps the lecturer), writing back into Moodle, a native phone app, and paid hosting or support after the course.

**Assumptions:** students have a phone with a camera, the classroom has a projector, and everything runs on free plans (GitHub Pages, Supabase, Gemini).

The full version, with the plan and how we know each deliverable is done, is in [docs/scope-of-work.md](docs/scope-of-work.md).

