// =============================================================================
// The data layer: the only code in the app that talks to the server (Supabase). Every
// page reads and saves through these functions. The checks that must not be cheated
// (signed frames, timing, network) run inside the database itself, in
// supabase/schema.sql.
// =============================================================================
var API = (() => {
  // =============================================================================
  // The server address and key from js/config.js. Without them (or if the Supabase
  // library did not load) the app cannot work, and pages show that.
  // =============================================================================
  const cfg = window.CP_CONFIG || {};
  if (!cfg.supabaseUrl || !window.supabase) {
    console.error("Supabase isn't configured or its library didn't load.");
    return { ready: false };
  }

  // =============================================================================
  // The connection to our Supabase project, and where this browser keeps who is signed
  // in.
  // =============================================================================
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const SKEY = "lectureapp.session";
  // Someone who signed in with an older version of the site stays signed in.
  try {
    if (
      !localStorage.getItem(SKEY) &&
      localStorage.getItem("classpulse.session")
    )
      localStorage.setItem(SKEY, localStorage.getItem("classpulse.session"));
  } catch (e) {}

  // =============================================================================
  // The check-in limits: a new frame every 200 ms, at least 6 frames over at least 1
  // second, a code at most 3 seconds old (up to 8 on slow internet), at most 300 m from
  // the lecturer, and 60 seconds for the second check. They must match the numbers in
  // submit_scan in schema.sql.
  // =============================================================================
  const RULES = {
    FRAME_MS: 200,
    MIN_FRAMES: 6,
    MIN_SPAN_MS: 1000,
    MAX_AGE_MS: 3000,
    MAX_AGE_SLOW_MS: 8000,
    MAX_DISTANCE_M: 300,
    RECHECK_WINDOW_S: 60,
  };

  // =============================================================================
  // An email in one standard form: no spaces, lower case.
  // =============================================================================
  const normEmail = (e) =>
    String(e || "")
      .trim()
      .toLowerCase();

  // =============================================================================
  // A name with single spaces and nothing around it.
  // =============================================================================
  const cleanName = (n) =>
    String(n || "")
      .replace(/\s+/g, " ")
      .trim();

  // =============================================================================
  // True when the text looks like an email address.
  // =============================================================================
  const isValidEmail = (e) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e));

  // =============================================================================
  // The total score of a homework review.
  // =============================================================================
  const totalOf = (review) =>
    (review?.criteria || []).reduce((s, c) => s + (Number(c.score) || 0), 0);

  // =============================================================================
  // Reads the text inside one QR frame: "CP1 | session | round | frame number | time |
  // signature". Returns null for any other QR code.
  // =============================================================================
  function parseFrame(raw) {
    const p = String(raw).split("|");
    if (p.length !== 6 || p[0] !== "CP1") return null;
    return {
      sessionId: p[1],
      round: +p[2],
      n: +p[3],
      t: +p[4],
      sig: p[5],
      body: p.slice(0, 5).join("|"),
    };
  }

  // =============================================================================
  // A database time as milliseconds, or null.
  // =============================================================================
  const ms = (t) => (t ? new Date(t).getTime() : null);

  // =============================================================================
  // How far this device's clock is from the server's clock. All check-in times are
  // server times.
  // =============================================================================
  let offset = 0;

  // =============================================================================
  // The current time by the server's clock.
  // =============================================================================
  const now = () => Date.now() + offset;

  // =============================================================================
  // Measures the difference between this device's clock and the server's once, when the
  // page loads.
  // =============================================================================
  (async () => {
    const t0 = Date.now();
    const { data } = await sb.rpc("server_time");
    if (data) offset = Number(data) - (t0 + Date.now()) / 2;
  })();

  // =============================================================================
  // Runs a database request and returns its data, or throws its error as a normal
  // message.
  // =============================================================================
  async function q(p) {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  }

  // =============================================================================
  // Who is signed in on this browser (role, email, name), or null.
  // =============================================================================
  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SKEY) || "null");
    } catch (e) {
      return null;
    }
  }

  // =============================================================================
  // Remembers who signed in and with which role.
  // =============================================================================
  function login(role, email, name) {
    email = normEmail(email);
    const s = { role, email, name: cleanName(name) || email.split("@")[0] };
    try {
      localStorage.setItem(SKEY, JSON.stringify(s));
    } catch (e) {}
    return s;
  }

  // =============================================================================
  // Signs out of Google and forgets the person on this browser.
  // =============================================================================
  async function logout() {
    try {
      localStorage.removeItem(SKEY);
    } catch (e) {}
    try {
      await sb.auth.signOut();
    } catch (e) {}
  }

  // =============================================================================
  // Starts Google sign-in. The chosen role (lecturer or student) is remembered, and
  // Google sends the person back to this same page.
  // =============================================================================
  async function signInWithGoogle(role) {
    try {
      localStorage.setItem("lectureapp.pendingRole", role);
    } catch (e) {}
    const redirectTo = location.href.split("#")[0].split("?")[0];
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) throw new Error(error.message);
  }

  // =============================================================================
  // Back from Google: reads the Google account and signs the person in with the role
  // they chose.
  // =============================================================================
  async function finishGoogleSignIn() {
    const { data } = await sb.auth.getSession();
    const u = data?.session?.user;
    if (!u?.email) return null;
    let role = "student";
    try {
      role =
        localStorage.getItem("lectureapp.pendingRole") ||
        getSession()?.role ||
        "student";
      localStorage.removeItem("lectureapp.pendingRole");
    } catch (e) {}
    return login(
      role,
      u.email,
      u.user_metadata?.full_name || u.user_metadata?.name || "",
    );
  }

  // =============================================================================
  // True when the Google sign-in is still valid and belongs to the person this browser
  // remembers. False sends them to the sign-in page.
  // =============================================================================
  async function checkAuth() {
    const { data } = await sb.auth.getSession();
    return (
      !!data?.session?.user?.email &&
      normEmail(data.session.user.email) === getSession()?.email
    );
  }

  // =============================================================================
  // The email of the person signed in.
  // =============================================================================
  const myEmail = () => getSession()?.email || "";

  // =============================================================================
  // A course's weekly lecture times: a list of { day, time, place } (place is a room or
  // "Online"). May be empty.
  // =============================================================================
  const scheduleOf = (r) => (Array.isArray(r.schedule) ? r.schedule : []);

  // =============================================================================
  // A course row from the database in the form the pages use. isOwner is true when the
  // person signed in created the course.
  // =============================================================================
  const course = (r) =>
    r && {
      id: r.id,
      code: r.code,
      name: r.name,
      schedule: scheduleOf(r),
      day: scheduleOf(r)[0]?.day || "",
      time: scheduleOf(r)[0]?.time || "",
      room: scheduleOf(r)[0]?.place || "",
      terms: r.terms,
      lecturerEmail: r.lecturer_email,
      createdAt: ms(r.created_at),
      isOwner:
        String(r.lecturer_email || "").toLowerCase() ===
        myEmail().toLowerCase(),
    };

  // =============================================================================
  // The courses to show. A lecturer sees the courses they own plus the ones another
  // lecturer added them to.
  // =============================================================================
  async function listCourses() {
    const s = getSession();
    let query = sb.from("courses").select("*").order("created_at");
    if (s?.role !== "lecturer") return (await q(query)).map(course);
    const [own, shared] = await Promise.all([
      q(query.eq("lecturer_email", s.email)),
      q(
        sb
          .from("course_admins")
          .select("course_id")
          .eq("email", normEmail(s.email)),
      ).catch(() => []),
    ]);
    const ids = shared
      .map((x) => x.course_id)
      .filter((id) => !own.some((c) => c.id === id));
    const more = ids.length
      ? await q(sb.from("courses").select("*").in("id", ids))
      : [];
    return [...own, ...more]
      .sort((a, b) => ms(a.created_at) - ms(b.created_at))
      .map(course);
  }

  // =============================================================================
  // The course with this join code.
  // =============================================================================
  async function getCourseByCode(code) {
    return course(
      await q(
        sb
          .from("courses")
          .select("*")
          .eq(
            "code",
            String(code || "")
              .trim()
              .toUpperCase(),
          )
          .maybeSingle(),
      ),
    );
  }

  // =============================================================================
  // A new random 6-character join code. Letters and digits that are easy to confuse (O
  // and 0, I and 1) are left out.
  // =============================================================================
  function newCode() {
    const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    return Array.from(
      { length: 6 },
      () => A[Math.floor(Math.random() * A.length)],
    ).join("");
  }

  // =============================================================================
  // Cleans the lecture times the user entered and keeps at most 14.
  // =============================================================================
  const cleanSchedule = (list) =>
    (list || [])
      .map((x) => ({
        day: String(x.day || ""),
        time: String(x.time || ""),
        place: cleanName(x.place || ""),
      }))
      .filter((x) => x.day || x.time || x.place)
      .slice(0, 14);

  // =============================================================================
  // Creates a course. If the join code is already taken it tries a new one, up to 4
  // times in all.
  // =============================================================================
  async function createCourse({ name, schedule, code }) {
    name = cleanName(name);
    if (!name) return { ok: false, error: "Course name is required" };
    const sch = cleanSchedule(schedule);
    for (let i = 0; i < 4; i++) {
      const { data, error } = await sb
        .from("courses")
        .insert({
          code: i ? newCode() : code || newCode(),
          name,
          schedule: sch,
          lecturer_email: myEmail(),
        })
        .select()
        .single();
      if (!error) return { ok: true, course: course(data) };
      if (!/duplicate|unique/i.test(error.message))
        return { ok: false, error: error.message };
    }
    return { ok: false, error: "Could not create a unique code, try again" };
  }

  // =============================================================================
  // A course with the numbers its card shows: how many students, how many joined, join
  // requests waiting, lectures held, whether one is live now, and the next planned
  // lecture.
  // =============================================================================
  async function view(c) {
    if (!c) return null;
    const [roster, sessions] = await Promise.all([
      q(sb.from("roster").select("status").eq("course_id", c.id)),
      q(
        sb
          .from("sessions")
          .select("id, started_at, ended_at, scheduled_at, number, title")
          .eq("course_id", c.id),
      ),
    ]);
    return {
      ...c,
      students: roster.filter((s) => s.status !== "request").length,
      joined: roster.filter((s) => s.status === "joined").length,
      requests: roster.filter((s) => s.status === "request").length,
      sessionsCount: sessions.length,
      live: sessions.some((x) => x.started_at && !x.ended_at),
      held: sessions.filter((x) => x.started_at).length,
      next: (() => {
        const n = sessions
          .filter(
            (x) =>
              !x.started_at &&
              x.scheduled_at &&
              ms(x.scheduled_at) > Date.now() - 3 * 3600e3,
          )
          .sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at))[0];
        return n
          ? {
              at: ms(n.scheduled_at),
              number: n.number,
              title: n.title || `Lecture ${n.number}`,
            }
          : null;
      })(),
      lecture: sessions.length || 1,
    };
  }

  // =============================================================================
  // Deletes a course and everything in it.
  // =============================================================================
  async function deleteCourse(id) {
    await q(sb.from("courses").delete().eq("id", id));
  }

  // =============================================================================
  // The other lecturers who run this course with its owner.
  // =============================================================================
  async function listAdmins(courseId) {
    return (
      await q(
        sb
          .from("course_admins")
          .select("email, added_at")
          .eq("course_id", courseId)
          .order("added_at"),
      )
    ).map((r) => ({ email: r.email, addedAt: ms(r.added_at) }));
  }

  // =============================================================================
  // The owner adds another lecturer to the course by email.
  // =============================================================================
  async function addAdmin(courseId, email) {
    email = normEmail(email);
    if (!isValidEmail(email))
      return { ok: false, error: "That isn't an email address" };
    if (email === normEmail(myEmail()))
      return { ok: false, error: "You already run this course" };
    const { error } = await sb
      .from("course_admins")
      .insert({ course_id: courseId, email });
    if (error)
      return {
        ok: false,
        error: /duplicate|unique/i.test(error.message)
          ? "Already a lecturer on this course"
          : /course_admins|row-level/i.test(error.message)
            ? "Only the course's owner can add lecturers (and run the latest schema.sql)."
            : error.message,
      };
    return { ok: true };
  }

  // =============================================================================
  // The owner removes a lecturer from the course (or a lecturer leaves it).
  // =============================================================================
  async function removeAdmin(courseId, email) {
    await q(
      sb
        .from("course_admins")
        .delete()
        .eq("course_id", courseId)
        .eq("email", normEmail(email)),
    );
  }

  // =============================================================================
  // Renames a course or changes its lecture times.
  // =============================================================================
  async function updateCourse(id, { name, schedule }) {
    name = cleanName(name);
    if (!name) return { ok: false, error: "Course name is required" };
    const { data, error } = await sb
      .from("courses")
      .update({ name, schedule: cleanSchedule(schedule) })
      .eq("id", id)
      .select()
      .single();
    if (error)
      return {
        ok: false,
        error: /schedule/.test(error.message)
          ? "Run the latest schema.sql in Supabase first."
          : error.message,
      };
    return { ok: true, course: course(data) };
  }

  // =============================================================================
  // Splits a full name into first and last name at the first space. The list keeps first
  // name, last name, email and group, and never ID numbers.
  // =============================================================================
  const splitName = (n) => {
    const p = cleanName(n).split(" ");
    return [p[0] || "", p.slice(1).join(" ")];
  };

  // =============================================================================
  // The course's student list: listed students, students who joined, and join requests.
  // =============================================================================
  async function getRoster(courseId) {
    return (
      await q(sb.from("roster").select("*").eq("course_id", courseId))
    ).map((r) => {
      const [f, l] = splitName(r.name);
      return {
        name: r.name,
        firstName: r.first_name ?? f,
        lastName: r.last_name ?? l,
        group: r.group_no || "",
        email: r.email,
        status: r.status,
        addedVia: r.added_via,
      };
    });
  }

  // =============================================================================
  // A student's first name, last name, full name and group, cleaned.
  // =============================================================================
  const person = (s) => {
    const firstName = cleanName(s.firstName ?? splitName(s.name)[0]),
      lastName = cleanName(s.lastName ?? splitName(s.name)[1]);
    return {
      firstName,
      lastName,
      name: cleanName(`${firstName} ${lastName}`),
      group: cleanName(s.group || "").slice(0, 20),
    };
  };

  // =============================================================================
  // Adds one student to the list by hand. If they asked to join already, they are
  // approved instead.
  // =============================================================================
  async function addStudent(courseId, s, via = "manual") {
    const { firstName, lastName, name, group } = person(s),
      email = normEmail(s.email);
    if (!firstName) return { ok: false, error: "First name is missing" };
    if (!isValidEmail(email)) return { ok: false, error: "Email looks wrong" };
    const existing = await q(
      sb
        .from("roster")
        .select("status")
        .eq("course_id", courseId)
        .eq("email", email)
        .maybeSingle(),
    );
    if (existing?.status === "request") {
      await q(
        sb
          .from("roster")
          .update({
            status: "joined",
            name,
            first_name: firstName,
            last_name: lastName,
            group_no: group || null,
          })
          .eq("course_id", courseId)
          .eq("email", email),
      );
      return { ok: true, approved: true };
    }
    if (existing) return { ok: false, error: "Already on the list" };
    await q(
      sb
        .from("roster")
        .insert({
          course_id: courseId,
          email,
          name,
          first_name: firstName,
          last_name: lastName,
          group_no: group || null,
          status: "listed",
          added_via: via,
        }),
    );
    return { ok: true };
  }

  // =============================================================================
  // Adds many students at once (from a CSV), skipping those already on the list. Returns
  // how many were added.
  // =============================================================================
  async function importStudents(courseId, students) {
    const have = new Set((await getRoster(courseId)).map((s) => s.email));
    const rows = [],
      seen = new Set();
    students.forEach((s) => {
      const email = normEmail(s.email);
      const p = person(s);
      if (!isValidEmail(email) || have.has(email) || seen.has(email) || !p.name)
        return;
      seen.add(email);
      rows.push({
        course_id: courseId,
        email,
        name: p.name,
        first_name: p.firstName,
        last_name: p.lastName,
        group_no: p.group || null,
        status: "listed",
        added_via: "csv",
      });
    });
    for (let i = 0; i < rows.length; i += 500)
      await q(sb.from("roster").insert(rows.slice(i, i + 500)));
    return { added: rows.length, skipped: students.length - rows.length };
  }

  // =============================================================================
  // Removes a student from the list.
  // =============================================================================
  async function removeStudent(courseId, email) {
    await q(
      sb
        .from("roster")
        .delete()
        .eq("course_id", courseId)
        .eq("email", normEmail(email)),
    );
  }

  // =============================================================================
  // Changes a student's group.
  // =============================================================================
  async function setGroup(courseId, email, group) {
    await q(
      sb
        .from("roster")
        .update({ group_no: cleanName(group || "").slice(0, 20) || null })
        .eq("course_id", courseId)
        .eq("email", normEmail(email)),
    );
  }

  // =============================================================================
  // Approves a student who asked to join.
  // =============================================================================
  async function approveRequest(courseId, email) {
    await q(
      sb
        .from("roster")
        .update({ status: "joined" })
        .eq("course_id", courseId)
        .eq("email", normEmail(email)),
    );
  }

  // =============================================================================
  // A student joins a course with its code. If they are not on the list yet, a join
  // request goes to the lecturer.
  // =============================================================================
  async function joinCourse(code, email, name) {
    const r = await q(
      sb.rpc("join_course", { p_code: code, p_email: email, p_name: name }),
    );
    return { status: r.status, course: course(r.course) };
  }

  // =============================================================================
  // The courses a student has joined.
  // =============================================================================
  async function myCourses(email) {
    return (await q(sb.rpc("my_courses", { p_email: email }))).map(course);
  }

  // =============================================================================
  // A lecture row from the database in the form the pages use, with each student's
  // checks (first and second) and the blocked attempts.
  // =============================================================================
  function shapeSession(r, att = [], blk = []) {
    const attendance = {};
    att
      .filter((a) => a.session_id === r.id)
      .forEach((a) => {
        (attendance[a.email] = attendance[a.email] || {})[
          a.round === 2 ? "check2" : "check1"
        ] = {
          time: ms(a.time),
          codeAge: a.code_age_ms,
          frames: a.frames,
          network: a.network,
          distance: a.distance,
          flags: a.flags || [],
          framesSeen: a.frames_seen || [],
          ping: a.ping_ms ?? null,
        };
      });
    const startedAt = ms(r.started_at),
      endedAt = ms(r.ended_at);
    return {
      id: r.id,
      short: r.short,
      courseId: r.course_id,
      number: r.number,
      title: r.title || `Lecture ${r.number}`,
      scheduledAt: ms(r.scheduled_at) || startedAt,
      mode: r.mode || "class",
      checkWifi: r.check_wifi !== false,
      checkLocation: r.check_location !== false,
      secondCheck: r.second_check !== false,
      checkin: r.checkin || "closed",
      paused: r.checkin === "paused",
      openedAt: ms(r.opened_at),
      startedAt,
      endedAt,
      state: endedAt ? "ended" : startedAt ? "live" : "planned",
      deck: r.deck || null,
      ctx: { ip: r.ctx_ip ? "saved" : null, lat: r.ctx_lat, lng: r.ctx_lng },
      recheck:
        r.second_check !== false
          ? {
              mode: r.recheck_mode || "manual",
              afterMin: r.recheck_after_min,
              at: ms(r.recheck_at),
              plannedAt: ms(r.recheck_planned),
              startedAt: ms(r.recheck_started),
              window: r.recheck_window || 60,
            }
          : null,
      attendance,
      blocked: blk
        .filter((b) => b.session_id === r.id)
        .map((b) => ({
          email: b.email,
          time: ms(b.time),
          round: b.round,
          reasons: b.reasons || [],
          framesSeen: b.frames_seen || [],
        })),
    };
  }

  // =============================================================================
  // Adds the checks and blocked attempts to a list of lectures, with two requests for
  // all of them together.
  // =============================================================================
  async function withDetails(rows) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [att, blk] = await Promise.all([
      q(sb.from("attendance").select("*").in("session_id", ids)),
      q(sb.from("blocked").select("*").in("session_id", ids)),
    ]);
    return rows.map((r) => shapeSession(r, att, blk));
  }

  // =============================================================================
  // All lectures of a course (planned, live, ended), oldest first.
  // =============================================================================
  async function listSessions(courseId) {
    return withDetails(
      await q(
        sb
          .from("sessions")
          .select("*")
          .eq("course_id", courseId)
          .order("number"),
      ),
    );
  }

  // =============================================================================
  // One lecture with its checks.
  // =============================================================================
  async function getSessionById(id) {
    const rows = await q(sb.from("sessions").select("*").eq("id", id));
    return rows.length ? (await withDetails(rows))[0] : null;
  }

  // =============================================================================
  // The course's live lecture right now, if any.
  // =============================================================================
  async function activeSession(courseId) {
    const rows = await q(
      sb
        .from("sessions")
        .select("*")
        .eq("course_id", courseId)
        .not("started_at", "is", null)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
    );
    return rows.length ? (await withDetails(rows))[0] : null;
  }

  // =============================================================================
  // Plans a new lecture: title, date, in class or online, which checks to use, and when
  // the second check happens (by button, after N minutes, or at a set time).
  // =============================================================================
  async function createSession(
    courseId,
    { title, when, mode, wifi, location, second, recheck = {} },
  ) {
    const r = await q(
      sb.rpc("create_session", {
        p_course: courseId,
        p_title: title || "",
        p_when: when ? new Date(when).toISOString() : null,
        p_mode: mode || "class",
        p_wifi: !!wifi,
        p_location: !!location,
        p_second: !!second,
        p_recheck_mode: recheck.mode || "manual",
        p_recheck_after: recheck.after || null,
        p_recheck_at: recheck.at ? new Date(recheck.at).toISOString() : null,
        p_window: recheck.window || 60,
      }),
    );
    return (await withDetails([r]))[0];
  }

  // =============================================================================
  // Renames a lecture, moves its date, or switches a planned one between in class and
  // online.
  // =============================================================================
  async function updateSession(sessionId, { title, when, mode }) {
    await q(
      sb.rpc("update_session", {
        p_session: sessionId,
        p_title: title ?? null,
        p_when: when ? new Date(when).toISOString() : null,
        p_mode: mode || null,
      }),
    );
  }

  // =============================================================================
  // Starts a lecture (any other live lecture of the course ends).
  // =============================================================================
  async function startSession(sessionId) {
    return (
      await withDetails([
        await q(sb.rpc("start_session", { p_session: sessionId })),
      ])
    )[0];
  }

  // =============================================================================
  // "Start now": a new in-class lecture with every check on, started right away.
  // =============================================================================
  async function quickSession(courseId) {
    const s = await createSession(courseId, {
      title: "",
      when: Date.now(),
      mode: "class",
      wifi: true,
      location: true,
      second: true,
      recheck: { mode: "manual", window: 60 },
    });
    return startSession(s.id);
  }

  // =============================================================================
  // Opens, pauses or closes attendance.
  // =============================================================================
  async function setCheckin(id, state) {
    return q(sb.rpc("set_checkin", { p_session: id, p_state: state }));
  }

  // =============================================================================
  // Sets when the second check happens.
  // =============================================================================
  async function setRecheck(id, { mode, after, at, window }) {
    return q(
      sb.rpc("set_recheck", {
        p_session: id,
        p_mode: mode,
        p_after: after || null,
        p_at: at ? new Date(at).toISOString() : null,
        p_window: window || null,
      }),
    );
  }

  // =============================================================================
  // Every frame the projector showed during a lecture, in order, read 1000 at a time.
  // =============================================================================
  async function listFrames(sessionId) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(
        sb
          .from("frames_log")
          .select("n, round, t, raw")
          .eq("session_id", sessionId)
          .order("n")
          .range(from, from + 999),
      );
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  // =============================================================================
  // Calls one of our server functions (for example fetch-recording) and returns its
  // answer or a clear error.
  // =============================================================================
  async function callFunction(name, body) {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) {
      let msg = error.message;
      try {
        const j = await error.context?.json?.();
        if (j?.error) msg = j.error;
      } catch (e) {}
      if (/not found|404|Failed to send/i.test(msg))
        msg = `The server function "${name}" wasn't found. In Supabase → Edge Functions its name must be exactly ${name}.`;
      else if (/401|unauthori[sz]ed|invalid jwt/i.test(msg))
        msg = `The server function "${name}" refused the request. In its Settings, turn "Verify JWT" off and save.`;
      throw new Error(msg);
    }
    if (data && data.ok === false)
      throw new Error(data.error || "Server function failed");
    return data;
  }

  // =============================================================================
  // Saves where the lecturer is (location) for the distance check. The database reads
  // the network itself from the request.
  // =============================================================================
  async function setSessionContext(id, ctx) {
    return q(
      sb.rpc("set_session_context", {
        p_session: id,
        p_lat: ctx.loc?.lat ?? null,
        p_lng: ctx.loc?.lng ?? null,
      }),
    );
  }

  // =============================================================================
  // Starts the second check now.
  // =============================================================================
  async function startRecheck(id) {
    await q(sb.rpc("start_recheck", { p_session: id }));
  }

  // =============================================================================
  // Ends a lecture.
  // =============================================================================
  async function endSession(id) {
    await q(sb.rpc("end_session", { p_session: id }));
  }

  // =============================================================================
  // A file name made safe for storage: plain letters, digits, dots and dashes only.
  // =============================================================================
  const safeName = (n) =>
    String(n || "file")
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-80) || "file";

  // =============================================================================
  // Uploads a file to one of the private storage folders (buckets).
  // =============================================================================
  async function upload(bucket, path, file) {
    const { error } = await sb.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (error)
      throw new Error(
        /bucket not found/i.test(error.message)
          ? "File storage isn't set up yet: run supabase/schema.sql again."
          : error.message,
      );
    return path;
  }

  // =============================================================================
  // A temporary link to a private file (valid for an hour by default).
  // =============================================================================
  async function fileURL(bucket, path, seconds = 3600) {
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, seconds);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  // =============================================================================
  // Deletes files from storage.
  // =============================================================================
  async function removeFiles(bucket, paths) {
    if (paths.length) await sb.storage.from(bucket).remove(paths);
  }

  // =============================================================================
  // The files in a storage folder.
  // =============================================================================
  async function listFolder(bucket, prefix) {
    const { data } = await sb.storage
      .from(bucket)
      .list(prefix, { limit: 1000 });
    return data || [];
  }

  // =============================================================================
  // Uploads the slides (PDF) for a live lecture. The lecture keeps only a pointer to the
  // file and the slide the lecturer is on. Limit: 50 MB.
  // =============================================================================
  async function uploadDeck(session, file, pages, kind = "pdf") {
    if (file.size > 50 * 1024 * 1024)
      throw new Error("The PDF is too big (max 50 MB)");
    const path = `${session.courseId}/${session.id}/${Date.now()}-${safeName(file.name)}`;
    await upload("decks", path, file);
    await q(
      sb.rpc("set_deck", {
        p_session: session.id,
        p_deck: { path, name: file.name, pages, kind },
      }),
    );
    const old = (await listFolder("decks", `${session.courseId}/${session.id}`))
      .map((f) => `${session.courseId}/${session.id}/${f.name}`)
      .filter((p) => p !== path);
    removeFiles("decks", old).catch(() => {});
    return path;
  }

  // =============================================================================
  // Moves everyone to slide n.
  // =============================================================================
  async function setSlide(id, slide) {
    await q(sb.rpc("set_slide", { p_session: id, p_slide: slide }));
  }

  // =============================================================================
  // Deletes a lecture's slides (when the lecture ends).
  // =============================================================================
  async function removeDeck(session) {
    const files = await listFolder(
      "decks",
      `${session.courseId}/${session.id}`,
    );
    await removeFiles(
      "decks",
      files.map((f) => `${session.courseId}/${session.id}/${f.name}`),
    );
    if (!session.endedAt)
      await q(
        sb.rpc("set_deck", { p_session: session.id, p_deck: null }),
      ).catch(() => {});
  }

  // =============================================================================
  // Deletes slides left over from other lectures of the course.
  // =============================================================================
  async function cleanupDecks(courseId, keepSessionId) {
    const folders = (await listFolder("decks", courseId)).filter(
      (f) => !f.id && f.name !== keepSessionId,
    );
    for (const f of folders) {
      const files = await listFolder("decks", `${courseId}/${f.name}`);
      await removeFiles(
        "decks",
        files.map((x) => `${courseId}/${f.name}/${x.name}`),
      );
    }
  }

  // =============================================================================
  // A temporary link to the slides.
  // =============================================================================
  const deckURL = (path, seconds) => fileURL("decks", path, seconds);

  // =============================================================================
  // A saved lecture material (slides with the lecturer's drawings, a whiteboard) in the
  // form the pages use.
  // =============================================================================
  const material = (r) => ({
    id: r.id,
    courseId: r.course_id,
    sessionId: r.session_id,
    title: r.title,
    kind: r.kind,
    path: r.path,
    size: r.size,
    createdAt: ms(r.created_at),
  });

  // =============================================================================
  // Saves a lecture material for the class.
  // =============================================================================
  async function addMaterial(
    courseId,
    sessionId,
    { title, kind, blob, fileName },
  ) {
    const path = `${courseId}/${Date.now()}-${safeName(fileName)}`;
    await upload(
      "materials",
      path,
      blob instanceof File
        ? blob
        : new File([blob], fileName, { type: blob.type || "application/pdf" }),
    );
    await q(
      sb
        .from("materials")
        .insert({
          course_id: courseId,
          session_id: sessionId || null,
          title: cleanName(title).slice(0, 160),
          kind,
          path,
          size: blob.size,
        }),
    );
  }

  // =============================================================================
  // The materials saved for a course, newest first.
  // =============================================================================
  async function listMaterials(courseId) {
    return (
      await q(
        sb
          .from("materials")
          .select("*")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
      )
    ).map(material);
  }

  // =============================================================================
  // Deletes a saved material and its file.
  // =============================================================================
  async function removeMaterial(m) {
    await removeFiles("materials", [m.path]).catch(() => {});
    await q(sb.from("materials").delete().eq("id", m.id));
  }

  // =============================================================================
  // A temporary link to a saved material.
  // =============================================================================
  const materialURL = (path) => fileURL("materials", path);

  // =============================================================================
  // Deletes a lecture.
  // =============================================================================
  async function deleteSession(id) {
    await q(sb.from("sessions").delete().eq("id", id));
  }

  // =============================================================================
  // Gets the lecture's signing key so the projector can sign its own frames (only the
  // course's lecturers may read it). Also corrects the clock difference.
  // =============================================================================
  async function frameKey(id) {
    const t0 = Date.now();
    const r = await q(sb.rpc("frame_key", { p_session: id }));
    if (r?.now) offset = r.now - (t0 + Date.now()) / 2;
    return r;
  }

  // =============================================================================
  // Sends the frames the projector showed to the server in small batches, for the frames
  // log.
  // =============================================================================
  async function logFrames(id, frames) {
    return q(sb.rpc("log_frames", { p_session: id, p_frames: frames }));
  }

  // =============================================================================
  // Gets ready-signed frames from the server (the older way of showing the code).
  // =============================================================================
  async function getFrames(id, from, count) {
    const r = await q(
      sb.rpc("get_frames", { p_session: id, p_from: from, p_count: count }),
    );
    if (r.now) offset = r.now - Date.now();
    return r;
  }

  // =============================================================================
  // Tells the server a scan is starting, then answers its "ping" 3 times right away. The
  // server measures this phone's internet itself and gives a slow connection a little
  // more time.
  // =============================================================================
  async function beginScan(id, email) {
    const r = await q(sb.rpc("begin_scan", { p_session: id, p_email: email }));
    if (r.ok && r.nonce) {
      for (let i = 0; i < 3; i++) {
        try {
          const p = await q(
            sb.rpc("scan_ping", {
              p_session: id,
              p_email: email,
              p_nonce: r.nonce,
            }),
          );
          r.ping = p.ping;
        } catch {
          break;
        }
      }
    }
    return r;
  }

  // =============================================================================
  // True when an error means the connection dropped.
  // =============================================================================
  const isNetErr = (e) =>
    /fetch|network|load failed|timed? ?out|ECONN|abort/i.test(e?.message || "");

  // =============================================================================
  // Sends the frames the phone read to the server, which runs every check and answers
  // with the result of each. If the connection drops it sends again, up to 3 times.
  // =============================================================================
  async function submitScan(id, email, frames, elapsed, ctx = {}, opts = {}) {
    const args = {
      p_session: id,
      p_email: email,
      p_frames: frames,
      p_elapsed: Math.round(elapsed),
      p_lat: ctx.loc?.lat ?? null,
      p_lng: ctx.loc?.lng ?? null,
      p_dry: !!opts.dryRun,
    };
    for (let i = 0; ; i++) {
      try {
        return await q(sb.rpc("submit_scan", args));
      } catch (e) {
        if (i >= 2 || !isNetErr(e)) throw e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // =============================================================================
  // This student's checks in one lecture.
  // =============================================================================
  async function myRecord(id, email) {
    const rows = await q(
      sb
        .from("attendance")
        .select("*")
        .eq("session_id", id)
        .eq("email", normEmail(email)),
    );
    return shapeSession({ id }, rows).attendance[normEmail(email)] || {};
  }

  // =============================================================================
  // Where the second check stands: not used, planned, open right now, or done.
  // =============================================================================
  function recheckState(s) {
    if (!s.recheck) return { enabled: false };
    const r = s.recheck,
      endsAt = r.startedAt ? r.startedAt + r.window * 1000 : null;
    return {
      enabled: true,
      mode: r.mode,
      afterMin: r.afterMin,
      at: r.at,
      window: r.window,
      plannedAt: r.plannedAt,
      startedAt: r.startedAt,
      endsAt,
      active: !!r.startedAt && now() < endsAt,
      done: !!r.startedAt && now() >= endsAt,
    };
  }

  // =============================================================================
  // A student's mark for a lecture: P (present), H (partial) or A (absent). With a
  // second check, both checks are needed for P; while it is still open, the first check
  // counts as P.
  // =============================================================================
  function statusOf(s, email) {
    const rec = s.attendance[normEmail(email)];
    if (!rec || (!rec.check1 && !rec.check2)) return "A";
    const r = recheckState(s);
    if (!r.enabled || !r.startedAt) return "P";
    if (r.active) return rec.check1 ? "P" : "H";
    return rec.check1 && rec.check2 ? "P" : "H";
  }

  // =============================================================================
  // The numbers the projector shows: students on the list, how many checked in (first
  // and second check), blocked attempts, and the latest arrivals.
  // =============================================================================
  async function sessionStats(id) {
    const s = await getSessionById(id);
    if (!s) return null;
    const roster = (await getRoster(s.courseId)).filter(
      (x) => x.status !== "request",
    );
    const names = Object.fromEntries(roster.map((x) => [x.email, x.name]));
    const entries = Object.entries(s.attendance);
    const arrivals = entries
      .flatMap(([email, r]) =>
        ["check1", "check2"]
          .filter((k) => r[k])
          .map((k) => ({
            email,
            name: names[email] || email,
            time: r[k].time,
            round: k === "check2" ? 2 : 1,
          })),
      )
      .sort((a, b) => b.time - a.time);
    return {
      session: s,
      rosterSize: roster.length,
      round: recheckState(s).active ? 2 : 1,
      recheck: recheckState(s),
      checkedIn: entries.filter(([, r]) => r.check1 || r.check2).length,
      secondCheck: entries.filter(([, r]) => r.check2).length,
      blocked: s.blocked.length,
      arrivals,
    };
  }

  // =============================================================================
  // Starts a live poll with a question, 2 to 4 answers, and an optional time limit.
  // =============================================================================
  async function createPoll(courseId, question, options, durationSec) {
    question = cleanName(question);
    options = options.map(cleanName).filter(Boolean).slice(0, 4);
    if (!question) return { ok: false, error: "Write a question" };
    if (options.length < 2)
      return { ok: false, error: "Add at least 2 answers" };
    await q(
      sb
        .from("polls")
        .update({ closed: true })
        .eq("course_id", courseId)
        .eq("closed", false),
    );
    const closes = durationSec
      ? new Date(now() + durationSec * 1000).toISOString()
      : null;
    await q(
      sb
        .from("polls")
        .insert({ course_id: courseId, question, options, closes_at: closes }),
    );
    return { ok: true };
  }

  // =============================================================================
  // The course's latest poll with its results, and this student's own vote.
  // =============================================================================
  async function currentPoll(courseId, email) {
    return q(
      sb.rpc("poll_state", { p_course: courseId, p_email: email || myEmail() }),
    );
  }

  // =============================================================================
  // A student votes (or changes their vote).
  // =============================================================================
  async function vote(pollId, email, idx) {
    return q(sb.rpc("vote", { p_poll: pollId, p_email: email, p_choice: idx }));
  }

  // =============================================================================
  // Closes a poll.
  // =============================================================================
  async function closePoll(id) {
    await q(sb.from("polls").update({ closed: true }).eq("id", id));
  }

  // =============================================================================
  // A student sends a question, anonymous by default. Questions written while offline
  // are sent later with the time they were written.
  // =============================================================================
  async function addComment(courseId, email, text, anonymous, opts = {}) {
    return q(
      sb.rpc("add_comment", {
        p_course: courseId,
        p_email: email,
        p_text: text,
        p_anon: !!anonymous,
        p_created: opts.createdAt || null,
        p_queued: !!opts.queued,
      }),
    );
  }

  // =============================================================================
  // The course's questions, most upvoted first. Anonymous questions never carry their
  // author's name.
  // =============================================================================
  async function listComments(courseId, email) {
    return q(
      sb.rpc("list_comments", {
        p_course: courseId,
        p_email: email || myEmail(),
      }),
    );
  }

  // =============================================================================
  // A student upvotes a question, or takes the upvote back.
  // =============================================================================
  async function toggleUpvote(id, email) {
    await q(sb.rpc("toggle_upvote", { p_comment: id, p_email: email }));
  }

  // =============================================================================
  // The lecturer answers a question in writing.
  // =============================================================================
  async function replyComment(id, text) {
    await q(sb.rpc("reply_comment", { p_comment: id, p_reply: text }));
  }

  // =============================================================================
  // A student's own attendance in a course.
  // =============================================================================
  async function myAttendance(courseId, email) {
    return q(
      sb.rpc("my_attendance", {
        p_course: courseId,
        p_email: email || myEmail(),
      }),
    );
  }

  // =============================================================================
  // A student who could not check in asks the lecturer to mark them present.
  // =============================================================================
  async function requestAttendance(sessionId, reason) {
    return q(
      sb.rpc("request_attendance", {
        p_session: sessionId,
        p_email: myEmail(),
        p_reason: reason,
      }),
    );
  }

  // =============================================================================
  // The requests waiting for the lecturer.
  // =============================================================================
  async function listAttendanceRequests(courseId) {
    return (
      (await q(sb.rpc("list_attendance_requests", { p_course: courseId }))) ||
      []
    );
  }

  // =============================================================================
  // The lecturer approves or refuses a request.
  // =============================================================================
  async function decideAttendanceRequest(id, approve) {
    return q(
      sb.rpc("decide_attendance_request", { p_id: id, p_approve: !!approve }),
    );
  }

  // =============================================================================
  // The lecturer sets a student's mark by hand.
  // =============================================================================
  async function setAttendance(sessionId, email, status) {
    return q(
      sb.rpc("set_attendance", {
        p_session: sessionId,
        p_email: email,
        p_status: status,
      }),
    );
  }

  // =============================================================================
  // The lecturer marks a question answered, or hides it.
  // =============================================================================
  async function setCommentState(id, st) {
    await q(
      sb.rpc("set_comment_state", {
        p_comment: id,
        p_answered: "answered" in st ? !!st.answered : null,
        p_hidden: "hidden" in st ? !!st.hidden : null,
      }),
    );
  }

  // =============================================================================
  // A lecture summary row in the form the pages use.
  // =============================================================================
  const summary = (r) => ({
    id: r.id,
    courseId: r.course_id,
    label: r.label,
    source: r.source,
    fileName: r.file_name,
    spoken: r.spoken,
    outLang: r.out_lang,
    status: r.status,
    step: r.step,
    error: r.error,
    result: r.result,
    shared: r.shared,
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
  });

  // =============================================================================
  // Starts a new summary job (it shows as "working" until the AI finishes).
  // =============================================================================
  async function createSummary(
    courseId,
    { label, source, fileName, spoken, outLang },
  ) {
    return summary(
      await q(
        sb
          .from("summaries")
          .insert({
            course_id: courseId,
            label: cleanName(label) || "Lecture",
            source,
            file_name: fileName,
            spoken,
            out_lang: outLang,
            step: "Starting…",
          })
          .select()
          .single(),
      ),
    );
  }

  // =============================================================================
  // Saves the progress or the result of a summary, or shares it with students.
  // =============================================================================
  async function updateSummary(id, patch) {
    const map = {
      status: "status",
      step: "step",
      error: "error",
      result: "result",
      shared: "shared",
    };
    const row = {};
    Object.keys(patch).forEach((k) => {
      if (map[k]) row[map[k]] = patch[k];
    });
    row.updated_at = new Date().toISOString();
    const { error } = await sb.from("summaries").update(row).eq("id", id);
    if (error && /updated_at/.test(error.message)) {
      delete row.updated_at;
      await q(sb.from("summaries").update(row).eq("id", id));
    } else if (error) throw new Error(error.message);
  }

  // =============================================================================
  // A course's summaries, newest first. Students only see the shared ones.
  // =============================================================================
  async function listSummaries(courseId, { sharedOnly } = {}) {
    let query = sb
      .from("summaries")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
    if (sharedOnly) query = query.eq("shared", true).eq("status", "ready");
    return (await q(query))
      .map(summary)
      .map((s) =>
        s.status === "processing" &&
        now() - (s.updatedAt || s.createdAt) > 90 * 1000
          ? {
              ...s,
              status: "error",
              error:
                "Interrupted: the page was closed while working. Try again.",
            }
          : s,
      );
  }

  // =============================================================================
  // Deletes a summary.
  // =============================================================================
  async function deleteSummary(id) {
    await q(sb.from("summaries").delete().eq("id", id));
  }

  // =============================================================================
  // An assignment row in the form the pages use.
  // =============================================================================
  const assignment = (r) =>
    r && {
      id: r.id,
      courseId: r.course_id,
      title: r.title,
      instructions: r.instructions,
      due: r.due,
      rubric: r.rubric,
      insights: r.insights,
      createdAt: ms(r.created_at),
      briefPath: r.brief_path || null,
      briefName: r.brief_name || "",
      briefText: r.brief_text || "",
    };

  // =============================================================================
  // A handed-in work row in the form the pages use.
  // =============================================================================
  const submission = (r) => ({
    id: r.id,
    assignmentId: r.assignment_id,
    email: r.email,
    createdAt: ms(r.created_at),
    fileName: r.file_name,
    kind: r.kind,
    text: r.text,
    status: r.status,
    review: r.review,
    error: r.error,
    filePath: r.file_path || null,
    link: r.link || "",
    extra: r.extra || "",
    uploadedBy: r.uploaded_by || "",
    comparison: r.comparison || null,
  });

  // =============================================================================
  // Creates an assignment, with its PDF if the lecturer added one.
  // =============================================================================
  async function createAssignment(
    courseId,
    { title, instructions, due, rubric, brief, briefText },
  ) {
    title = cleanName(title);
    rubric = (rubric || [])
      .map((r) => ({
        name: cleanName(r.name),
        points: Math.max(1, Math.round(Number(r.points) || 0)),
        description: String(r.description || "").trim(),
      }))
      .filter((r) => r.name);
    if (!title) return { ok: false, error: "Give the assignment a title" };
    if (!rubric.length)
      rubric = [{ name: "Score", points: 100, description: "" }];
    const r = await q(
      sb
        .from("assignments")
        .insert({
          course_id: courseId,
          title,
          instructions: String(instructions || "").trim(),
          due: due || "",
          rubric,
        })
        .select()
        .single(),
    );
    if (brief) {
      try {
        await setBrief(r.id, courseId, brief, briefText);
      } catch (e) {
        return {
          ok: true,
          assignment: assignment(r),
          warning:
            "The assignment was created, but its file didn't upload: " +
            e.message,
        };
      }
    }
    return { ok: true, assignment: assignment(r) };
  }

  // =============================================================================
  // A course's assignments, newest first.
  // =============================================================================
  async function listAssignments(courseId) {
    return (
      await q(
        sb
          .from("assignments")
          .select("*")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
      )
    ).map(assignment);
  }

  // =============================================================================
  // One assignment.
  // =============================================================================
  async function getAssignment(id) {
    return id
      ? assignment(
          await q(
            sb.from("assignments").select("*").eq("id", id).maybeSingle(),
          ),
        )
      : null;
  }

  // =============================================================================
  // Deletes an assignment and all its files (its PDF and every handed-in file).
  // =============================================================================
  async function deleteAssignment(id) {
    const [a, subs] = await Promise.all([
      q(sb.from("assignments").select("brief_path").eq("id", id).maybeSingle()),
      q(sb.from("submissions").select("file_path").eq("assignment_id", id)),
    ]);
    const paths = [a?.brief_path, ...subs.map((x) => x.file_path)].filter(
      Boolean,
    );
    await removeFiles("homework", paths).catch(() => {});
    await q(sb.from("assignments").delete().eq("id", id));
  }

  // =============================================================================
  // Saves the AI's notes about the whole class for an assignment.
  // =============================================================================
  async function setInsights(id, insights) {
    await q(
      sb
        .from("assignments")
        .update({ insights: { ...insights, at: now() } })
        .eq("id", id),
    );
  }

  // =============================================================================
  // Hands in work: a file, pasted text, a link, or any of these together. The lecturer
  // can also hand in for a student (byLecturer); then email is the student's key (their
  // email, or "row-<id>" for a name typed in without one).
  // =============================================================================
  async function submitHomework(
    assignmentId,
    email,
    { fileName, kind, text, file, link, extra, byLecturer = false },
  ) {
    email = byLecturer
      ? String(email || "")
          .trim()
          .toLowerCase()
      : normEmail(email);
    const a = await getAssignment(assignmentId);
    if (!a) return { ok: false, error: "Assignment not found" };
    if (!byLecturer) {
      const me = await q(
        sb
          .from("roster")
          .select("status")
          .eq("course_id", a.courseId)
          .eq("email", email)
          .maybeSingle(),
      );
      if (!me || me.status === "request")
        return { ok: false, error: "You are not on the list for this course" };
    }
    const old = await q(
      sb
        .from("submissions")
        .select("file_path, link, extra")
        .eq("assignment_id", assignmentId)
        .eq("email", email)
        .maybeSingle(),
    );
    let filePath = file ? null : old?.file_path || null;
    if (file) {
      if (file.size > 25 * 1024 * 1024)
        return { ok: false, error: "The file is too big (max 25 MB)" };
      filePath = `${a.courseId}/${a.id}/subs/${email}/${Date.now()}-${safeName(file.name)}`;
      try {
        await upload("homework", filePath, file);
      } catch (e) {
        return { ok: false, error: "Upload failed: " + e.message };
      }
      if (old?.file_path)
        removeFiles("homework", [old.file_path]).catch(() => {});
    }
    await q(
      sb
        .from("submissions")
        .delete()
        .eq("assignment_id", assignmentId)
        .eq("email", email),
    );
    const r = await q(
      sb
        .from("submissions")
        .insert({
          assignment_id: assignmentId,
          email,
          file_name: fileName || file?.name || "",
          kind,
          text: String(text || "").slice(0, 60000),
          file_path: filePath,
          link: String(link ?? old?.link ?? "")
            .trim()
            .slice(0, 500),
          extra: String(extra ?? old?.extra ?? "")
            .trim()
            .slice(0, 1000),
          uploaded_by: byLecturer ? myEmail() : null,
        })
        .select()
        .single(),
    );
    return { ok: true, submission: submission(r) };
  }

  // =============================================================================
  // Saves the review (or an error) for a handed-in work.
  // =============================================================================
  async function setSubmission(id, patch) {
    const row = {};
    ["status", "review", "error", "comparison", "link", "extra"].forEach(
      (k) => {
        if (k in patch) row[k] = patch[k];
      },
    );
    await q(sb.from("submissions").update(row).eq("id", id));
  }

  // =============================================================================
  // Attaches the assignment's PDF and the text read from it.
  // =============================================================================
  async function setBrief(assignmentId, courseId, file, text) {
    const path = `${courseId}/${assignmentId}/brief/${Date.now()}-${safeName(file.name)}`;
    await upload("homework", path, file);
    const old = await q(
      sb
        .from("assignments")
        .select("brief_path")
        .eq("id", assignmentId)
        .maybeSingle(),
    );
    await q(
      sb
        .from("assignments")
        .update({
          brief_path: path,
          brief_name: file.name,
          brief_text: String(text || "").slice(0, 40000),
        })
        .eq("id", assignmentId),
    );
    if (old?.brief_path)
      removeFiles("homework", [old.brief_path]).catch(() => {});
  }

  // =============================================================================
  // A temporary link to a handed-in file.
  // =============================================================================
  const homeworkURL = (path) => fileURL("homework", path);

  // =============================================================================
  // A row of an assignment's own student list, in the form the pages use.
  // =============================================================================
  const hwStudent = (r) => ({
    id: r.id,
    assignmentId: r.assignment_id,
    email: r.email || "",
    name: r.name || "",
    group: r.group_no || "",
    link: r.link || "",
    extra: r.extra || "",
    key: r.email || "row-" + r.id,
  });

  // =============================================================================
  // An assignment's student list.
  // =============================================================================
  async function listHwStudents(assignmentId) {
    return (
      await q(
        sb
          .from("hw_students")
          .select("*")
          .eq("assignment_id", assignmentId)
          .order("created_at"),
      )
    ).map(hwStudent);
  }

  // =============================================================================
  // Adds students to an assignment's list. A student whose email is already there is
  // updated instead (a newer link wins).
  // =============================================================================
  async function addHwStudents(assignmentId, rows) {
    const existing = await q(
      sb
        .from("hw_students")
        .select("id, email")
        .eq("assignment_id", assignmentId),
    );
    const byEmail = new Map(
      existing.filter((x) => x.email).map((x) => [x.email, x.id]),
    );
    let added = 0,
      updated = 0;
    const fresh = [];
    for (const r of rows) {
      const email = r.email ? normEmail(r.email) : null;
      const row = {
        name: cleanName(r.name || "").slice(0, 120),
        group_no: cleanName(r.group || "").slice(0, 40),
        link: String(r.link || "")
          .trim()
          .slice(0, 500),
        extra: String(r.extra || "")
          .trim()
          .slice(0, 1000),
      };
      if (email && byEmail.has(email)) {
        const patch = Object.fromEntries(
          Object.entries(row).filter(([, v]) => v),
        );
        if (Object.keys(patch).length)
          await q(
            sb.from("hw_students").update(patch).eq("id", byEmail.get(email)),
          );
        updated++;
      } else {
        fresh.push({ assignment_id: assignmentId, email, ...row });
        if (email) byEmail.set(email, "new");
        added++;
      }
    }
    for (let i = 0; i < fresh.length; i += 200)
      await q(sb.from("hw_students").insert(fresh.slice(i, i + 200)));
    return { added, updated };
  }

  // =============================================================================
  // Changes a row of the assignment's list.
  // =============================================================================
  async function updateHwStudent(id, patch) {
    const row = {};
    if ("name" in patch) row.name = cleanName(patch.name);
    if ("group" in patch) row.group_no = cleanName(patch.group);
    if ("link" in patch) row.link = String(patch.link || "").trim();
    if ("email" in patch)
      row.email = patch.email ? normEmail(patch.email) : null;
    await q(sb.from("hw_students").update(row).eq("id", id));
  }

  // =============================================================================
  // Removes a row from the assignment's list.
  // =============================================================================
  async function removeHwStudent(id) {
    await q(sb.from("hw_students").delete().eq("id", id));
  }

  // =============================================================================
  // This student's row in the assignment's list.
  // =============================================================================
  async function myHwRow(assignmentId, email) {
    const r = await q(
      sb
        .from("hw_students")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("email", normEmail(email))
        .maybeSingle(),
    );
    return r ? hwStudent(r) : null;
  }

  // =============================================================================
  // Everything handed in for an assignment.
  // =============================================================================
  async function listSubmissions(assignmentId) {
    const a = await getAssignment(assignmentId);
    const [subs, roster] = await Promise.all([
      q(sb.from("submissions").select("*").eq("assignment_id", assignmentId)),
      getRoster(a.courseId),
    ]);
    const names = Object.fromEntries(roster.map((s) => [s.email, s.name]));
    return subs
      .map(submission)
      .map((s) => ({ ...s, name: names[s.email] || s.email }));
  }

  // =============================================================================
  // What this student handed in.
  // =============================================================================
  async function mySubmission(assignmentId, email) {
    const r = await q(
      sb
        .from("submissions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("email", normEmail(email))
        .maybeSingle(),
    );
    return r ? submission(r) : null;
  }

  // =============================================================================
  // The class's scores for an assignment (average, spread), without names.
  // =============================================================================
  async function classStats(assignmentId) {
    const r = await q(sb.rpc("class_stats", { p_assignment: assignmentId }));
    return r
      ? {
          ...r,
          avg: r.avg == null ? null : Number(r.avg),
          totals: (r.totals || []).map(Number),
          perCriterion: Object.fromEntries(
            Object.entries(r.perCriterion || {}).map(([k, v]) => [
              k,
              v == null ? null : Number(v),
            ]),
          ),
        }
      : { n: 0, max: 0, totals: [], avg: null, perCriterion: {} };
  }

  // =============================================================================
  // Redraws every page part that listens for changes.
  // =============================================================================
  // =============================================================================
  // There is no live push from the server yet, so pages refresh every few seconds. A
  // refresh never runs while the tab is hidden and never two at once, so a slow
  // connection is not flooded.
  // =============================================================================
  const changeListeners = [];
  let redrawAll = () => {};

  // =============================================================================
  // Calls cb every few seconds (2.5 by default) and when the tab comes back into view.
  // =============================================================================
  function onChange(cb, ms = 2500) {
    let running = false;
    // One refresh, skipped if the last one has not finished or the tab is hidden.
    const run = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await cb();
      } catch (e) {
      } finally {
        running = false;
      }
    };
    changeListeners.push(run);
    redrawAll = () => changeListeners.forEach((f) => f());
    setInterval(run, ms);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) run();
    });
  }

  // =============================================================================
  // Everything the pages can use, by name.
  // =============================================================================
  const api = {
    ready: true,
    getSession,
    logout,
    signInWithGoogle,
    finishGoogleSignIn,
    checkAuth,
    listCourses,
    getCourseByCode,
    createCourse,
    updateCourse,
    listAdmins,
    addAdmin,
    removeAdmin,
    deleteCourse,
    newCode,
    view,
    updateSession,
    getRoster,
    addStudent,
    importStudents,
    removeStudent,
    setGroup,
    approveRequest,
    joinCourse,
    myCourses,
    activeSession,
    listSessions,
    createSession,
    startSession,
    quickSession,
    setCheckin,
    setRecheck,
    listFrames,
    callFunction,
    setSessionContext,
    startRecheck,
    recheckState,
    getFrames,
    frameKey,
    logFrames,
    parseFrame,
    beginScan,
    submitScan,
    statusOf,
    sessionStats,
    myRecord,
    endSession,
    deleteSession,
    createPoll,
    currentPoll,
    vote,
    closePoll,
    addComment,
    listComments,
    toggleUpvote,
    setCommentState,
    replyComment,
    myAttendance,
    requestAttendance,
    listAttendanceRequests,
    decideAttendanceRequest,
    setAttendance,
    createSummary,
    updateSummary,
    listSummaries,
    deleteSummary,
    createAssignment,
    listAssignments,
    getAssignment,
    deleteAssignment,
    setInsights,
    setBrief,
    homeworkURL,
    listHwStudents,
    addHwStudents,
    updateHwStudent,
    removeHwStudent,
    myHwRow,
    uploadDeck,
    setSlide,
    removeDeck,
    cleanupDecks,
    deckURL,
    addMaterial,
    listMaterials,
    removeMaterial,
    materialURL,
    submitHomework,
    setSubmission,
    listSubmissions,
    mySubmission,
    classStats,
    isValidEmail,
    normEmail,
    cleanName,
    onChange,
    RULES,
    totalOf,
    isRemote: true,
    now,
    __redraw: () => redrawAll(),
  };
  return withQuickCache(api);
})();

