// =============================================================================
// Shared pieces used by every page. First the icons, as small SVG drawings by name.
// =============================================================================
const ICONS = {
  pen: '<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>',
  book: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 9h6"/>',
  clipboard:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  trash: '<path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 3h6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3"/>',
  spin: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 19h14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  spark:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  print:
    '<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
};

// =============================================================================
// An icon by name as SVG, at the given size, colour and line width.
// =============================================================================
function icon(name, size = 20, color = "currentColor", width = 2) {
  return `<svg ${name === "spin" ? 'class="spin"' : ""} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// =============================================================================
// Makes text safe to put inside HTML, so names and questions can never inject code.
// =============================================================================
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// =============================================================================
// The first element that matches a CSS selector.
// =============================================================================
function $(sel, root = document) {
  return root.querySelector(sel);
}

// =============================================================================
// All elements that match a CSS selector, as a normal array.
// =============================================================================
function $all(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

// =============================================================================
// A value from the page address, for example param("course") for ?course=ABC123.
// =============================================================================
function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// =============================================================================
// The course named in the address (?course=CODE), or the first course, and remembers
// it for the next page.
// =============================================================================
async function getCourse() {
  const c =
    (param("course") && (await API.getCourseByCode(param("course")))) ||
    (await API.listCourses())[0];
  const v = c ? await API.view(c) : null;
  if (v) {
    rememberCourse(v);
    if ($("#course-head")) renderCourseHead(null, v);
  }
  return v;
}

// =============================================================================
// Saves what we know about a course (name, code, colour) for this browser tab, so its
// header can be drawn before the server answers.
// =============================================================================
function rememberCourse(c) {
  try {
    const old = knownCourse(c.code) || {};
    // Takes the new value, or keeps the old one when the new is missing.
    const keep = (k) => c[k] ?? old[k];
    sessionStorage.setItem(
      "cp.course." + c.code,
      JSON.stringify({
        code: c.code,
        name: c.name,
        id: c.id,
        cover: keep("cover"),
        day: keep("day"),
        time: keep("time"),
        schedule: keep("schedule"),
        students: keep("students"),
        sessionsCount: keep("sessionsCount"),
        live: keep("live"),
      }),
    );
  } catch (e) {}
}

// =============================================================================
// What we saved about this course earlier in this tab, if anything.
// =============================================================================
function knownCourse(code = param("course")) {
  try {
    return JSON.parse(sessionStorage.getItem("cp.course." + code) || "null");
  } catch (e) {
    return null;
  }
}

// =============================================================================
// When a call to the server fails and nobody handled it, show a short message instead
// of failing silently. A page-change animation the browser skipped is not an error and
// is ignored.
// =============================================================================
window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason?.message || String(e.reason || "");
  if (
    e.reason?.name === "AbortError" ||
    e.reason?.name === "TimeoutError" ||
    /transition|skipped/i.test(m)
  )
    return e.preventDefault();
  if (m !== "not signed in")
    toast(m.length > 140 ? m.slice(0, 140) + "…" : m || "Something went wrong");
});

// =============================================================================
// Sends the person to the sign-in page if they are not signed in, or are signed in
// with the other role. Uses replace, so the Back button never returns to a page they
// cannot use.
// =============================================================================
function requireRole(role) {
  const s = API.ready && API.getSession();
  if (!s || s.role !== role) {
    location.replace("../index.html");
    throw new Error("not signed in");
  }
  API.checkAuth().then((ok) => {
    if (!ok) {
      API.logout();
      location.replace("../index.html");
    }
  });
  return s;
}

// =============================================================================
// The initials of a name, for the round avatar ("Emma Clarke" gives "EC").
// =============================================================================
function initials(name) {
  return String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// =============================================================================
// Signs out, clears what this tab remembered, and goes to the sign-in page.
// =============================================================================
async function signOut() {
  try {
    sessionStorage.clear();
  } catch (e) {}
  await API.logout();
  location.replace("../index.html");
}

// =============================================================================
// The account menu (from the name at the bottom left): who is signed in, the language
// choice, and Sign out.
// =============================================================================
function openAccountMenu() {
  const me = API.getSession();
  let d = $("#account-menu");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "account-menu";
    d.className = "account-menu";
    document.body.appendChild(d);
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  }
  d.innerHTML = `
    <div class="row" style="gap:12px">
      <span class="avatar ${me.role === "student" ? "hl" : ""}" style="width:48px;height:48px;font-size:15px">${esc(initials(me.name))}</span>
      <div style="min-width:0"><p style="font-weight:800;font-size:20px;letter-spacing:-0.03em" dir="auto">${esc(me.name)}</p>
        <p class="mono muted" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;text-transform:none">${esc(me.email)}</p></div>
    </div>
      <span class="role-pill" style="align-self:flex-start">${me.role === "lecturer" ? "Lecturer" : "Student"}</span>
    <div class="stack" style="gap:6px"><span class="label" style="font-size:10px">Language</span>${window.I18N ? I18N.pickerHTML() : ""}</div>
    <div class="row" style="gap:8px;justify-content:flex-end">
      <button type="button" class="btn" id="am-close">Close</button>
      <button type="button" class="btn btn-dark" id="am-out">Sign out</button>
    </div>`;
  $("#am-close").addEventListener("click", () => d.close());
  $("#am-out").addEventListener("click", signOut);
  d.showModal();
}

// =============================================================================
// Changes an element's text only when it is different from what is shown, so the page
// does not flicker and the cursor and focus stay.
// =============================================================================
function setText(el, text) {
  const shown = window.I18N ? I18N.t(String(text)) : String(text);
  if (el && el.textContent !== shown) el.textContent = shown;
}

// =============================================================================
// Changes an element's HTML only when it is different. Returns true when it changed,
// so the caller re-attaches its buttons only then.
// =============================================================================
function setHTML(el, html) {
  if (!el || el._html === html) return false;
  const first = el._html === undefined;
  el.innerHTML = html;
  el._html = html;
  if (first) el.classList.add("anim-in");
  return true;
}

// =============================================================================
// Reads what this page showed last time in this tab, so the Back button shows it at
// once while fresh data loads.
// =============================================================================
function cacheGet(key) {
  try {
    return JSON.parse(sessionStorage.getItem("cp." + key) || "null");
  } catch (e) {
    return null;
  }
}

// =============================================================================
// Saves what this page is showing, for the next time.
// =============================================================================
function cacheSet(key, v) {
  try {
    sessionStorage.setItem("cp." + key, JSON.stringify(v));
  } catch (e) {}
}

// =============================================================================
// Grey placeholder blocks shown while a list is loading.
// =============================================================================
function skeleton(n = 3, h = 72) {
  return Array.from(
    { length: n },
    () => `<div class="skeleton" style="height:${h}px"></div>`,
  ).join("");
}

// =============================================================================
// Asks the phone for its location for the check-in. Gives up after 6 seconds and
// returns null if the person says no or it takes too long.
// =============================================================================
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: Math.round(p.coords.accuracy),
        }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
}

// =============================================================================
// What the phone sends with a check-in: only its location. The database reads the
// network address from the request itself.
// =============================================================================
async function getCheckContext() {
  return { ip: null, loc: await getLocation() };
}

// =============================================================================
// A time of day, like 10:42:05.
// =============================================================================
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("en-GB");
}

// =============================================================================
// A short date, like 26 Nov.
// =============================================================================
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// =============================================================================
// The text on the AI settings button: the chosen model, or "Set up AI".
// =============================================================================
function aiStatusText() {
  const s = AI.settings();
  return s.key && s.model ? `AI model ${s.model}` : "Set up AI";
}

// =============================================================================
// The AI settings window: the lecturer pastes their Gemini key, loads the list of
// models and picks one. The key is saved only in this browser.
// =============================================================================
function openAISettings(onSave) {
  let d = $("#ai-dialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "ai-dialog";
    d.style.cssText =
      "border:0;border-radius:16px;padding:24px;max-width:480px;width:calc(100% - 32px)";
    d.innerHTML = `
      <form method="dialog" class="stack" style="gap:14px">
        <h2 style="font-size:20px">AI settings</h2>
        <div class="stack" style="gap:12px" id="ai-real">
          <label class="field">Gemini API key
            <input type="password" id="ai-key" placeholder="Paste your key" autocomplete="off"></label>
          <p class="small muted">Get a free key at Google AI Studio (aistudio.google.com → Get API key). It's saved only in this browser for now.</p>
          <div class="row" style="gap:8px">
            <label class="field" style="flex:1">Model<select id="ai-model"><option value="">Load models first</option></select></label>
            <button type="button" class="btn" style="align-self:flex-end" id="ai-load">Load models</button>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn btn-primary" value="save" id="ai-save">Save</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    $("#ai-load").addEventListener("click", async () => {
      const key = $("#ai-key").value.trim();
      if (!key) return toast("Paste the key first");
      $("#ai-load").textContent = "Loading…";
      try {
        const models = await AI.listModels(key);
        $("#ai-model").innerHTML = models
          .map(
            (m) =>
              `<option value="${esc(m.id)}">${esc(m.label)} (${esc(m.id)})</option>`,
          )
          .join("");
        d._models = models.map((m) => m.id);
        toast(
          `${models.length} models found. A "Flash" model is fast and cheap`,
        );
      } catch (e) {
        toast(AI.friendly(e));
      }
      $("#ai-load").textContent = "Load models";
    });
    d.addEventListener("close", () => {
      if (d.returnValue !== "save") return;
      const key = $("#ai-key").value.trim(),
        model = $("#ai-model").value;
      if (!key || !model) {
        toast("Add a key and choose a model");
        return;
      }
      AI.saveSettings({
        key,
        model,
        ...(d._models ? { models: d._models } : {}),
      });
      toast("AI ready");
      d._onSave?.();
    });
  }
  const s = AI.settings();
  $("#ai-key").value = s.key || "";
  if (s.model)
    $("#ai-model").innerHTML =
      `<option value="${esc(s.model)}">${esc(s.model)}</option>`;
  d._onSave = onSave;
  d.showModal();
}

