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

