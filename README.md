<p align="right">
  <img src="https://github.com/user-attachments/assets/ddbb6961-2f80-4a1b-a36d-208701f05dec" width="170"/>
</p>

# Ex2: Vibe Coding & Deep Designing: Web-based Teaching Tool
**Team:** Salman Batheesh, Ade Kassem · Ariel University

[![tests](https://github.com/SALbestMAN/I2SE_Exe2/actions/workflows/tests.yml/badge.svg)](https://github.com/SALbestMAN/I2SE_Exe2/actions/workflows/tests.yml)

A website for live lectures. Students check in by scanning a moving QR code on the projector. Lecturers get a live attendance sheet, polls, anonymous questions, slides they can draw on, and AI help with lecture summaries and homework.
 
**Live site:** [salbestman.github.io/I2SE_Exe2](https://salbestman.github.io/I2SE_Exe2/). Open it and sign in with Google as a lecturer or a student.
 
 
https://github.com/user-attachments/assets/51f12456-cc6f-40f1-ab99-084d2b47395a


## The problem
 
Taking attendance in a big lecture is slow, and it's easy to cheat. A friend signs your name on the paper sheet. Someone takes a photo of a fixed QR code and sends it to the group chat, and people "check in" from home.
 
The rest of the lecture is scattered too. Slides are in one place, polls in another app, and homework in a third. Many students never ask a question out loud, so the lecturer doesn't know what the class didn't understand.
 
## Scope of the project
 
We are building one website that solves both problems.
 
**In scope**
 
- **Attendance that can't be faked.** The QR code on the projector changes 5 times a second and every frame is signed. The phone has to film it live for about 2 seconds, and the database checks the frames before it accepts the check-in. The lecturer can also turn on a class Wi-Fi check, a location check, and a second check later in the lecture.
- **Courses and students.** Lecturers create courses, import the student list from Moodle (CSV or Excel), and students join with a course code.
- **Attendance sheet.** Present, partial or absent for every student and lecture, with export to Excel and CSV.
- **During the lecture.** Live polls, anonymous questions with upvotes, and slides or a whiteboard that students follow on their phones.
- **After the lecture.** AI summaries of the recording, and AI review of homework against the assignment's own requirements.
- **Three languages.** English, Hebrew and Arabic.
**Out of scope**
 
- Final grades. The AI review helps the lecturer; it doesn't grade.
- Writing back into Moodle. We only read its exported student list.
- A native phone app. Everything runs in the phone's browser.
- Paid hosting or support after the course.
**Users:** lecturers on a laptop connected to the projector, and students on their phones.
 
**Built with:** plain HTML, CSS and JavaScript on GitHub Pages, and Supabase for the database, Google sign-in and file storage. All the rules that matter run inside the database, so a student can't get around them by changing the page.
 
## Project documents
 
| Document | What's in it |
| --- | --- |
| [Technical tools report](docs/tools-report.md) | The tools we use and how we tested each one for real |
| [Statement of Work (SoW)](docs/SoW.md) | Objectives, deliverables, schedule and how the work is accepted |
| [Software Requirements Specification (SRS)](docs/SRS.md) | Everything the system must do, with IDs |
| [Use cases](docs/use-cases.md) | The client stories, step by step |
| [Software components](docs/software-components.md) | The main parts of the system and how they connect |
| [Class and sequence diagrams](docs/class-and-sequence-diagrams.md) | The low-level design |
| [Testing strategy](docs/testing-strategy.md) | How we test each component, and the results |
| [Conclusion](docs/conclusion.md) | What we built and what we learned |
 