// =============================================================================
// A short message at the bottom of the screen that disappears by itself.
// =============================================================================
function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

// =============================================================================
// The cloth colours for course books. Every course keeps the same colour on the shelf,
// in the lists and on its pages.
// =============================================================================
const COVERS = [
  {
    cover: "#2440E6",
    ink: "#FFFFFF",
    rule: "rgba(255,255,255,.10)",
    ribbon: "#FFE45C",
  },
  {
    cover: "#141414",
    ink: "#F3F0E8",
    rule: "rgba(243,240,232,.08)",
    ribbon: "#2440E6",
  },
  {
    cover: "#C8371D",
    ink: "#FFFFFF",
    rule: "rgba(255,255,255,.12)",
    ribbon: "#FFE45C",
  },
  {
    cover: "#5E5A53",
    ink: "#F3F0E8",
    rule: "rgba(243,240,232,.10)",
    ribbon: "#FFE45C",
  },
  {
    cover: "#FFE45C",
    ink: "#141414",
    rule: "rgba(20,20,20,.08)",
    ribbon: "#2440E6",
  },
];

// =============================================================================
// The colours of one course's cover.
// =============================================================================
function coverOf(c) {
  let i = c?.cover;
  if (i == null) i = knownCourse(c?.code)?.cover;
  if (i == null)
    i = Math.abs(
      [...String(c?.id || c?.code || "")].reduce(
        (h, ch) => (h * 31 + ch.charCodeAt(0)) | 0,
        0,
      ),
    );
  return COVERS[i % COVERS.length];
}

