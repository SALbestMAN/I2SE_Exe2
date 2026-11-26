# Tests (62)

| Folder | Level | Count | Needs | Run |
| --- | --- | --- | --- | --- |
| db/ | Database: the real `supabase/schema.sql` on PostgreSQL | 39 | PostgreSQL 14+ and `psql` | `tests/db/run.sh` |
| unit/ | Browser scripts in a Node sandbox (no network) | 16 | Node 18+ | `node --test tests/unit/unit.test.js` |
| e2e/ | Real pages in headless Chromium, sample data | 7 | Node, Playwright, Python + OpenCV (for the QR test) | `tests/e2e/serve-test-site.sh` in one terminal, then `node --test --test-concurrency=1 tests/e2e/e2e.test.js` |

Test IDs TC-01 to TC-62 match [docs/09-testing-strategy.md](../docs/09-testing-strategy.md). Results of the last run (26 Nov 2026): 62 / 62 pass. Full output in `results/`.
The sample data uses invented names and @x.com addresses only.
