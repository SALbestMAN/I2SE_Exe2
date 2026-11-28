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