// =============================================================================
// The same colours as CSS variables, ready to put in a style attribute.
// =============================================================================
const coverVars = (c) => {
  const k = coverOf(c);
  return `--cover:${k.cover};--cover-ink:${k.ink};--cover-rule:${k.rule};--ribbon:${k.ribbon}`;
};

// =============================================================================
// A course name written in two styles: the first word bold, the rest in the serif font
// ("Software Engineering").
// =============================================================================
function titleHTML(name, { serifTag = "span" } = {}) {
  const words = String(name || "")
      .trim()
      .split(/\s+/),
    first = words.shift() || "",
    rest = words.join(" ");
  return `<b class="t1">${esc(first)}</b>${rest ? ` <${serifTag} class="serif">${esc(rest)}</${serifTag}>` : ""}`;
}

// =============================================================================
// The small bookmark icon that marks the current place in the left column.
// =============================================================================
const BOOKMARK =
  '<svg aria-hidden="true" width="14" height="18" viewBox="0 0 14 18"><path d="M1 1h12v16l-6-4.5L1 17z" fill="currentColor"/></svg>';

// =============================================================================
// A number with two digits (3 becomes 03).
// =============================================================================
const pad2 = (n) => String(n).padStart(2, "0");

// =============================================================================
// "Sun" becomes "Sundays", for "Sundays 10:00".
// =============================================================================
const dayPlural = (d) =>
  ({
    Sun: "Sundays",
    Mon: "Mondays",
    Tue: "Tuesdays",
    Wed: "Wednesdays",
    Thu: "Thursdays",
    Fri: "Fridays",
    Sat: "Saturdays",
  })[d] || d;

// =============================================================================
// A question about one slide is saved as "[Slide 12] text". This finds that tag.
// =============================================================================
const SLIDE_TAG = /^\[Slide (\d+)\]\s*/;

// =============================================================================
// The slide number a question is about, or 0.
// =============================================================================
const slideOf = (text) =>
  Number((String(text || "").match(SLIDE_TAG) || [])[1]) || 0;

// =============================================================================
// A question's text as HTML, with a "Slide 12" chip in front when it is about a slide
// (a button that jumps to the slide when asked to).
// =============================================================================
function questionTextHTML(text, { button = false } = {}) {
  const n = slideOf(text),
    rest = esc(String(text || "").replace(SLIDE_TAG, ""));
  if (!n) return rest;
  const chip = button
    ? `<button type="button" class="slide-chip" data-goto-slide="${n}" aria-label="Show slide ${n}">Slide ${n}</button>`
    : `<span class="slide-chip">Slide ${n}</span>`;
  return `${chip} ${rest}`;
}

// =============================================================================
// True when a lecture's place means online (online, Zoom, Meet, Teams...).
// =============================================================================
const isOnlinePlace = (p) =>
  /^\s*(online|zoom|meet|teams|אונליין|זום)\s*$/i.test(p || "");

// =============================================================================
// A course's weekly lecture times as one line, like "Sun 10:00 · Tue 14:00 online".
// The short form shows the first time and "+1" for more.
// =============================================================================
function scheduleText(c, { long = false, short = false } = {}) {
  const list = (
    c?.schedule?.length
      ? c.schedule
      : c?.day
        ? [{ day: c.day, time: c.time, place: c.room }]
        : []
  ).filter((x) => x.day || x.time);
  if (!list.length) return "";
  // One lecture time as text.
  const one = (x) =>
    [
      long && list.length === 1 ? dayPlural(x.day) : x.day,
      x.time,
      isOnlinePlace(x.place) ? "online" : "",
    ]
      .filter(Boolean)
      .join(" ");
  if (short)
    return one(list[0]) + (list.length > 1 ? ` +${list.length - 1}` : "");
  return list.map(one).join(" · ");
}

