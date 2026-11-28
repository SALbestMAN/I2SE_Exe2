# Technical tools report

We wanted no server of our own to run or pay for, and no build step. So the site is plain files on GitHub Pages, and Supabase does everything that needs a server. Before we chose each tool, we tried it for real. This report says what we tried and what happened.

## The tools we use

| Tool | What it does for us | How we tested it | Result |
| --- | --- | --- | --- |
| **Supabase database** (PostgreSQL) | Stores all the data and runs the check-in checks, so a phone can't skip them | Loaded our real `schema.sql` into PostgreSQL 16 and ran 39 tests against it | 39 of 39 pass |
| **Supabase Auth** with Google | Sign-in with the university Google account | Signed in as a lecturer and as a student on the live site. Two tests check that a student can't pretend to be someone else | Works |
| **Supabase Storage** | Keeps slides and homework files | Uploaded slides and homework on the live site and opened them again | Works |
| **Supabase Edge Function** | Sends a Zoom or Drive recording to Gemini in pieces | Deployed it and made summaries from Zoom links | Works |
| **Google Gemini** | Lecture summaries and homework reviews | Made real summaries and reviews with a free key | Works. A transcript takes about a minute, a long video a few minutes |
| **qrcode-generator** | Draws the QR code on the projector 5 times a second | Took a screenshot of the projector and decoded it with OpenCV | Decodes to a valid signed frame |
| **jsQR** | Reads the code from the phone's camera | Checked in with real phones in front of a projector | Works in a few seconds |
| **SheetJS** | Reads the Moodle student list, exports attendance to Excel | Imported a Moodle export with Hebrew headers and exported the sheet. 8 unit tests cover the import | Works |
| **pdf.js, pdf-lib** | Shows PDF slides and saves them with the lecturer's drawings | Uploaded a lecture PDF, drew on it and downloaded it | Works |
| **GitHub Pages** | Hosts the site over HTTPS, which the camera needs | Runs our live site | Works |
| **Playwright** | Opens the real pages in a test browser, on a laptop and a phone size | 7 end-to-end tests | 7 of 7 pass |
| **Node.js test runner** | Tests our JavaScript without a browser | 16 unit tests | 16 of 16 pass |
| **Mermaid** | Diagrams written as text that GitHub draws | All the diagrams in our documents | Works |
| **Claude** (AI coding assistant) | Helped us write pages, SQL and tests | Used through the whole project | Much faster. We still read and test everything it writes |

## What we tried and didn't pick

| Option | Why not |
| --- | --- |
| Our own Node or Python server | More to build, host and secure, and it costs money. Supabase gives us sign-in, a database and storage ready to use |
| React or another framework | Needs a build step. Plain JavaScript is easier to read and hand over |
| A fixed QR code, or one that changes every 30 seconds | A photo sent to a friend works from home. A code that changes 5 times a second and must be filmed live doesn't |
| One shared AI key on a server | We would pay for it and have to protect it. Each lecturer's own free key costs us nothing |

## Do our tests catch real bugs?

We broke the code on purpose twice. First, we let the database accept a sped-up video. Second, we counted a first check as "partial" while the second check was still open. Both times, exactly one test failed (TC-08 and TC-53). So the tests catch real mistakes.
