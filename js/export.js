// =============================================================================
// Exports the attendance sheet. It builds the tables once and can write them as a CSV
// file (always works) or as a real Excel file (the Excel library is loaded only when
// needed).
// =============================================================================
const ATT = (() => {
  // =============================================================================
  // The words for each attendance mark: P = present, H = partial (only one of two
  // checks), A = absent.
  // =============================================================================
  const LABEL = { P: "Present", H: "Partial", A: "Absent" };
  const NET = {
    match: "Class Wi-Fi",
    different: "Other network",
    unknown: "Unknown",
    skipped: "Not checked",
    manual: "Set by the lecturer",
  };

  // =============================================================================
  // Collects everything the sheet needs: the lectures that already started, the students
  // on the list, each student's mark per lecture and total %, every successful check,
  // and every blocked attempt. A partial attendance counts as partialWeight (half by
  // default).
  // =============================================================================
  async function build(course, partialWeight = 0.5) {
    const sessions = (await API.listSessions(course.id)).filter(
      (s) => s.startedAt,
    );
    const roster = (await API.getRoster(course.id))
      .filter((s) => s.status !== "request")
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    const weight = { P: 1, H: partialWeight, A: 0 };

    const cols = sessions.map((s) => ({
      id: s.id,
      short: `L${s.number}`,
      label: `L${s.number}, ${new Date(s.startedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })}`,
      session: s,
    }));

    const rows = roster.map((st) => {
      const marks = sessions.map((s) => API.statusOf(s, st.email));
      const score = marks.length
        ? marks.reduce((sum, m) => sum + weight[m], 0) / marks.length
        : null;
      return {
        ...st,
        marks,
        pct: score === null ? "-" : Math.round(score * 100) + "%",
      };
    });

    const checks = [];
    sessions.forEach((s) =>
      Object.entries(s.attendance).forEach(([email, rec]) => {
        const st = roster.find((x) => x.email === email);
        ["check1", "check2"].forEach((k, i) => {
          const c = rec[k];
          if (!c) return;
          checks.push({
            lecture: `L${s.number}`,
            name: st?.name || email,
            email,
            check: i + 1,
            time: new Date(c.time).toLocaleString("en-GB"),
            codeAgeS: c.codeAge != null ? (c.codeAge / 1000).toFixed(1) : "",
            network: NET[c.network] || c.network,
            distanceM: c.distance ?? "",
            flags: (c.flags || []).join("; "),
          });
        });
      }),
    );

    const blocked = sessions.flatMap((s) =>
      s.blocked.map((b) => ({
        lecture: `L${s.number}`,
        name: roster.find((x) => x.email === b.email)?.name || b.email,
        email: b.email,
        time: new Date(b.time).toLocaleString("en-GB"),
        check: b.round,
        reasons: b.reasons.join("; "),
      })),
    );

    return { sessions, cols, rows, checks, blocked };
  }

  // =============================================================================
  // The main sheet as rows: one row per student, one column per lecture, and a total
  // column when there is more than one lecture.
  // =============================================================================
  function matrix(data) {
    const one = data.cols.length === 1;
    return [
      [
        "First name",
        "Last name",
        "Email",
        "Group",
        ...data.cols.map((c) => c.label),
        ...(one ? [] : ["Total"]),
      ],
      ...data.rows.map((r) => [
        r.firstName,
        r.lastName,
        r.email,
        r.group || "",
        ...r.marks.map((m) => LABEL[m]),
        ...(one ? [] : [r.pct]),
      ]),
    ];
  }

  // =============================================================================
  // The same data cut down to a single lecture.
  // =============================================================================
  function only(data, sessionId) {
    const i = data.cols.findIndex((c) => c.id === sessionId);
    if (i < 0) return data;
    const col = data.cols[i],
      lec = col.short;
    return {
      ...data,
      one: col,
      sessions: [data.sessions[i]],
      cols: [col],
      rows: data.rows.map((r) => ({ ...r, marks: [r.marks[i]] })),
      checks: data.checks.filter((c) => c.lecture === lec),
      blocked: data.blocked.filter((b) => b.lecture === lec),
    };
  }

  // =============================================================================
  // The file name for the download: the course name plus the lecture (or "attendance"
  // for the whole course).
  // =============================================================================
  function fileBase(course, data) {
    if (data?.one) {
      const d = new Date(data.one.session.startedAt).toISOString().slice(0, 10);
      return `attendance_${course.code}_${data.one.short}_${d}`;
    }
    return `attendance_${course.code}_all_${new Date().toISOString().slice(0, 10)}`;
  }

  // =============================================================================
  // Saves a file to the user's computer.
  // =============================================================================
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // =============================================================================
  // Turns rows into CSV text, putting quotes around cells that need them.
  // =============================================================================
  function toCSV(table) {
    // One cell, quoted if it holds a comma, a quote or a line break.
    const cell = (v) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return table.map((r) => r.map(cell).join(",")).join("\r\n");
  }

  // =============================================================================
  // Downloads the sheet as CSV. The BOM mark at the start makes Excel show Hebrew and
  // Arabic names correctly.
  // =============================================================================
  function exportCSV(course, data) {
    download(
      new Blob(["﻿" + toCSV(matrix(data))], { type: "text/csv;charset=utf-8" }),
      fileBase(course, data) + ".csv",
    );
  }

  // =============================================================================
  // Loads the Excel library (SheetJS) once.
  // =============================================================================
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload = resolve;
      s.onerror = () =>
        reject(new Error("Could not load the Excel library (are you online?)"));
      document.head.appendChild(s);
    });
  }

  // =============================================================================
  // Downloads a real Excel file with three sheets: attendance, every check, and blocked
  // attempts.
  // =============================================================================
  async function exportXLSX(course, data) {
    await loadSheetJS();
    const wb = XLSX.utils.book_new();
    // One Excel sheet from rows, with the given column widths.
    const sheet = (rows, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = widths.map((w) => ({ wch: w }));
      return ws;
    };
    const m = matrix(data);
    XLSX.utils.book_append_sheet(
      wb,
      sheet(m, [16, 18, 32, 8, ...data.cols.map(() => 12), 8]),
      "Attendance",
    );
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        [
          [
            "Lecture",
            "Name",
            "Email",
            "Check",
            "Time",
            "Code age (s)",
            "Network",
            "Distance (m)",
            "Notes",
          ],
          ...data.checks.map((c) => [
            c.lecture,
            c.name,
            c.email,
            c.check,
            c.time,
            c.codeAgeS,
            c.network,
            c.distanceM,
            c.flags,
          ]),
        ],
        [8, 24, 32, 6, 20, 12, 14, 12, 30],
      ),
      "Check details",
    );
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        [
          ["Lecture", "Name", "Email", "Check", "Time", "Why it was blocked"],
          ...data.blocked.map((b) => [
            b.lecture,
            b.name,
            b.email,
            b.check,
            b.time,
            b.reasons,
          ]),
        ],
        [8, 24, 32, 6, 20, 50],
      ),
      "Blocked attempts",
    );
    XLSX.writeFile(wb, fileBase(course, data) + ".xlsx");
  }

  // =============================================================================
  // Downloads the QR frames log of one lecture: every frame the projector showed, in
  // order, and which students' phones captured it.
  // =============================================================================
  async function exportFrames(course, session, frames, data, kind) {
    const who = new Map();
    Object.entries(session.attendance).forEach(([email, rec]) =>
      ["check1", "check2"].forEach((k) =>
        (rec[k]?.framesSeen || []).forEach(([n]) => {
          if (!who.has(n)) who.set(n, []);
          who.get(n).push(email);
        }),
      ),
    );
    // A date and time with milliseconds, for the frames log.
    const time = (t) => {
      const d = new Date(Number(t));
      return (
        d.toLocaleDateString("en-GB") +
        " " +
        d.toLocaleTimeString("en-GB", { hour12: false }) +
        "." +
        String(Number(t) % 1000).padStart(3, "0")
      );
    };
    const rows = [
      ["Frame", "Shown at", "Check", "Scanned by", "QR content"],
      ...frames.map((f) => [
        f.n,
        time(f.t),
        f.round,
        (who.get(f.n) || []).length,
        f.raw,
      ]),
    ];
    const base = `qr_frames_${course.code}_L${session.number}`;
    if (kind === "csv")
      return download(
        new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8" }),
        base + ".csv",
      );
    await loadSheetJS();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [8, 24, 6, 10, 60].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Frames");
    const per = [["Student", "Email", "Check", "Frame", "Shown at"]];
    data.rows.forEach((r) => {
      const rec = session.attendance[r.email] || {};
      ["check1", "check2"].forEach((k, i) =>
        (rec[k]?.framesSeen || []).forEach(([n, t]) =>
          per.push([r.name, r.email, i + 1, n, time(t)]),
        ),
      );
    });
    const ws2 = XLSX.utils.aoa_to_sheet(per);
    ws2["!cols"] = [24, 30, 6, 8, 24].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "Scanned by student");
    XLSX.writeFile(wb, base + ".xlsx");
  }

  return { build, only, exportCSV, exportXLSX, exportFrames, LABEL, NET };
})();