// =============================================================================
// The days to choose from in the lecture times editor.
// =============================================================================
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// =============================================================================
// One row of the lecture times editor: day, time and place.
// =============================================================================
function scheduleRowHTML(x = {}) {
  return `<div class="sched-row">
    <select class="input" data-k="day" aria-label="Day">${WEEKDAYS.map((d) => `<option ${d === x.day ? "selected" : ""}>${d}</option>`).join("")}</select>
    <input class="input" type="time" data-k="time" aria-label="Time" value="${esc(x.time || "10:00")}">
    <input class="input" data-k="place" aria-label="Room, or Online" placeholder="Room, or Online" value="${esc(x.place || "")}" list="place-hints" dir="auto">
    <button type="button" class="icon-btn" data-sched-del aria-label="Remove this time">${icon("trash", 16, "currentColor", 1.8)}</button>
  </div>`;
}

// =============================================================================
// The lecture times editor used in "New course" and "Edit course".
// =============================================================================
function scheduleEditorHTML(list = []) {
  return `<div class="stack" style="gap:8px" data-sched>
    <span class="label" style="font-size:10px">Lecture times <span class="muted" style="text-transform:none;letter-spacing:0">(optional, as many as you need)</span></span>
    <div class="stack" style="gap:8px" data-sched-rows>${list.map(scheduleRowHTML).join("")}</div>
    <button type="button" class="btn" style="align-self:flex-start;min-height:40px" data-sched-add>+ Add a time</button>
    <datalist id="place-hints"><option value="Online"></option></datalist>
  </div>`;
}

// =============================================================================
// Makes the editor's "Add time" and "Remove" buttons work.
// =============================================================================
function wireSchedule(root) {
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-sched-add]")) {
      const rows = root.querySelector("[data-sched-rows]"),
        last = [...rows.children].pop();
      rows.insertAdjacentHTML(
        "beforeend",
        scheduleRowHTML(
          last
            ? {
                time: last.querySelector('[data-k="time"]').value,
                place: last.querySelector('[data-k="place"]').value,
              }
            : {},
        ),
      );
      rows.lastElementChild.querySelector("select").focus();
    }
    const del = e.target.closest("[data-sched-del]");
    if (del) del.closest(".sched-row").remove();
  });
}

// =============================================================================
// Reads the lecture times the user entered.
// =============================================================================
function readSchedule(root) {
  return [...root.querySelectorAll(".sched-row")].map((r) => ({
    day: r.querySelector('[data-k="day"]').value,
    time: r.querySelector('[data-k="time"]').value,
    place: r.querySelector('[data-k="place"]').value.trim(),
  }));
}

// =============================================================================
// The semester of a date in the Israeli academic year: A from October to February, B
// from March to July, then summer.
// =============================================================================
function semester(d = new Date()) {
  const m = d.getMonth() + 1;
  return m >= 10 || m <= 2 ? "Semester A" : m <= 7 ? "Semester B" : "Summer";
}

// =============================================================================
// The left column: the main places for each role (lecturers and students see different
// ones).
// =============================================================================
const SIDE_NAV = {
  lecturer: [
    ["courses", "Courses", "courses.html"],
    ["live", "Live room", "live.html"],
    ["inbox", "Inbox", "inbox.html"],
    ["requests", "Join requests", "requests.html"],
  ],
  student: [
    ["today", "Today", "home.html"],
    ["shelf", "My shelf", "home.html#my-shelf"],
    ["attendance", "Attendance", "attendance.html"],
    ["questions", "My questions", "questions.html"],
  ],
};

// =============================================================================
// Saves the list of courses shown in the left column, so it is there the moment the
// next page opens.
// =============================================================================
function sideCourses(list) {
  const slim = list.map((c, i) => ({
    code: c.code,
    name: c.name,
    live: !!c.live,
    students: c.students,
    cover: c.cover ?? i,
  }));
  cacheSet("side-courses", slim);
  list.forEach((c, i) => rememberCourse({ ...c, cover: c.cover ?? i }));
  drawSide();
}

// =============================================================================
// Draws the left column for this role and marks the current place. Sends the person to
// sign in if needed. Returns who is signed in.
// =============================================================================
function renderShell(role, active) {
  const me = requireRole(role);
  let el = $("#topbar");
  if (!el) {
    el = document.createElement("div");
    el.id = "topbar";
    document.body.prepend(el);
  }
  document.body.classList.add("has-side");
  renderShell.state = { role, active, me };
  drawSide();
  if (!cacheGet("side-courses")) {
    (role === "lecturer" ? API.listCourses() : API.myCourses(me.email))
      .then((l) => {
        if (!cacheGet("side-courses")) sideCourses(l || []);
      })
      .catch(() => {});
  }
  return me;
}

