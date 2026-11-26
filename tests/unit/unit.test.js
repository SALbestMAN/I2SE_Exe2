// =============================================================================
// Unit tests for the app's pure logic: CSV import, frame parsing, attendance status, export, translations.
// =============================================================================
const test = require("node:test"), assert = require("node:assert/strict");
const load = require("./load.js");
const c = load(["js/api-supabase.js", "js/csv.js", "js/export.js", "js/i18n-strings.js"]);
const API = c.get("API"), CSV = c.get("CSV"), ATT = c.get("ATT"), STR = c.get("I18N_STRINGS");
const plain = (x) => JSON.parse(JSON.stringify(x));

// =============================================================================
// CSV (roster import)
// =============================================================================
test("TC-40 CSV.parse: quotes, doubled quotes, commas and newlines inside quotes, BOM, CRLF", () => {
  const rows = CSV.parse('﻿name,note\r\n"Clarke, Emma","said ""hi""\nthen left"\r\n\r\nOliver,x');
  assert.deepEqual(plain(rows), [["name", "note"], ["Clarke, Emma", 'said "hi"\nthen left'], ["Oliver", "x"]]);
});
test("TC-41 CSV.guess: Moodle export in Hebrew finds first/last/email/group", () => {
  const m = CSV.guess([["שם פרטי", "שם משפחה", 'דוא"ל', "קבוצות"]]);
  assert.deepEqual(plain(m), { first: 0, last: 1, email: 2, group: 3 });
});
test("TC-42 CSV.guess: English and Arabic headers", () => {
  assert.deepEqual(plain(CSV.guess([["First name", "Surname", "E-mail", "Section"]])), { first: 0, last: 1, email: 2, group: 3 });
  assert.deepEqual(plain(CSV.guess([["الاسم الأول", "اسم العائلة", "البريد الإلكتروني", "المجموعة"]])), { first: 0, last: 1, email: 2, group: 3 });
});
test("TC-43 CSV.guess: no email header -> picks the column that holds emails", () => {
  const rows = [["Name", "Contact"], ["Emma Clarke", "emma@uni.ac.il"], ["Oliver Grant", "oliver@uni.ac.il"]];
  assert.equal(CSV.guess(rows).email, 1);
});
test("TC-44 CSV.build: cleans, lower-cases, drops duplicates and students already listed, reports bad rows", () => {
  const rows = [["First", "Last", "Email"],
    ["  Emma ", "Clarke", "Emma@Uni.ac.il "], ["Emma", "Clarke", "emma@uni.ac.il"],   // duplicate
    ["Oliver", "Grant", "oliver@uni.ac.il"],                                          // already on the list
    ["", "", "nobody@uni.ac.il"], ["Ava", "Mitchell", "not-an-email"], ["Lucas", "Martin", "lucas@uni.ac.il"]];
  const r = CSV.build(rows, CSV.guess(rows), ["OLIVER@uni.ac.il"]);
  assert.deepEqual(plain(r.students.map((s) => s.email)), ["emma@uni.ac.il", "lucas@uni.ac.il"]);
  assert.equal(r.students[0].name, "Emma Clarke");
  assert.equal(r.duplicates, 1); assert.equal(r.alreadyListed, 1);
  assert.deepEqual(plain(r.issues.map((i) => [i.row, i.problem])), [[5, "Name is missing"], [6, "Email looks wrong"]]);
});
test("TC-45 CSV.build: one full-name column is split into first and last", () => {
  const rows = [["Full name", "Email"], ["Grace Anne Holloway", "grace@uni.ac.il"]];
  const s = CSV.build(rows, CSV.guess(rows)).students[0];
  assert.equal(s.firstName, "Grace"); assert.equal(s.lastName, "Anne Holloway");
});
test("TC-46 CSV: no column holds ID numbers after import", () => {
  const rows = [["First", "Last", "ID number", "Email"], ["Emma", "Clarke", "123456789", "emma@uni.ac.il"]];
  const s = CSV.build(rows, CSV.guess(rows)).students[0];
  assert.ok(!JSON.stringify(s).includes("123456789"));
});
test("TC-47 CSV.hwList: Google Form hand-ins - link column, empty answers, pair emails, later answer wins", () => {
  const rows = [["Timestamp", "Email Address", "Link to your repository", "Additional materials (optional)"],
    ["1", "emma@uni.ac.il", "https://github.com/emma/ex2", "no"],
    ["2", "noah@uni.ac.il, zoe@uni.ac.il", "https://github.com/noah/ex2 extra words", "-"],
    ["3", "emma@uni.ac.il", "https://github.com/emma/ex2-final", "https://youtu.be/x"]];
  const r = CSV.hwList(rows);
  assert.equal(r.columns.link, "Link to your repository");
  const by = Object.fromEntries(r.rows.map((x) => [x.email, x]));
  assert.equal(by["emma@uni.ac.il"].link, "https://github.com/emma/ex2-final");
  assert.equal(by["emma@uni.ac.il"].extra, "https://youtu.be/x");
  assert.equal(by["noah@uni.ac.il"].link, "https://github.com/noah/ex2");
  assert.equal(by["zoe@uni.ac.il"].link, "https://github.com/noah/ex2");
  assert.equal(r.rows.length, 3);
});

