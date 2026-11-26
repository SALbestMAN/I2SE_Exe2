// =============================================================================
// Reads spreadsheets of students: the course list exported from Moodle, or a homework
// hand-in list from a Google Form. It copes with quotes, Windows line endings and
// headers in English, Hebrew or Arabic. ID numbers are never read.
// =============================================================================
const CSV = (() => {
  // =============================================================================
  // Turns the raw text of a CSV file into rows of cells. Handles commas and line breaks
  // inside quotes, doubled quotes, the invisible BOM mark at the start, and drops empty
  // rows.
  // =============================================================================
  function parse(text) {
    text = String(text).replace(/^﻿/, "");
    const rows = [];
    let row = [],
      field = "",
      inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  // =============================================================================
  // The words we look for in a header to know what a column holds (first name, last
  // name, full name, email, group), in English, Hebrew and Arabic.
  // =============================================================================
  const HINTS = {
    first: [/^first/i, /given/i, /שם פרטי/, /الاسم الأول|الاسم الاول/],
    last: [/^last/i, /surname/i, /family/i, /שם משפחה/, /اسم العائلة|العائلة/],
    full: [/full ?name/i, /^name$/i, /שם מלא/, /^שם$/, /^الاسم$/],
    email: [/e-?mail/i, /mail/i, /דוא/, /אימייל/, /البريد|بريد/],
    group: [
      /group/i,
      /קבוצ/,
      /מס'? ?קבוצה/,
      /مجموعة|المجموعة|شعبة/,
      /section/i,
    ],
  };

  // =============================================================================
  // Looks at the header row and decides which column is the first name, last name, email
  // and group. If no header says "email", it picks the column whose values look most
  // like emails. Returns column numbers, or -1 when a column is not there.
  // =============================================================================
  function guess(rows) {
    const headers = rows[0] || [];
    // Finds the first header that matches one of the hints for this kind of column.
    const find = (key) =>
      headers.findIndex((h) =>
        HINTS[key].some((re) => re.test(String(h).trim())),
      );
    let first = find("first"),
      last = find("last");
    const full = find("full");
    if (first < 0 && full >= 0) {
      first = full;
      last = -1;
    }
    let email = find("email");
    if (email < 0) {
      const sample = rows.slice(1, 21);
      let best = 0;
      headers.forEach((_, i) => {
        const hits = sample.filter((r) => API.isValidEmail(r[i])).length;
        if (hits > best) {
          best = hits;
          email = i;
        }
      });
    }
    return { first, last, email, group: find("group") };
  }

  // =============================================================================
  // Turns the rows into a clean list of students using the column map from guess().
  // Skips duplicates and students already on the list, and collects rows with a missing
  // name or a wrong email so the lecturer can see them.
  // =============================================================================
  function build(rows, map, existingEmails = []) {
    const existing = new Set(existingEmails.map((e) => API.normEmail(e)));
    const seen = new Set();
    const students = [],
      issues = [];
    let duplicates = 0,
      alreadyListed = 0;
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      // Reads one cell of this row, or an empty string if the column does not exist.
      const get = (idx) => (idx >= 0 ? String(r[idx] || "") : "");
      let firstName = API.cleanName(get(map.first)),
        lastName = API.cleanName(get(map.last));
      if (map.last < 0 && firstName.includes(" ")) {
        const p = firstName.split(" ");
        firstName = p[0];
        lastName = p.slice(1).join(" ");
      }
      const name = API.cleanName(`${firstName} ${lastName}`);
      const email = API.normEmail(get(map.email));
      const group = API.cleanName(get(map.group));
      if (!name)
        return issues.push({
          row: line,
          name: "(empty)",
          value: email || "-",
          problem: "Name is missing",
        });
      if (!API.isValidEmail(email))
        return issues.push({
          row: line,
          name,
          value: email || "(empty)",
          problem: "Email looks wrong",
        });
      if (seen.has(email)) {
        duplicates++;
        return;
      }
      seen.add(email);
      if (existing.has(email)) {
        alreadyListed++;
        return;
      }
      students.push({ row: line, name, firstName, lastName, email, group });
    });
    return { students, issues, duplicates, alreadyListed };
  }

  // =============================================================================
  // Answers that mean "nothing" in a form ("no", "-", "none", "אין", "لا"...), and the
  // header words that point to the link column and to the extra-materials column.
  // =============================================================================
  const EMPTY =
    /^\s*(|\.|-|–|\/|no|nop|none|n\/?a|null|nil|אין|לא|لا|لا يوجد)\s*$/i;
  const LINK_HEAD = [/link/i, /github/i, /repo/i, /url/i, /קישור/, /رابط/];
  const EXTRA_HEAD = [
    /additional/i,
    /material/i,
    /video/i,
    /notes?/i,
    /drive/i,
    /הערות|חומרים/,
    /ملاحظات|مواد/,
  ];

  // =============================================================================
  // Reads a homework hand-in list (for example a Google Form export). Finds the email,
  // the repository link and the extra-materials columns, splits answers that hold two
  // emails (pairs), and keeps the latest answer when a student sent the form twice.
  // =============================================================================
  function hwList(rows) {
    const headers = (rows[0] || []).map((h) =>
      String(h).replace(/\s+/g, " ").trim(),
    );
    const map = guess(rows);
    // Every column whose header matches one of the given patterns.
    const findAll = (res) =>
      headers
        .map((h, i) => (res.some((re) => re.test(h)) ? i : -1))
        .filter((i) => i >= 0);
    const data = rows.slice(1);
    // How many of the first 30 answers in a column are web links.
    const linky = (i) =>
      data.slice(0, 30).filter((r) => /^\s*https?:\/\//i.test(r[i] || ""))
        .length;
    let link =
      findAll(LINK_HEAD)
        .filter((i) => i !== map.email)
        .sort((a, b) => linky(b) - linky(a))[0] ?? -1;
    if (link < 0)
      headers.forEach((_, i) => {
        if (i !== map.email && linky(i) > (link < 0 ? 0 : linky(link)))
          link = i;
      });
    const extra =
      findAll(EXTRA_HEAD).filter((i) => i !== link && i !== map.email)[0] ?? -1;
    const out = [],
      issues = [];
    const seen = new Map();
    data.forEach((r, k) => {
      // Reads one cell of this row, trimmed, or an empty string.
      const get = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
      const emails = get(map.email)
        .split(/[\s,;]+/)
        .map(API.normEmail)
        .filter(API.isValidEmail);
      let name = API.cleanName(
        map.last >= 0 ? `${get(map.first)} ${get(map.last)}` : get(map.first),
      );
      const lnk = EMPTY.test(get(link)) ? "" : get(link).split(/\s+/)[0];
      const ext = EMPTY.test(get(extra)) ? "" : get(extra);
      const group = API.cleanName(get(map.group));
      if (!emails.length && !name) {
        if (r.some((c) => String(c).trim()))
          issues.push({ row: k + 2, problem: "No email or name" });
        return;
      }
      (emails.length ? emails : [null]).forEach((email) => {
        const row = { email, name, group, link: lnk, extra: ext };
        if (email && seen.has(email))
          Object.assign(
            out[seen.get(email)],
            Object.fromEntries(Object.entries(row).filter(([, v]) => v)),
          );
        else {
          if (email) seen.set(email, out.length);
          out.push(row);
        }
      });
    });
    return {
      rows: out,
      issues,
      columns: {
        email: headers[map.email] || "",
        link: headers[link] || "",
        extra: headers[extra] || "",
        name: headers[map.first] || "",
      },
    };
  }

  // =============================================================================
  // Opens a CSV or Excel file the user picked and returns its rows. Excel files need the
  // SheetJS library, which is loaded only the first time it is needed.
  // =============================================================================
  async function readTable(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      if (!window.XLSX)
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src =
            "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
          s.onload = res;
          s.onerror = () => rej(new Error("The Excel reader didn't load"));
          document.head.append(s);
        });
      const wb = XLSX.read(await file.arrayBuffer());
      return parse(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
    }
    return parse(await file.text());
  }

  return { parse, guess, build, hwList, readTable };
})();
