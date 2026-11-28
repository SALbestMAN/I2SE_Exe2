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

