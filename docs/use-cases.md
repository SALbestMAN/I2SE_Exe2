# Use cases (client stories)

These are the things lecturers and students do with the app, written as client stories. Each one links to the [requirements](SRS.md) it covers. The three most important ones are written out step by step: checking in, running a lecture, and joining a course.

```mermaid
flowchart LR
  L(("Lecturer"))
  S(("Student"))
  subgraph App["Lecture app"]
    UC02(["UC-02 Set up a course"])
    UC03(["UC-03 Run a live lecture"])
    UC04(["UC-04 Import the student list"])
    UC06(["UC-06 Export attendance"])
    UC10(["UC-10 Summarize a lecture"])
    UC11(["UC-11 Review homework"])
    UC01(["UC-01 Check in"])
    UC05(["UC-05 Join a course"])
    UC07(["UC-07 Ask to be marked present"])
    UC08(["UC-08 Answer a poll"])
    UC09(["UC-09 Ask a question"])
  end
  L --- UC02 & UC03 & UC04 & UC06 & UC10 & UC11
  S --- UC01 & UC05 & UC07 & UC08 & UC09
```

## Client stories

| ID | Story | It works when... | Requirement |
| --- | --- | --- | --- |
| UC-01 | As a student in the room, I want to scan the code on the projector so I'm marked present in a few seconds. | Attendance is open and I'm on the list. I hold my phone on the code for about 2 seconds. Every check gets a tick and the count on the projector goes up by one. | REQ-05, REQ-06 |
| UC-02 | As a lecturer, I want to create a course and add a second lecturer so we can both run it. | The course gets a 6-character code. The second lecturer can plan lectures but can't delete the course. | REQ-02, REQ-15 |
| UC-03 | As a lecturer, I want to open attendance when I'm ready and run a second check later, so students who leave early only get partial. | When the second check starts, the first-round frames stop working and students have to scan again. | REQ-05, REQ-07, REQ-12 |
| UC-04 | As a lecturer, I want to import the Moodle student list once, so only my students can check in. | I drop in the Moodle file with Hebrew headers. The columns are recognised, duplicates and bad rows are reported, and no ID numbers are kept. | REQ-03 |
| UC-05 | As a new student, I want to join with the course code. | If I'm on the list I'm in right away. If not, the lecturer gets a request. | REQ-04 |
| UC-06 | As a lecturer, I want to download the attendance sheet in Excel to give to the department. | I get one row per student and a total percent. | REQ-08 |
| UC-07 | As a student whose phone failed, I want to ask the lecturer to mark me present, so I'm not marked absent unfairly. | The lecturer sees my reason, and only the lecturer can approve it. | REQ-09 |
| UC-08 | As a student, I want to answer the poll from my phone and see the results. | My vote is saved and I can change it until the poll closes. | REQ-10 |
| UC-09 | As a shy student, I want to ask without my name and upvote other questions, so the lecturer answers what most people want to know. | My question shows without my name, and the list is sorted by upvotes. | REQ-11 |
| UC-10 | As a lecturer, I want to paste the Zoom link after class and share an AI summary, so students can catch up. | With a Zoom transcript, the summary is ready in about a minute and I can share it. | REQ-13 |
| UC-11 | As a lecturer, I want an AI review of each homework and a warning about copied work. | I click Review all. Each student gets a score based on the assignment's requirements, and similar pairs are flagged. | REQ-14 |
