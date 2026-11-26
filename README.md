<p align="right">
  <img src="https://github.com/user-attachments/assets/ddbb6961-2f80-4a1b-a36d-208701f05dec" width="170"/>
</p>

# Ex2: Vibe Coding & Deep Designing: Web-based Teaching Tool


https://github.com/user-attachments/assets/51f12456-cc6f-40f1-ab99-084d2b47395a


This project is a browser based tool for lecturers and students to manage a course and take part in live classes. It includes course pages, attendance check in, polls, questions, homework, and lecturer tools.

## Problem and project scope

### Problem

Class activities such as attendance, questions, polls, course materials, and homework can be spread across separate tools. This project brings these activities into one website for students and lecturers. The repository does not include a user study or other evidence about how often this problem occurs, so this statement describes the project's purpose rather than a measured finding.

### Project scope

The project covers a browser based teaching tool with student and lecturer pages. The current code includes course pages, live sessions, QR based attendance check in, attendance views and exports, polls, questions, homework pages, and AI assisted summaries or submission review when configured. The site uses HTML, CSS, and JavaScript, connects to Supabase for sign in and shared data, and can call Google Gemini for optional AI features.

The scope is limited to the software in this repository and its documented integrations. It does not include operating a production service, providing hosting or support, creating external service accounts, or promising uptime, scale, dates, or costs. Deployment details and backend rules need confirmation; the checked in `supabase/schema.sql` currently contains HTML instead of the database schema.

The separate [Scope of Work](docs/scope-of-work.md) describes the deliverables, boundaries, and open decisions in more detail.

The front end uses HTML, CSS, and JavaScript. It connects to Supabase for sign in and shared course data. Some features also connect to Google Gemini. See [the technical tools report](docs/technical-tools-report.md) before setting up external services.