// =============================================================================
// QR frames
// =============================================================================
test("TC-48 API.parseFrame: reads a valid frame and its signed body", () => {
  assert.deepEqual(plain(API.parseFrame("CP1|1bc3e4b0|2|17|1764180000000|a1b2c3d4e5f6")),
    { sessionId: "1bc3e4b0", round: 2, n: 17, t: 1764180000000, sig: "a1b2c3d4e5f6", body: "CP1|1bc3e4b0|2|17|1764180000000" });
});
test("TC-49 API.parseFrame: rejects other QR codes", () => {
  for (const raw of ["https://example.com", "CP2|a|1|1|1|s", "CP1|a|1|1|1", "CP1|a|1|1|1|s|extra", ""]) assert.equal(API.parseFrame(raw), null, raw);
});
test("TC-50 API.RULES match the numbers in submit_scan (schema.sql)", () => {
  const sql = require("fs").readFileSync((process.env.SITE || require("path").join(__dirname, "../..")) + "/supabase/schema.sql", "utf8");
  assert.equal(API.RULES.MIN_FRAMES, 6); assert.match(sql, /n >= 6/);
  assert.equal(API.RULES.MAX_AGE_MS, 3000); assert.match(sql, /max_age := 3000/);
  assert.equal(API.RULES.MIN_SPAN_MS, 1000); assert.match(sql, /span >= 1000/);
  assert.equal(API.RULES.MAX_DISTANCE_M, 300); assert.match(sql, /dist <= 300/);
  assert.equal(API.RULES.FRAME_MS, 200); assert.match(sql, /i \* 200/);
});

// =============================================================================
// Attendance status
// =============================================================================
const NOW = Date.now();
const sess = (att, recheck) => ({ attendance: att, recheck });
test("TC-51 statusOf: no record = Absent, one check without a second check = Present", () => {
  assert.equal(API.statusOf(sess({}), "emma@uni.ac.il"), "A");
  assert.equal(API.statusOf(sess({ "emma@uni.ac.il": { check1: { time: 1 } } }), "Emma@uni.ac.il"), "P");
});
test("TC-52 statusOf: after the second check, both = Present, one = Partial", () => {
  const done = { startedAt: NOW - 120000, window: 60 };
  assert.equal(API.statusOf(sess({ e: { check1: {}, check2: {} } }, done), "e"), "P");
  assert.equal(API.statusOf(sess({ e: { check1: {} } }, done), "e"), "H");
  assert.equal(API.statusOf(sess({ e: { check2: {} } }, done), "e"), "H");
});
test("TC-53 statusOf: while the second check is still open, a first check still counts as Present", () => {
  const active = { startedAt: NOW - 5000, window: 60 };
  assert.equal(API.statusOf(sess({ e: { check1: {} } }, active), "e"), "P");
});

// =============================================================================
// Export
// =============================================================================
test("TC-54 ATT.build: % per student with partial = 0.5, sorted by name, planned sessions skipped", async () => {
  const done = { startedAt: NOW - 120000, window: 60 };
  API.listSessions = async () => [
    { id: "s1", number: 1, startedAt: NOW - 9e6, attendance: { "a@x.io": { check1: {}, check2: {} }, "b@x.io": { check1: {} } }, recheck: done, blocked: [] },
    { id: "s2", number: 2, startedAt: NOW - 3e6, attendance: { "a@x.io": { check1: {} } }, blocked: [] },
    { id: "s3", number: 3, startedAt: null, attendance: {}, blocked: [] }];
  API.getRoster = async () => [{ email: "b@x.io", name: "Zoe Hartley", firstName: "Zoe", lastName: "Hartley" },
    { email: "a@x.io", name: "Ava Mitchell", firstName: "Ava", lastName: "Mitchell" }, { email: "r@x.io", name: "Req", status: "request" }];
  const d = await ATT.build({ id: "c" });
  assert.equal(d.cols.length, 2);
  assert.deepEqual(d.rows.map((r) => [r.name, r.marks.join(""), r.pct]), [["Ava Mitchell", "PP", "100%"], ["Zoe Hartley", "HA", "25%"]]);
});

// =============================================================================
// Translations
// =============================================================================
// =============================================================================
// A translation may drop a placeholder only for the singular ("{0} minute" -> "דקה": Hebrew says "one minute" without the 1)
// =============================================================================
test("TC-55 every phrase has both Hebrew and Arabic, and never invents a {n} placeholder", () => {
  const bad = [];
  for (const [en, v] of Object.entries(STR)) {
    if (!Array.isArray(v) || v.length < 2 || !v[0] || !v[1]) { bad.push(en); continue; }
    const ph = (s) => new Set(s.match(/\{\d\}/g) || []);
    for (const t of v.slice(0, 2)) for (const p of ph(t)) if (!ph(en).has(p)) bad.push(en);
  }
  assert.deepEqual(bad, []);
});