// =============================================================================
// Draws the left column: logo, the main places, the person's courses (with a dot for a
// live lecture) and the account button.
// =============================================================================
function drawSide() {
  const st = renderShell.state;
  if (!st) return;
  const { role, active, me } = st,
    el = $("#topbar");
  const nav = SIDE_NAV[role],
    ai = nav.findIndex((n) => n[0] === active),
    here = param("course");
  const courses = cacheGet("side-courses") || [];
  const reqs =
    role === "lecturer"
      ? (cacheGet("lect-courses") || []).reduce(
          (n, c) => n + (c.requests || 0),
          0,
        )
      : 0;
  const html = `
    <aside class="sidebar" aria-label="Main">
      <div class="side-top"><a class="logo" href="${nav[0][2]}" aria-label="Home" ${ai > 0 || here ? "data-back" : ""}>${BOOKMARK}</a>${role === "lecturer" ? '<span class="role-pill">Lecturer</span>' : ""}</div>
      <nav class="side-nav" aria-label="Places">${nav
        .map(
          ([k, label, href], i) =>
            `<a href="${href}" ${k === active ? 'aria-current="page"' : ""} ${ai >= 0 && i < ai ? "data-back" : ""}><span class="n">${pad2(i + 1)}</span><b>${label}</b>${
              k === "requests" && reqs
                ? `<span class="live-pill">${reqs}</span>`
                : ""
            }</a>`,
        )
        .join("")}</nav>
      ${
        courses.length
          ? `<div class="side-courses"><div class="side-courses-h">Courses</div>${courses
              .map(
                (c) =>
                  `<a class="side-course" href="${role === "lecturer" ? "course.html" : "course.html"}?course=${encodeURIComponent(c.code)}" style="${coverVars(c)}" ${c.code === here ? 'aria-current="page"' : ""}>
          <span class="sw"></span><span class="nm" dir="auto">${esc(c.name)}</span>${c.live ? '<span class="live-pill">Live</span>' : role === "lecturer" && c.students != null ? `<span class="meta">${c.students}</span>` : ""}</a>`,
              )
              .join("")}</div>`
          : ""
      }
      <button type="button" class="side-me" onclick="openAccountMenu()" aria-label="Account: ${esc(me.name)}">
        <span class="avatar ${role === "student" ? "hl" : ""}">${esc(initials(me.name))}</span>
        <span class="who"><b dir="auto">${esc(me.name)}</b><span>Sign out</span></span></button>
    </aside>`;
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
}

// =============================================================================
// The lecturer's left column.
// =============================================================================
function renderTopbar(active) {
  return renderShell("lecturer", active);
}

// =============================================================================
// The student's left column.
// =============================================================================
function renderStudentNav(active) {
  return renderShell("student", active);
}

// =============================================================================
// The small book shown at the top of a course's pages.
// =============================================================================
function miniBookHTML(c) {
  const long =
    String(c?.name || "")
      .split(/\s+/)
      .some((w) => w.length > 8) || String(c?.name || "").length > 18;
  return `<div class="mini-book ${long ? "long" : ""}" aria-hidden="true" style="${coverVars(c)}"><span class="rb"></span><div class="cv"><span>${titleHTML(c?.name || "", { serifTag: "i" }).replace('class="t1"', "")}</span></div></div>`;
}

// =============================================================================
// The top of a course page: its small book, a line above the title, the course name,
// and buttons on the right.
// =============================================================================
function courseTopHTML(c, kicker, actions = "") {
  return `<div class="course-top">
      ${miniBookHTML(c)}
      <div class="course-name"><div class="kicker">${kicker || "&nbsp;"}</div><h1 class="course-title ${String(c?.name || "").length > 16 ? "long" : ""}" dir="auto">${c ? titleHTML(c.name) : "&nbsp;"}</h1></div>
      ${actions ? `<div class="course-actions">${actions}</div>` : ""}
    </div>`;
}

// =============================================================================
// The tabs inside a course on the lecturer's side.
// =============================================================================
const COURSE_TABS = [
  ["sessions", "Sessions", "course.html"],
  ["students", "Students", "roster.html"],
  ["attendance", "Attendance", "attendance.html"],
  ["questions", "Questions", "questions.html"],
  ["summaries", "Summaries", "summaries.html"],
  ["homework", "Homework", "homework.html"],
];

// =============================================================================
// A row of tabs with the current one marked.
// =============================================================================
function tabsHTML(tabs, active, c, label = "Course sections") {
  const ai = tabs.findIndex((t) => t[0] === active);
  return `<nav class="subtabs" aria-label="${label}">${tabs
    .map(
      ([k, name, href, n], i) =>
        `<a href="${href}${c ? (href.includes("?") ? "&" : "?") + "course=" + encodeURIComponent(c.code) : ""}" ${k === active ? 'aria-current="page"' : ""} ${i < ai ? "data-back" : ""}>${name}${n ? ` <span class="n">${n}</span>` : ""}${k === active ? '<span class="tab-ink"></span>' : ""}</a>`,
    )
    .join("")}</nav>`;
}

