// Test-only data layer: same shapes as js/api-supabase.js, sample data, nothing saved.
var API = (() => {
  const ROLE = new URLSearchParams(location.search).get("as") || (location.pathname.includes("/student/") ? "student" : "lecturer");
  const me = ROLE === "student" ? { role: "student", name: "Emma Clarke", email: "emma@x.com" } : { role: "lecturer", name: "Dr. Daniel Reed", email: "lec@x.com" };
  const now = () => Date.now(), H = 3600e3, D = 24 * H;
  const admins = {};
  const courses = [
    { id: "c1", code: "ABC123", name: "Intro to Software Engineering", day: "Sun", time: "10:00", room: "2.14", schedule: [{ day: "Sun", time: "10:00", place: "2.14" }, { day: "Tue", time: "14:00", place: "Online" }] },
    { id: "c2", code: "QWE456", name: "Operating Systems", day: "Mon", time: "12:00", room: "1.03" },
    { id: "c3", code: "ZXC789", name: "Data Structures", day: "Tue", time: "09:00", room: "3.10" },
    { id: "c4", code: "RTY111", name: "Computer Networks", day: "Wed", time: "14:00", room: "" },
    { id: "c5", code: "UIO222", name: "Linear Algebra 2", day: "Thu", time: "08:30", room: "0.2" }];
  const NAMES = ["Emma Clarke", "Lucas Martin", "Grace Holloway", "Oliver Grant", "Ava Mitchell", "Leo Fischer", "Noah Parker", "Isla Morgan", "Ethan Brooks", "Mia Novak", "Hugo Laurent", "Zoe Hartley", "Felix Weber", "Clara Jensen"];
  const roster = NAMES.map((name, i) => ({ name, firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" "), group: String(1 + (i % 3)), email: (i ? name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "s" + i : "emma") + "@x.com", studentId: "", status: i === 13 ? "request" : i > 10 ? "listed" : "joined", addedVia: i % 3 ? "csv" : "manual" }));
  { const w = new URLSearchParams(location.search).get("who"); const r = w && roster.find((x) => x.email.startsWith(w)); if (r) { me.name = r.name; me.email = r.email; } }
  const rec = (t, i) => ({ time: t, codeAge: 400 + i * 130, frames: 10, network: i % 7 === 5 ? "unknown" : "match", distance: 8 + i * 3, flags: i % 7 === 5 ? ["Couldn't compare the network (IPv4/IPv6)"] : [], ping: i % 5 === 4 ? 1840 : 90 + i * 22,
    framesSeen: Array.from({ length: 10 }, (_, k) => [120 + i + k * 2, t - 2600 + k * 220]) });
  function mkSession(n, opts) {
    const startedAt = opts.startedAt ?? null, att = {};
    if (startedAt) roster.filter((r) => r.status !== "request").forEach((r, i) => {
      if ((i + n) % 6 === 0) return;                                   // absent
      att[r.email] = { check1: rec(startedAt + 60e3 + i * 21e3, i) };
      if (opts.recheckStarted && (i + n) % 4 !== 1) att[r.email].check2 = rec(opts.recheckStarted + 5e3 + i * 3e3, i);
    });
    return { id: "s" + n, short: "s" + n, courseId: "c1", number: n, title: opts.title || `Lecture ${n}`, scheduledAt: opts.scheduledAt || startedAt, mode: opts.mode || "class",
      checkWifi: true, checkLocation: true, secondCheck: true, checkin: opts.checkin || "closed", paused: opts.checkin === "paused", openedAt: startedAt, startedAt, endedAt: opts.endedAt ?? null,
      state: opts.endedAt ? "ended" : startedAt ? "live" : "planned", ctx: { ip: "saved", lat: 32.1, lng: 35.2 },
      recheck: { mode: opts.rmode || "after", afterMin: 40, at: null, plannedAt: startedAt ? startedAt + 40 * 60e3 : null, startedAt: opts.recheckStarted || null, window: 60 },
      attendance: att, blocked: startedAt && n === 3 ? [{ email: "oliver@x.com", time: startedAt + 9 * 60e3, round: 1, reasons: ["Class Wi-Fi"], framesSeen: [] }] : [] };
  }
  const t0 = now();
  const sessions = [
    mkSession(1, { title: "Course overview", startedAt: t0 - 21 * D, endedAt: t0 - 21 * D + 2 * H, recheckStarted: t0 - 21 * D + 45 * 60e3 }),
    mkSession(2, { title: "Requirements and SRS", startedAt: t0 - 14 * D, endedAt: t0 - 14 * D + 2 * H, recheckStarted: t0 - 14 * D + 50 * 60e3 }),
    mkSession(3, { title: "Use cases", startedAt: t0 - 7 * D, endedAt: t0 - 7 * D + 2 * H, recheckStarted: t0 - 7 * D + 40 * 60e3 }),
    mkSession(4, { title: "Class and sequence diagrams", startedAt: t0 - 18 * 60e3, checkin: "open", rmode: "manual" }),
    mkSession(5, { title: "Testing strategy", scheduledAt: t0 + 7 * D, mode: "class" }),
    mkSession(6, { title: "Guest talk", scheduledAt: t0 + 14 * D, mode: "online" })];
  const recheckState = (s) => { if (!s.recheck) return { enabled: false }; const r = s.recheck, endsAt = r.startedAt ? r.startedAt + r.window * 1000 : null;
    return { enabled: true, mode: r.mode, afterMin: r.afterMin, at: r.at, window: r.window, plannedAt: r.plannedAt, startedAt: r.startedAt, endsAt, active: !!r.startedAt && now() < endsAt, done: !!r.startedAt && now() >= endsAt }; };
  const statusOf = (s, email) => { const x = s.attendance[email]; if (!x || (!x.check1 && !x.check2)) return "A"; const r = recheckState(s);
    if (!r.enabled || !r.startedAt) return "P"; if (r.active) return x.check1 ? "P" : "H"; return x.check1 && x.check2 ? "P" : "H"; };
  const result = { title: "Class and sequence diagrams", overview: "The lecture introduced UML class diagrams and how they describe the static structure of a system, then moved to sequence diagrams for showing how objects talk to each other over time. The lecturer walked through the attendance example from Ex2 and showed common modelling mistakes.",
    topics: [{ time: "00:04", title: "Why we model before coding", points: ["A diagram is a cheap way to find design mistakes", "Models are for people first, tools second"] },
             { time: "00:21", title: "Class diagrams", points: ["Classes, attributes and operations", "Association, aggregation and composition", "Inheritance is not the default tool"] },
             { time: "00:58", title: "Sequence diagrams", points: ["Lifelines and messages", "One diagram per use case scenario"] }],
    terms: [{ term: "Composition", explanation: "A whole owns its parts; the parts do not live without it." }, { term: "Lifeline", explanation: "The vertical line of one participant in a sequence diagram." }],
    questions: ["When would you choose composition over inheritance?", "Draw the sequence diagram for a student checking in.", "What does multiplicity 0..* mean on an association?"] };
  let summaries = [
    { id: "m1", courseId: "c1", label: "Lecture 4, 16 Nov", source: "link", fileName: "ariel.zoom.us/rec/share/0Klb898", spoken: "Hebrew with English terms", outLang: "English", status: "ready", step: "", error: null, result: { title: "Composition vs. inheritance", durationSec: 5632, link: "https://zoom.us/rec/share/abc", recap: "The lecture compared composition with inheritance through the Car example. The lecturer stressed choosing has-a when parts can change, and warned against deep class trees. The second half moved to sequence diagrams for the check-in flow.", nextSteps: [{ who: "Lecturer", items: ["Upload the slides with today’s drawings."] }, { who: "Students", items: ["Redo exercise 3 using composition.", "Bring one design question on Sunday."] }], sections: [{ title: "Composition over inheritance", time: "00:04:20", text: "The lecturer showed why a Car has an Engine rather than being one, and how swapping parts stays easy with composition." }, { title: "When is-a breaks", time: "00:31:10", text: "A short example of a class tree that grew too deep, and how it was flattened." }, { title: "Sequence diagrams for check-in", time: "00:58:00", text: "Lifelines and messages, drawn step by step for a student checking in." }] }, shared: true, createdAt: t0 - 2 * H, updatedAt: t0 - 2 * H },
    { id: "m2", courseId: "c1", label: "Lecture 3, 9 Nov", source: "upload", fileName: "lecture3.m4a", spoken: "Hebrew", outLang: "Hebrew", status: "ready", step: "", error: null, result: { ...result, title: "Use cases" }, shared: false, createdAt: t0 - 7 * D, updatedAt: t0 - 7 * D },
    { id: "m3", courseId: "c1", label: "Other recording", source: "link", fileName: "ariel-ac-il.zoom.us/rec/play/LGC0AziVCom9", spoken: "Hebrew", outLang: "Hebrew", status: "error", step: "", error: 'The "fetch-recording" server function isn\'t set up yet (see the README).', result: null, shared: false, createdAt: t0 - 9 * D, updatedAt: t0 - 9 * D }];
  const rubric = [{ name: "Score", points: 100 }];
  const assignments = [
    { id: "a1", courseId: "c1", title: "Ex2: Class diagram for the attendance app", instructions: "Draw the class diagram for the attendance feature. Include the lecturer, student, session and check-in classes.", due: "2026-11-23", rubric, insights: { common_mistakes: [{ issue: "Inheritance used where composition fits" }, { issue: "Missing multiplicities" }], at: t0 - D }, createdAt: t0 - 6 * D },
    { id: "a2", courseId: "c1", title: "Ex1: SRS draft", instructions: "Write the SRS for your project.", due: "2026-11-09", rubric, insights: null, createdAt: t0 - 20 * D }];
  const review = (k) => { const reqs = [["Class diagram for every feature", "done"], ["Lecturer, student, session and check-in classes", "done"], ["Multiplicities on every association", k % 3 ? "done" : "partial"], ["CheckIn linked to Session", k % 2 ? "done" : "missing"]];
    const sc = Math.round(100 * reqs.reduce((n, r) => n + (r[1] === "done" ? 1 : r[1] === "partial" ? .5 : 0), 0) / reqs.length) - (k % 3);
    return { criteria: [{ name: "Score", score: sc, max: 100, feedback: "" }], requirements: reqs.map(([item, status]) => ({ item, status, note: status === "missing" ? "Not in the diagram" : status === "partial" ? "Two are missing" : "" })),
    strengths: ["Clear class names", "Good use of composition"], improvements: k % 2 ? [] : ["Link CheckIn to Session"], tips: ["Group related classes together so lines don't cross."], summary: "A solid diagram that covers the core of the feature.", approach: "Started from the nouns in the requirements.",
    team: k === 2 ? { alone: false, names: ["Noah Parker", "Grace Holloway"], where: "README" } : { alone: true, names: [], where: "first page" } }; };
  const submissions = roster.slice(0, 8).map((r, i) => ({ id: "u" + i, assignmentId: "a1", email: r.email, name: r.name, createdAt: t0 - (i + 2) * H, fileName: i % 2 ? "diagram.pdf" : "Pasted text", kind: i % 2 ? "pdf" : "text", text: "class Student { ... }", status: i === 6 ? "reviewing" : i === 7 ? "error" : "reviewed", review: i < 6 ? review(i) : null, error: i === 7 ? "Gemini is busy right now. Try again in a minute." : null }));
  const hws = [];
  if (new URLSearchParams(location.search).get('deck')) sessions[3].deck = { path: 'p/test.pdf', name: 'Lecture4_diagrams.pdf', pages: 3, slide: +new URLSearchParams(location.search).get('deck') };
  const totalOf = (rv) => (rv?.criteria || []).reduce((s, c) => s + (Number(c.score) || 0), 0);
  let poll = { id: "p1", question: "Which relationship means the part cannot live without the whole?", options: ["Association", "Aggregation", "Composition", "Inheritance"], createdAt: t0 - 60e3, open: true, secondsLeft: 74, counts: [1, 3, 6, 1], total: 11, myVote: null };
  const comments = [
    { id: "q1", text: "Can you show the sequence diagram for the second check again?", createdAt: t0 - 5 * 60e3, answered: false, votes: 6, mine: false, upvotedByMe: true, author: "Anonymous" },
    { id: "q2", text: "Do we need to draw getters in the class diagram?", createdAt: t0 - 9 * 60e3, answered: false, votes: 3, mine: true, upvotedByMe: false, author: "Emma Clarke" },
    { id: "q3", text: "Is the homework due before the next lecture?", createdAt: t0 - 14 * 60e3, answered: true, votes: 2, mine: false, upvotedByMe: false, author: "Grace Holloway", reply: "Yes. Hand it in by Sunday 23 November, before the lecture.", repliedAt: t0 - 3 * 60e3 }];
  const view = async (c) => c && ({ ...c, soft: "#EDEDF0", ink: "#1D1D1F", short: c.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase(), students: c.id === "c1" ? 13 : 20 + c.name.length, joined: 11, requests: c.id === "c1" ? 1 : 0, sessionsCount: c.id === "c1" ? 6 : 4, live: c.id === "c1", held: c.id === "c1" ? 4 : 3, next: { at: Date.now() + (c.id === "c1" ? 1 : 2) * 864e5, number: c.id === "c1" ? 7 : 5, title: c.id === "c1" ? "Lecture 7" : "Design patterns" }, lecture: 4 });
  const sessOf = (id) => sessions.filter((s) => s.courseId === id);
  const stats = async (id) => { const s = sessions.find((x) => x.id === id), list = roster.filter((x) => x.status !== "request"), names = Object.fromEntries(list.map((x) => [x.email, x.name])), e = Object.entries(s.attendance);
    return { session: s, rosterSize: list.length, round: 1, recheck: recheckState(s), checkedIn: e.length, secondCheck: e.filter(([, r]) => r.check2).length, blocked: s.blocked.length,
      arrivals: e.map(([email, r]) => ({ email, name: names[email], time: r.check1.time, round: 1 })).sort((a, b) => b.time - a.time) }; };
  const requests = [
    { id: "r1", sessionId: "s4", number: 4, title: "Class and sequence diagrams", startedAt: t0 - 18 * 60e3, email: "oliver@x.com", name: "Oliver Grant", group: "1", reason: "My phone's camera wouldn't open, I'm in the third row.", status: "pending", createdAt: t0 - 4 * 60e3 },
    { id: "r2", sessionId: "s3", number: 3, title: "Use cases", startedAt: t0 - 7 * D, email: "ethan@x.com", name: "Ethan Brooks", group: "3", reason: "My phone had no internet.", status: "pending", createdAt: t0 - 7 * D + 3 * H },
    { id: "r3", sessionId: "s2", number: 2, title: "Requirements and SRS", startedAt: t0 - 14 * D, email: "noah@x.com", name: "Noah Parker", group: "1", reason: "Battery died.", status: "approved", createdAt: t0 - 14 * D + H }];
  const myReq = {};
  let fn = 0;
  const base = {
    ready: true, isRemote: true, now, RULES: { FRAME_MS: 200, MIN_FRAMES: 6, MIN_SPAN_MS: 1000, MAX_AGE_MS: 3000, MAX_DISTANCE_M: 300, RECHECK_WINDOW_S: 60 },
    getSession: () => me, checkAuth: async () => true, logout() {}, onChange(cb, ms = 2500) { let r = false; setInterval(async () => { if (r || document.hidden) return; r = true; try { await cb(); } catch (e) {} finally { r = false; } }, ms); }, newCode: () => "K7Q2PX", totalOf, recheckState, statusOf, view,
    normEmail: (e) => String(e || "").trim().toLowerCase(), cleanName: (n) => String(n || "").trim(), isValidEmail: (e) => /@/.test(e),
    parseFrame: (raw) => { const p = String(raw).split("|"); return p.length === 6 ? { sessionId: p[1], round: +p[2], n: +p[3], t: +p[4] } : null; },
    listCourses: async () => (window.MOCK_EMPTY ? [] : courses), myCourses: async () => (window.MOCK_EMPTY ? [] : courses.slice(0, 4)),
    getCourseByCode: async (code) => courses.find((c) => c.code === code) || null,
    getRoster: async (id) => { const O = { c2: "Tom Becker", c3: "Nina Rossi", c4: "Sam Whitfield", c5: "Julia Moreau" }; return !O[id] ? roster : roster.map((r) => r.status === "request" ? { ...r, name: O[id], firstName: O[id].split(" ")[0], lastName: O[id].split(" ")[1], email: O[id].split(" ")[0].toLowerCase() + "@x.com" } : r); }, listSessions: async (id) => sessOf(id), getSessionById: async (id) => sessions.find((s) => s.id === id) || null,
    activeSession: async (id) => sessOf(id).find((s) => s.state === "live") || null, sessionStats: stats,
    myRecord: async (id) => sessions.find((s) => s.id === id)?.attendance[me.email] || {},
    frameKey: async (id) => { window.__fk = (window.__fk || 0) + 1; return { now: now(), short: "s4", secret: "a1b2c3", state: "open", started: now() - 60000, recheckStarted: null, recheckWindow: 60 }; },
    listHwStudents: async (id) => hws.filter((h) => h.assignmentId === id),
    addHwStudents: async (id, rows) => { let added = 0; rows.forEach((r) => { const e = r.email ? String(r.email).toLowerCase() : null; const ex = e && hws.find((h) => h.assignmentId === id && h.email === e);
      if (ex) { if (r.link) ex.link = r.link; } else { const hid = "h" + (hws.length + 1); hws.push({ id: hid, assignmentId: id, email: e || "", name: r.name || "", group: r.group || "", link: r.link || "", extra: r.extra || "", key: e || "row-" + hid }); added++; } });
      return { added, updated: rows.length - added }; },
    removeHwStudent: async (id) => { const i = hws.findIndex((h) => h.id === id); if (i >= 0) hws.splice(i, 1); },
    updateHwStudent: async (id, p) => Object.assign(hws.find((h) => h.id === id), p),
    myHwRow: async (aid, e) => hws.find((h) => h.assignmentId === aid && h.email === e) || null,
    homeworkURL: async () => "/test.pdf", deckURL: async (p) => "/test.pdf",
    submitHomework: async (aid, email, o) => { const i = submissions.findIndex((s) => s.assignmentId === aid && s.email === email); if (i >= 0) submissions.splice(i, 1);
      const s = { id: "u" + Math.random().toString(36).slice(2, 7), assignmentId: aid, email, name: email, createdAt: Date.now(), fileName: o.fileName || o.file?.name || "", kind: o.kind, text: o.text || "", status: "reviewing", review: null, link: o.link || "", extra: o.extra || "", filePath: o.file ? "x/" + o.file.name : null, uploadedBy: o.byLecturer ? "lec@x.com" : "" };
      submissions.push(s); window.__submitted = (window.__submitted || 0) + 1; return { ok: true, submission: s }; },
    setSubmission: async (id, p) => { Object.assign(submissions.find((s) => s.id === id) || {}, p); },
    listMaterials: async () => window.__mats || [], addMaterial: async (c, sid, m) => { (window.__mats ||= []).push({ id: "m" + Date.now(), title: m.title, kind: m.kind, path: "x/" + m.fileName, size: m.blob.size, createdAt: Date.now() }); window.__shared = (window.__shared || 0) + 1; },
    removeMaterial: async (m) => { window.__mats = (window.__mats || []).filter((x) => x.id !== m.id); }, materialURL: async () => "/test.pdf",
    uploadDeck: async (s, f, pages, kind = "pdf") => { const x = sessions.find((q) => q.id === s.id) || sessions[3]; x.deck = { path: "p/" + f.name, name: f.name, pages, slide: 1, kind }; window.__deck = x.deck; return x.deck.path; },
    setSlide: async (id, n) => { window.__slide = n; },
    removeDeck: async () => { sessions[3].deck = null; window.__deck = null; }, cleanupDecks: async () => {},
    logFrames: async (id, frames) => { window.__logged = (window.__logged || 0) + frames.length; },
    getFrames: async (id, from, count) => ({ now: now(), frames: Array.from({ length: count }, (_, i) => ({ raw: `CP1|s4|1|${from + i}|${now() + i * 200}|abcdef123456`, t: now() + i * 200 })) }),
    listFrames: async () => Array.from({ length: 240 }, (_, i) => ({ n: i + 1, round: 1, t: t0 - 15 * 60e3 + i * 200, raw: `CP1|s4|1|${i + 1}|${t0}|abcdef123456` })),
    setSessionContext: async () => ({ ip: true, location: true }), currentPoll: async () => poll, vote: async (pid, em, i) => { poll = { ...poll, myVote: i, counts: poll.counts.map((c, k) => c + (k === i ? 1 : 0)), total: poll.total + 1 }; return { ok: true }; }, toggleUpvote: async (id) => { const c = comments.find((x) => x.id === id); if (c) { c.myVote = !c.myVote; c.votes += c.myVote ? 1 : -1; } return { ok: true }; }, closePoll: async () => { poll = { ...poll, open: false, secondsLeft: 0 }; }, listComments: async (cid) => { const X = { c2: [["What is the difference between a process and a thread?", 5], ["Will the deadlock example be in the exam?", 2]], c3: [["Why is a hash table lookup O(1) on average?", 4]], c4: [["Can you go over the three-way handshake again?", 7], ["Is UDP ever used for video calls?", 1]], c5: [["How do we know a matrix is diagonalizable?", 3]] };
      if (!X[cid]) return comments; return X[cid].map(([text, votes], i) => ({ ...comments[0], id: cid + "q" + i, text, votes, answered: false, reply: null, createdAt: comments[0].createdAt - (i + 1) * 37 * 60e3 })); }, addComment: async (cid, email, text, anonymous) => { comments.unshift({ id: 'n' + Date.now(), text, votes: 0, createdAt: Date.now(), mine: true, anonymous, author: 'You' }); return { ok: true }; },
    listSummaries: async (id, o) => summaries.filter((s) => s.courseId === id && (!o?.sharedOnly || (s.shared && s.status === "ready"))),
    deleteSummary: async (id) => { summaries = summaries.filter((s) => s.id !== id); },
    listAssignments: async (id) => assignments.filter((a) => a.courseId === id), getAssignment: async (id) => assignments.find((a) => a.id === id) || null, setInsights: async (id, ins) => { const x = assignments.find((a) => a.id === id); if (x) x.insights = { ...ins, at: Date.now() }; },
    listSubmissions: async (id) => submissions.filter((s) => s.assignmentId === id), mySubmission: async (id) => submissions.find((s) => s.assignmentId === id && s.email === me.email) || null,
    classStats: async () => { const tot = submissions.filter((s) => s.review).map((s) => totalOf(s.review)); return { n: tot.length, max: 100, totals: tot, avg: tot.reduce((a, b) => a + b, 0) / tot.length, perCriterion: { Correctness: 43, Notation: 24.5, Clarity: 16.5 } }; },
    joinCourse: async () => ({ status: "request", course: courses[4] }), beginScan: async () => ({ ok: true, round: 1 }),
    quickSession: async () => sessions[3], setGroup: async () => {},
    replyComment: async (id, text) => { const c = comments.find((x) => x.id === id); c.reply = text || null; if (text) c.answered = true; },
    myAttendance: async () => sessions.filter((x) => x.startedAt).map((x) => { const r = x.attendance[me.email] || {}; return { id: x.id, number: x.number, title: x.title, startedAt: x.startedAt, endedAt: x.endedAt, mode: x.mode,
      check1: !!r.check1, check2: !!r.check2, check1At: r.check1?.time || null, check2At: r.check2?.time || null, secondCheckHappened: !!x.recheck.startedAt, status: myReq[x.id] === "approved" ? "P" : statusOf(x, me.email), request: myReq[x.id] || null }; }),
    setAttendance: async (sid, email, st) => { const x = sessions.find((s) => s.id === sid); if (st === "A") delete x.attendance[email]; else { x.attendance[email] = { check1: { time: Date.now(), network: "manual", flags: ["Set by the lecturer"], frames: 0, codeAge: 0 }, ...(st === "P" && x.recheck?.startedAt ? { check2: { time: Date.now(), network: "manual", flags: ["Set by the lecturer"], frames: 0, codeAge: 0 } } : {}) }; } return { ok: true }; },
    requestAttendance: async (id, reason) => { if (!String(reason).trim()) return { ok: false, error: "Write why you couldn't check in" }; myReq[id] = "pending"; return { ok: true }; },
    listAttendanceRequests: async () => requests.slice().sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1)),
    decideAttendanceRequest: async (id, ok) => { const q = requests.find((x) => x.id === id); q.status = ok ? "approved" : "declined"; return { ok: true }; }, startSession: async (id) => sessions.find((x) => x.id === id) || sessions[3], setCheckin: async (id, state) => { const x = sessions.find((q) => q.id === id) || sessions[3]; x.checkin = state; return { checkin: state }; }, setRecheck: async (id, o) => { const x = sessions.find((q) => q.id === id) || sessions[3]; x.recheck.window = o.window; x.recheck.mode = o.mode; x.recheck.plannedAt = o.mode === 'at' ? o.at : null; }, startRecheck: async (id) => { const x = sessions.find((q) => q.id === id) || sessions[3]; x.recheck.startedAt = Date.now(); x.checkin = 'open'; }, createCourse: async (c) => ({ ok: true, course: { ...c, id: "new" } }), listAdmins: async (id) => (admins[id] || []).map((email) => ({ email, addedAt: Date.now() })), addAdmin: async (id, email) => { (admins[id] = admins[id] || []).push(email.trim().toLowerCase()); return { ok: true }; }, removeAdmin: async (id, email) => { admins[id] = (admins[id] || []).filter((e) => e !== email); }, updateCourse: async (id, o) => { const c = courses.find((x) => x.id === id); Object.assign(c, o); return { ok: true, course: { ...c } }; }, updateSession: async (id, o) => { const x = sessions.find((q) => q.id === id); if (o.title) x.title = o.title; if (o.when) x.scheduledAt = o.when; if (o.mode && x.state === "planned") x.mode = o.mode; }
  };
  const SYNC = new Set(["getSession", "now", "newCode", "totalOf", "recheckState", "statusOf", "normEmail", "cleanName", "isValidEmail", "parseFrame", "logout", "onChange"]);
  const delay = +(localStorage.getItem("MOCK_DELAY") || 0);
  if (delay) for (const k of Object.keys(base)) if (typeof base[k] === "function" && !SYNC.has(k)) { const f = base[k]; base[k] = (...a) => { window.__live = (window.__live || 0) + 1; window.__calls = (window.__calls || 0) + 1; window.__max = Math.max(window.__max || 0, window.__live); return new Promise((r) => setTimeout(() => { window.__live--; r(f(...a)); }, delay)); }; }
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : async () => { fn++; return null; }) });
})();
