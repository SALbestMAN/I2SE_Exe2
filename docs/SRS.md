# Software Requirements Specification (SRS)

## Introduction

**Purpose.** This document lists everything the Lecture App must do. The design, the code and the tests are all checked against it.

**Scope.** The Lecture App is a website for live lectures: attendance that can't be faked, live polls and questions, slides, and AI help after the lecture. The full scope is in the [README](../README.md) and the [SoW](SoW.md).

**How to read it.** Every requirement has an ID. REQ is something the system does, and NFR is how well it must do it. Priorities:

- **Must:** the system is useless without it.
- **Should:** important.
- **Could:** a nice extra.

**Words we use**

| Word | Meaning |
| --- | --- |
| Lecture (session) | One meeting of a course |
| Frame | One picture of the QR code. A new one appears every 200 ms |
| Check-in | A student scanning the code to be marked present |
| Second check | An optional second scan later in the lecture. Missing it gives "partial" |
| Student list (roster) | The students allowed in a course |

## Overall description

**Users**

| User | Device | What they do |
| --- | --- | --- |
| Lecturer | Laptop, usually on the projector | Sets up courses, runs lectures, reads the attendance sheet, uses the AI tools |
| Student | Phone | Joins courses, checks in, votes, asks questions, hands in homework |

**Where it runs.** In any modern browser. The site is hosted on GitHub Pages, and the data lives in Supabase.

**Constraints**

- Free plans only.
- No server of our own.
- The camera needs HTTPS.
- Every rule that matters must run in the database, not in the browser.

**Assumptions.** Students have a phone with a camera. The classroom has a projector.

## Functional requirements

| ID | The system shall... | Priority |
| --- | --- | --- |
| REQ-01 | let a person sign in with Google as a lecturer or a student. | Must |
| REQ-02 | let a lecturer create a course and plan lectures. Each lecture has a title, a date, in class or online, and switches for the Wi-Fi, location and second checks. An online lecture never uses the Wi-Fi or location check. | Must |
| REQ-03 | let a lecturer import the student list from a CSV or Excel file with Hebrew, English or Arabic headers, and add or remove a student by hand. | Must |
| REQ-04 | let a student join a course with its 6-character code. A student already on the list joins at once. Anyone else becomes a request that the lecturer approves or declines. | Must |
| REQ-05 | show a QR code on the projector that changes every 200 ms. Each frame is signed with the lecture's secret key. | Must |
| REQ-06 | accept a check-in only if: the student is on the list; the frames are genuine, from the current round, at least 6 and in order; they were shown after the scan began; the newest is at most 3 s old (8 s on a slow connection); they cover at least 1 s and arrived at close to real speed; and, when turned on, the phone is on the lecturer's network and within 300 m. | Must |
| REQ-07 | let the lecturer open, pause and stop attendance, and start a second check with a button, after N minutes, or at a set time. | Must |
| REQ-08 | show an attendance sheet with present, partial or absent for each student and lecture, and a total percent where partial counts as half. Export it to CSV and Excel. | Must |
| REQ-09 | let a student who couldn't check in ask to be marked present. Only the lecturer can approve it. | Should |
| REQ-10 | run live polls with 2 to 4 answers. Each student has one vote and can change it until the poll closes. | Must |
| REQ-11 | let students send questions (anonymous by default, up to 300 characters, at most one every 5 seconds) and upvote them. The lecturer can answer, mark as answered, or hide them. | Must |
| REQ-12 | show slides (PDF, pictures or Office files) and a whiteboard on the projector, with a pen, highlighter, eraser and text. The students' phones show the current slide. | Should |
| REQ-13 | summarize a lecture with AI from a Zoom, Drive or YouTube link, an uploaded recording, or a transcript, in Hebrew, English or Arabic. The lecturer can share the summary with the students. | Should |
| REQ-14 | review handed-in homework with AI against the assignment's own requirements, find copied work, and give the lecturer a summary of the whole class. | Could |
| REQ-15 | let a course's owner add other lecturers. They can do everything except add lecturers and delete the course. | Could |

## Non-functional requirements