// =============================================================================
// Draws a course's header and tabs. It draws right away from what we already know
// about the course, then again when the server answers.
// =============================================================================
function renderCourseHead(active, course) {
  const el = $("#course-head");
  if (!el) return;
  active = active || el.dataset.tab;
  el.dataset.tab = active;
  const c = course || knownCourse();
  const when = scheduleText(c, { long: true });
  const kicker =
    c && c.students != null
      ? [
          `${c.students} student${c.students === 1 ? "" : "s"}`,
          `${c.sessionsCount} session${c.sessionsCount === 1 ? "" : "s"}`,
          when,
        ]
          .filter(Boolean)
          .map(esc)
          .join(" · ")
      : "";
  const actions = c
    ? `<button type="button" class="code-btn" data-copy-code="${esc(c.code)}" aria-label="Copy join code ${esc(c.code)}"><span dir="ltr">${esc(c.code)}</span>${icon("copy", 16)}</button>
    <button type="button" class="btn btn-accent btn-lg" data-quick-start>${c.live ? "Open live room" : `<svg aria-hidden="true" class="flip" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>Start lecture`}</button>`
    : "";
  const html =
    courseTopHTML(c, kicker, actions) + tabsHTML(COURSE_TABS, active, c);
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  const cur = el.querySelector('.subtabs [aria-current="page"]'),
    bar = el.querySelector(".subtabs");
  if (cur && bar.scrollWidth > bar.clientWidth)
    bar.scrollLeft = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-copy-code]");
    if (b) {
      navigator.clipboard?.writeText(b.dataset.copyCode);
      toast(`Copied ${b.dataset.copyCode}`);
      return;
    }
    const q = e.target.closest("[data-quick-start]");
    if (q && c) {
      q.disabled = true;
      try {
        const course = c.id ? c : await API.getCourseByCode(c.code);
        const live =
          (await API.activeSession(course.id)) ||
          (await API.quickSession(course.id));
        window.Curtain
          ? Curtain.go(`live.html?course=${course.code}&session=${live.id}`)
          : (location.href = `live.html?course=${course.code}&session=${live.id}`);
      } catch (err) {
        q.disabled = false;
        throw err;
      }
    }
  };
}

// =============================================================================
// The four yellow corners of the camera viewfinder on the check-in screen.
// =============================================================================
const VIEWFINDER_CORNERS = `
<svg class="corners" viewBox="0 0 230 230" aria-hidden="true" fill="none" stroke="#FFE45C" stroke-width="5" stroke-linecap="round">
  <path d="M4 52V26A22 22 0 0 1 26 4h26M178 4h26a22 22 0 0 1 22 22v26M226 178v26a22 22 0 0 1-22 22h-26M52 226H26A22 22 0 0 1 4 204v-26"/>
</svg>`;

