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

## What it does

- **Attendance.** The projector shows a code that keeps changing. The phone captures a few frames, and the database checks that the student is on the list, the frames are real and fresh, they arrived in real time, and (if turned on) the phone is on the class Wi-Fi and near the lecturer. The lecturer can add a second check later in the lecture to catch people who leave early.
- **Courses and students.** Import the student list from the Moodle export (CSV or Excel), add students by hand, or let them join with a course code. ID numbers are never stored.
- **Attendance sheet.** Present, partial or absent for every lecture, with the details of each check. Exports to CSV and Excel.
- **During the lecture.** Live polls, anonymous questions with upvotes, and slides or a whiteboard that students follow on their phones.
- **AI.** Lecture summaries from a Zoom, Drive or YouTube link, a recording or a transcript, and homework reviews against the assignment's own requirements. Each lecturer uses their own free Gemini key.
- **Languages.** English, Hebrew and Arabic, right to left where needed.

## How it is built

Plain HTML, CSS and JavaScript, with no build step, hosted on GitHub Pages. Supabase gives us the database (PostgreSQL), Google sign-in, file storage and one small server function. All the rules that matter run inside the database, so a student can't get around them by changing the page.

```text
index.html            sign in
student/              6 student pages (home, check-in, course, homework, attendance, questions)
lecturer/             10 lecturer pages (courses, live room, students, attendance, summaries, homework, ...)
js/                   shared code; api-supabase.js is the only file that talks to the server
css/                  styles
supabase/schema.sql   tables, access rules and the check-in checks
supabase/functions/   fetch-recording: sends a Zoom or Drive recording to Gemini
tests/                62 automated tests
docs/                 project documents
```

## Setting it up

1. Create a Supabase project. In the SQL Editor, paste all of `supabase/schema.sql` and run it.
2. Turn on Google sign-in: create an OAuth client in Google Cloud and paste its ID and secret in Supabase (Authentication → Providers → Google).
3. Paste the project URL and the publishable key into `js/config.js`.
4. Publish the repository with GitHub Pages, and put the Pages address in Supabase (Authentication → URL Configuration).
5. For Zoom and Drive summaries, deploy `supabase/functions/fetch-recording` as an Edge Function named `fetch-recording` and turn off Verify JWT (the function checks the sign-in itself).

The secret key, the service_role key, the database password and the Google client secret never go into this repository. Neither does the real student list.

## Tests

There are 62 tests in three groups. On the last run (26 Nov 2026) all of them passed. The test IDs match the [testing strategy](docs/testing-strategy.md).

| Folder | What it tests | Tests | You need | Run |
| --- | --- | --- | --- | --- |
| `tests/db/` | The real `supabase/schema.sql` on PostgreSQL | 39 | PostgreSQL 14+ and `psql` | `tests/db/run.sh` |
| `tests/unit/` | The browser code in Node, no network | 16 | Node.js 18+ | `node --test tests/unit/unit.test.js` |
| `tests/e2e/` | The real pages in a headless browser, with sample data | 7 | Node.js, Playwright, and Python with OpenCV for the QR test | Start `tests/e2e/serve-test-site.sh`, then in a second terminal `node --test --test-concurrency=1 tests/e2e/e2e.test.js` |

`tests/db/run.sh` deletes and recreates a database called `cp_test` each time, so run it only on a local test database. The output of the last run is in `tests/results/`. All test data uses invented names and emails.

## Documents

Read them in this order. Each one builds on the one before it.

- [Technical tools report](docs/technical-tools-report.md): the tools we picked and what happened when we tried each one.
- [Scope of work](docs/scope-of-work.md): the full version of the scope above, with the plan.
- [Software requirements](docs/software-requirements.md): what the system must do, each requirement with an ID.
- [Use cases and user stories](docs/use-cases-and-user-stories.md): how lecturers and students use it, step by step.
- [Software design](docs/software-design.md): the main parts of the system and how they talk to each other.
- [Class diagram](docs/class-diagram.md): the data and the code modules.
- [Sequence diagrams](docs/sequence-diagrams.md): check-in, an AI summary, and a poll vote, message by message.
- [Testing strategy](docs/testing-strategy.md): how we test, all 62 tests, and the results.

The IDs connect the documents. A requirement (REQ-06) leads to a use case (UC-01), a part of the design, and the tests that prove it works (TC-01 to TC-16). The table at the end of the requirements document shows this for every requirement. Diagrams are written in Mermaid, so GitHub draws them right on the page.