| ID | Requirement | How we check it |
| --- | --- | --- |
| NFR-01 Security | A student can never read the signing keys or the frames log, and sees only their own row in the student list and their own attendance. Every check runs in the database, not in the browser. | TC-34 to TC-39 |
| NFR-02 Privacy | No ID numbers are stored. An anonymous asker's name never leaves the database. The real student list is never in the repository. | TC-22, TC-46 |
| NFR-03 Usability | Every student page works on a 390 px wide phone with no sideways scrolling. A check-in takes under 5 seconds. | TC-61, and timed in the demo |
| NFR-04 Languages | The whole site works in English, Hebrew and Arabic, right to left where needed. | TC-55, TC-60 |
| NFR-05 Speed | The projector code changes at least 4 times a second, even on a slow network. | TC-57 |
| NFR-06 Cost | It runs on free plans only. | The live site |
| NFR-07 Offline | A question written with no connection is sent when the connection comes back. | Checked by hand |

## External interfaces

| Interface | Used for |
| --- | --- |
| Google sign-in (through Supabase Auth) | Signing in with the university account |
| Supabase (HTTPS) | All data, file storage, and the database functions |
| Google Gemini API | AI summaries and reviews, with each lecturer's own key |
| GitHub API | Reading a student's repository for a homework review |
| Zoom, Google Drive, YouTube | Where lecture recordings come from |
| Moodle | Only as an exported CSV or Excel file |
| Phone camera and location | Scanning the code and the distance check |

## Main data

| Thing | What it holds |
| --- | --- |
| Course | Name, join code, owner, weekly times |
| Student list entry | Course, email, name, group, status (listed, joined, or waiting for approval) |
| Lecture (session) | Course, title, date, in class or online, which checks are on, attendance state |
| Lecture secret | The key that signs the QR frames. Only lecturers of the course can read it |
| Attendance | Student, lecture, round, how old the code was, network, distance |
| Blocked attempt | Student, lecture, and the reasons the scan was refused |
| Poll and vote | Question, 2 to 4 answers, one vote per student |
| Question | Text, anonymous or not, upvotes, answer, answered or hidden |
| Summary, assignment, submission | The AI summary of a lecture; the homework and each student's hand-in and review |

## Traceability

Each requirement leads to a use case ([use cases](use-cases.md)), to the components that build it ([components](software-components.md)), and to the tests that prove it works ([testing strategy](testing-strategy.md)).

| Requirement | Use case | Components | Tests |
| --- | --- | --- | --- |
| REQ-01 Sign in | all | C-8, C-9 | TC-38, TC-39, and by hand |
| REQ-02 Courses and lectures | UC-02, UC-03 | C-1, C-10 | TC-30, TC-33 |
| REQ-03 Student list | UC-04 | C-1, C-5 | TC-10, TC-35, TC-40 to TC-47 |
| REQ-04 Join by code | UC-05 | C-2, C-10 | TC-24 to TC-26 |
| REQ-05 Moving signed code | UC-01, UC-03 | C-1, C-4 | TC-04, TC-48, TC-50, TC-57, TC-62 |
| REQ-06 Check-in checks | UC-01 | C-2, C-4, C-10 | TC-01 to TC-10, TC-12 to TC-16 |
| REQ-07 Attendance control | UC-03 | C-1, C-10 | TC-11 to TC-13, TC-53 |
| REQ-08 Attendance sheet | UC-06 | C-5, C-8 | TC-51 to TC-54 |
| REQ-09 Requests to be marked present | UC-07 | C-2, C-10 | TC-27 to TC-29 |
| REQ-10 Polls | UC-08 | C-10 | TC-17 to TC-20, TC-58 |
| REQ-11 Questions | UC-09 | C-10 | TC-21 to TC-23, TC-59 |
| REQ-12 Slides and whiteboard | UC-03 | C-7, C-11 | By hand |
| REQ-13 AI summaries | UC-10 | C-6, C-12 | By hand |
| REQ-14 AI homework review | UC-11 | C-6, C-11 | TC-47, and by hand |
| REQ-15 More lecturers | UC-02 | C-10 | TC-31 to TC-33 |