// =============================================================================
// A lecture summary as HTML, for both the lecturer's and the students' pages: title,
// short recap, sections with times, key terms, and next steps.
// =============================================================================
function summaryHTML(r) {
  // A section heading.
  const h3 = (t) => `<h3 style="font-size:var(--fs-md)" data-tr>${t}</h3>`;
  // A smaller heading.
  const h4 = (t) =>
    `<h4 style="font-size:15px;font-weight:600;margin:0">${t}</h4>`;
  // A paragraph of plain text.
  const para = (t) =>
    `<p style="line-height:1.7;color:var(--ink-2);margin:0">${esc(t || "")}</p>`;
  // A time stamp in the recording, like 00:12:30.
  const time = (t) =>
    t
      ? `<bdi dir="ltr" class="muted" style="font:500 13px var(--display);font-variant-numeric:tabular-nums;margin-inline-start:10px">${esc(t)}</bdi>`
      : "";
  // Seconds as hh:mm:ss.
  const clock = (s) => {
    s = Math.round(s);
    return [s / 3600, (s % 3600) / 60, s % 60]
      .map((n) => String(Math.floor(n)).padStart(2, "0"))
      .join(":");
  };
  if (r.recap || r.sections) {
    const head =
      r.durationSec || r.link
        ? `<div class="stack" style="gap:2px">${h3("Recording")}
      <p class="small muted" style="margin:0" data-tr>${r.durationSec ? `Duration: ${clock(r.durationSec)}` : ""}${r.durationSec && r.link ? " · " : ""}${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener" style="word-break:break-all">Recording link</a>` : ""}</p></div>`
        : "";
    const steps = (r.nextSteps || []).filter((g) => g.items?.length);
    const rtl = /[\u0590-\u08FF]/.test(
      (r.recap || "") + (r.sections?.[0]?.text || ""),
    );
    return `<div class="stack" dir="${rtl ? "rtl" : "ltr"}" style="gap:18px">${head}
    <div class="stack" style="gap:8px">${h3("Quick recap")}${para(r.recap)}</div>
    ${
      steps.length
        ? `<div class="stack" style="gap:10px">${h3("Next steps")}
      ${steps
        .map(
          (
            g,
          ) => `<div class="stack" style="gap:4px">${g.who ? h4(esc(g.who)) : ""}
        <ul style="margin:0;padding-inline-start:20px;color:var(--ink-2);line-height:1.6;display:flex;flex-direction:column;gap:4px">${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
        )
        .join("")}</div>`
        : ""
    }
    ${
      r.sections?.length
        ? `<div class="stack" style="gap:14px">${h3("Summary")}
      ${r.sections.map((x) => `<div class="stack" style="gap:6px">${h4(`<bdi>${esc(x.title)}</bdi>` + time(x.time))}${para(x.text)}</div>`).join("")}</div>`
        : ""
    }</div>`;
  }
  return `
    <p style="line-height:1.6;color:var(--ink-2)">${esc(r.overview || "")}</p>
    ${
      r.topics?.length
        ? `<div class="stack" style="gap:4px">${h3("Topics")}
      ${r.topics
        .map(
          (
            t,
          ) => `<div style="padding:10px 0;border-bottom:1px solid var(--hairline)">
        <div class="row" style="align-items:baseline">${t.time ? `<bdi dir="ltr" class="muted" style="font:500 13px var(--display);font-variant-numeric:tabular-nums;min-width:52px">${esc(t.time)}</bdi>` : ""}<span style="font-weight:600">${esc(t.title)}</span></div>
        ${(t.points || []).length ? `<ul style="margin:6px 0 0;padding-inline-start:20px;color:var(--ink-2)">${t.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      </div>`,
        )
        .join("")}</div>`
        : ""
    }
    ${
      r.terms?.length
        ? `<div class="stack" style="gap:6px">${h3("Terms")}
      ${r.terms.map((t) => `<p><b>${esc(t.term)}</b>: <span class="muted">${esc(t.explanation)}</span></p>`).join("")}</div>`
        : ""
    }
    ${
      r.questions?.length
        ? `<div class="stack" style="gap:6px">${h3("Review questions")}
      <ol style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px;line-height:1.5">${r.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div>`
        : ""
    }`;
}

// =============================================================================
// The summary's sections and their times, for the print preview.
// =============================================================================
function summaryRows(r) {
  return r.sections
    ? r.sections.map((x) => [x.title, x.time || ""])
    : (r.topics || []).map((t) => [t.title, t.time || ""]);
}

// =============================================================================
// The first load of a page: a small spinner shows until the page's first calls to the
// server have all answered, then the content fades in. This counts those calls.
// =============================================================================
const BOOT = { n: 0, done: false, timer: null };

// =============================================================================
// Hides the spinner and shows the page (only once).
// =============================================================================
function bootDone() {
  if (BOOT.done) return;
  BOOT.done = true;
  document.body.classList.add("ready");
  window.Curtain?.ready();
  const l = $("#boot-loader");
  if (l) {
    l.classList.add("out");
    setTimeout(() => l.remove(), 260);
  }
}

// =============================================================================
// Shows the spinner, counts every first call the page makes to the server, and shows
// the page when they have all answered, or as soon as real content appears, whichever
// comes first. After 9 seconds it shows the page anyway.
// =============================================================================
(function boot() {
  if (!document.body) return;
  const l = document.createElement("div");
  l.id = "boot-loader";
  l.setAttribute("role", "status");
  l.setAttribute("aria-label", "Loading");
  l.innerHTML = `<span class="spinner" aria-hidden="true"></span>`;
  document.body.appendChild(l);
  if (typeof API === "object" && API) {
    const settle = () => {
      if (--BOOT.n <= 0) {
        clearTimeout(BOOT.timer);
        BOOT.timer = setTimeout(() => BOOT.n <= 0 && bootDone(), 80);
      }
    };
    for (const k of Object.keys(API)) {
      const f = API[k];
      if (typeof f !== "function" || k === "onChange") continue;
      API[k] = function (...a) {
        const r = f.apply(this, a);
        if (!BOOT.done && r && typeof r.then === "function") {
          BOOT.n++;
          clearTimeout(BOOT.timer);
          r.then(settle, settle);
        }
        return r;
      };
    }
  }
  const main = $(".container, .phone-main, .projector-body");
  if (main) {
    const mo = new MutationObserver((list) => {
      if (
        !list.some(
          (m) =>
            m.addedNodes.length && !m.target.closest?.("#course-head, #topbar"),
        )
      )
        return;
      mo.disconnect();
      setTimeout(bootDone, 40);
    });
    mo.observe(main, { childList: true, subtree: true });
  }
  addEventListener("load", () =>
    setTimeout(() => BOOT.n <= 0 && bootDone(), 250),
  );
  setTimeout(bootDone, 9000);
  if ($("#course-head")) renderCourseHead();
})();

// =============================================================================
// Links that go back. Going deeper slides the new page in from the right; going back
// slides it in from the left, so the user always sees which way they went.
// =============================================================================
const BACK_LINKS =
  '.back-link, [aria-label="Back"], [aria-label="Cancel"], [data-back]';

// =============================================================================
// Remembers whether the link the user clicked goes back or deeper.
// =============================================================================
document.addEventListener(
  "click",
  (e) => {
    const a = e.target.closest?.("a[href]");
    if (
      !a ||
      a.target === "_blank" ||
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey
    )
      return;
    try {
      sessionStorage.setItem(
        "cp.navdir",
        a.matches(BACK_LINKS) ? "back" : "forward",
      );
    } catch (x) {}
  },
  true,
);

// =============================================================================
// Works out the direction of this page change: back or deeper (also for the browser's
// own Back and Forward buttons).
// =============================================================================
function navDirection(activation) {
  if (
    activation?.navigationType === "traverse" &&
    activation.entry &&
    activation.from
  )
    return activation.entry.index < activation.from.index ? "back" : "forward";
  try {
    return sessionStorage.getItem("cp.navdir") || "forward";
  } catch (x) {
    return "forward";
  }
}

// =============================================================================
// The old page, as it leaves: marks which way the change goes.
// =============================================================================
addEventListener("pageswap", (e) => {
  if (!e.viewTransition) return;
  const act = e.activation,
    dir =
      act?.navigationType === "traverse" &&
      act.entry &&
      navigation?.currentEntry
        ? act.entry.index < navigation.currentEntry.index
          ? "back"
          : "forward"
        : navDirection(null);
  e.viewTransition.types.add(dir);
});

// =============================================================================
// The new page, as it arrives: plays the change in the same direction.
// =============================================================================
addEventListener("pagereveal", (e) => {
  if (!e.viewTransition) return;
  e.viewTransition.types.add(navDirection(window.navigation?.activation));
  try {
    sessionStorage.removeItem("cp.navdir");
  } catch (x) {}
});

// =============================================================================
// A small question window instead of the browser's plain confirm and prompt boxes. It
// can ask yes or no, ask for a short text, or ask the user to type something (like a
// course code) to confirm a deletion. Returns a promise with the answer.
// =============================================================================
function ask(o) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className =
      "ask" +
      (o.wide ? " wide" : "") +
      (document.body.classList.contains("dark-screen") ? " on-dark" : "");
    d.setAttribute("aria-labelledby", "ask-title");
    const inp = o.input;
    d.innerHTML = `
      <form method="dialog" class="ask-body">
        <h2 id="ask-title">${esc(o.title || "Are you sure?")}</h2>
        ${o.message ? `<p class="ask-msg">${esc(o.message)}</p>` : ""}
        ${o.body || ""}
        ${
          inp
            ? `<label class="field">${esc(inp.label || "")}${
                inp.multiline
                  ? `<textarea class="input" name="v" rows="3" maxlength="${inp.max || 500}" dir="auto" placeholder="${esc(inp.placeholder || "")}"></textarea>`
                  : `<input class="input" name="v" autocomplete="off" spellcheck="false" placeholder="${esc(inp.placeholder || "")}">`
              }</label>`
            : ""
        }
        <div class="ask-actions">
          <button type="button" class="btn" value="cancel">${esc(o.cancel || "Cancel")}</button>
          <button type="submit" class="btn ${o.danger ? "btn-destructive" : "btn-primary"}" value="ok">${esc(o.confirm || "OK")}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const ok = d.querySelector('[value="ok"]'),
      field = o.body ? null : d.querySelector("input, textarea");
    // True when what the user typed is enough to confirm.
    const valid = () =>
      inp?.match
        ? field.value.trim().toUpperCase() === String(inp.match).toUpperCase()
        : !inp?.required || field.value.trim().length > 0;
    if (field) {
      ok.disabled = !valid();
      field.addEventListener("input", () => (ok.disabled = !valid()));
    }
    let answer = null;
    // Closes the window with a short animation and keeps the answer.
    const close = (val) => {
      answer = val;
      d.classList.add("closing");
      setTimeout(() => d.close(), 140);
    };
    d.querySelector('[value="cancel"]').addEventListener("click", () =>
      close(o.alt !== undefined ? o.alt : inp ? null : false),
    );
    d.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (o.read) {
        const v = o.read(d);
        if (v != null) close(v);
        return;
      }
      if (valid()) close(inp ? field.value.trim() : true);
    });
    o.wire?.(d);
    if (inp?.multiline)
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          d.querySelector("form").requestSubmit();
        }
      });
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(inp ? null : false);
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) close(inp ? null : false);
    });
    d.addEventListener("close", () => {
      d.remove();
      resolve(answer ?? (inp ? null : false));
    });
    d.showModal();
    (field || (o.danger ? d.querySelector('[value="cancel"]') : ok)).focus();
  });
}

// =============================================================================
// A student who could not check in asks the lecturer to mark them present, with an
// optional reason. Returns true when the request was sent.
// =============================================================================
async function askLecturerForAttendance(s) {
  const name = s.title
    ? `Lecture ${s.number}: ${s.title}`
    : `Lecture ${s.number}`;
  const reason = await ask({
    title: "Ask the lecturer to mark you present",
    message: `${name}. Say what happened. Your lecturer decides, and you'll see the answer in Attendance.`,
    input: {
      label: "What happened",
      placeholder: "e.g. My camera wouldn't open",
      multiline: true,
      required: true,
      max: 300,
    },
    confirm: "Send request",
  });
  if (!reason) return false;
  const res = await API.requestAttendance(s.id, reason);
  if (!res?.ok) {
    toast(res?.error || "Couldn't send the request");
    return false;
  }
  toast("Request sent to the lecturer");
  return true;
}