// =============================================================================
// Quick first paint on slow connections. The first time a page asks for a list
// (courses, lectures, students...) it gets what this browser saw last time straight
// away, while the real answer loads; when it arrives the page redraws. After that, or
// after any change the user makes, every call goes to the server, so nothing acts on
// old data.
// =============================================================================
function withQuickCache(api) {
  const READS = [
    "listCourses",
    "getCourseByCode",
    "view",
    "getRoster",
    "myCourses",
    "listSessions",
    "listSummaries",
    "listAssignments",
    "getAssignment",
    "listSubmissions",
    "mySubmission",
    "myAttendance",
    "listComments",
    "listMaterials",
    "classStats",
    "listAttendanceRequests",
    "listHwStudents",
    "myHwRow",
  ];
  const PURE = new Set([
    "getSession",
    "now",
    "newCode",
    "totalOf",
    "recheckState",
    "statusOf",
    "normEmail",
    "cleanName",
    "isValidEmail",
    "parseFrame",
    "onChange",
    "sessionStats",
    "currentPoll",
    "getFrames",
    "frameKey",
    "logFrames",
    "beginScan",
    "activeSession",
    "checkAuth",
    "listFrames",
    "__redraw",
    "homeworkURL",
    "deckURL",
    "materialURL",
    "myRecord",
    "callFunction",
    "setSlide",
    ...READS,
  ]);
  const quick =
    !/(\/|index\.html|live\.html|scan\.html|student\/homework\.html)$/.test(
      location.pathname,
    );
  const PREFIX = "cp.c1.";
  let fresh = false;
  const usedOnce = new Set();
  // Who is signed in, so each person has their own saved copies.
  const who = () => api.getSession?.()?.email || "anon";
  // The storage name for one saved answer.
  const keyOf = (name, args) =>
    PREFIX + who() + "|" + name + "|" + JSON.stringify(args);
  const out = { ...api };
  for (const name of READS) {
    const fn = api[name];
    if (typeof fn !== "function") continue;
    out[name] = async (...args) => {
      const k = keyOf(name, args);
      const live = fn(...args).then((v) => {
        try {
          const j = JSON.stringify(v);
          if (j.length < 400000) localStorage.setItem(k, j);
        } catch (e) {}
        return v;
      });
      if (!quick || fresh || usedOnce.has(k)) return live;
      usedOnce.add(k);
      let cached = null;
      try {
        cached = localStorage.getItem(k);
      } catch (e) {}
      if (cached == null) return live;
      live
        .then((v) => {
          try {
            if (JSON.stringify(v) !== cached) out.__redraw?.();
          } catch (e) {}
        })
        .catch(() => {});
      try {
        return JSON.parse(cached);
      } catch (e) {
        return live;
      }
    };
  }
  for (const [name, fn] of Object.entries(api)) {
    if (typeof fn !== "function" || PURE.has(name)) continue;
    out[name] = (...args) => {
      fresh = true;
      forget();
      return fn(...args);
    };
  }
  // Deletes every saved answer (after a change, and on sign-out).
  function forget() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }
  const logout = api.logout;
  out.logout = (...a) => {
    forget();
    return logout?.(...a);
  };
  return out;
}
