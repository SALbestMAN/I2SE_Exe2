# Statement of Work (SoW)

## Introduction

This document is the agreement for the Lecture App project between the team (Salman Batheesh and Ade Kassem) and the course lecturer, who is our client. It says what we will build, what we will hand in, when, and how the work is accepted.

## Objectives

- Take attendance in under 5 seconds per student, in a way that can't be faked from outside the room.
- Give the lecturer one place for the whole lecture: attendance, polls, questions and slides.
- Help after the lecture with AI summaries and homework reviews.
- Cost nothing to run.

## Scope of work

We will design, build, test and document a website with:

- Google sign-in for lecturers and students.
- Courses, lectures, and a student list imported from Moodle.
- Check-in with a moving, signed QR code, with optional Wi-Fi, location and second checks.
- An attendance sheet with Excel and CSV export.
- Live polls, anonymous questions, slides and a whiteboard.
- AI lecture summaries and AI homework review.
- English, Hebrew and Arabic.

**Not included:** final grades, writing back into Moodle, a native phone app, and support after the course.

## Tasks

| Task | What we do |
| --- | --- |
| Research | Try the tools and pick the stack (see the [tools report](tools-report.md)) |
| Requirements | Write the SRS and the use cases |
| Design | Define the components, the class diagrams and the sequence diagrams |
| Build | Write the database, the data layer, and the lecturer and student pages |
| Test | Write and run database, unit and end-to-end tests; check the rest by hand |
| Demo | Show a live check-in and a full lecture in class |

## Place and time

We work remotely and meet in class. The work runs over the semester and ends with the demo in class.

## Resources

- **People:** Salman Batheesh and Ade Kassem.
- **Services, all on free plans:** GitHub (code and hosting), Supabase (database, sign-in, storage), Google Gemini (AI).
- **For the demo:** a laptop with a projector, and students' phones.

## Deliverables and schedule

| Deliverable | Due | Accepted when |
| --- | --- | --- |
| README with the problem and the scope | Start of the project | The lecturer approves the scope |
| Tools report | Before we start building | Every tool was tried for real |
| SoW, SRS and use cases | Before we start building | Every requirement has an ID and a priority |
| Components, class and sequence diagrams | Before the main build | Every requirement belongs to a component |
| The website and the database | Before the demo | It runs on GitHub Pages and works on a phone and a laptop |
| Tests and the testing strategy | Before the demo | All automated tests pass |
| Demo in class | Demo day | A live check-in works in the room |
| Conclusion | After the demo | It describes the results |

