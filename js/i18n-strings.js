// =============================================================================
// The site's language: English, Hebrew or Arabic. The pages are written in English;
// this translates what they show (text, placeholders, labels, titles) as it appears on
// screen. Numbers, times, dates, day and month names are kept, and what people wrote
// themselves (course names, questions, summaries) is never touched.
// =============================================================================
var I18N = (() => {
  // =============================================================================
  // The three languages and their writing direction, and the language this person chose
  // last time (English by default).
  // =============================================================================
  const LANGS = {
    en: { name: "English", dir: "ltr" },
    he: { name: "עברית", dir: "rtl" },
    ar: { name: "العربية", dir: "rtl" },
  };
  let lang = "en";
  try {
    lang = localStorage.getItem("cp.lang") || "en";
  } catch (e) {}
  if (!LANGS[lang]) lang = "en";

  // =============================================================================
  // Sets the page's language and direction (right-to-left for Hebrew and Arabic) before
  // anything is drawn.
  // =============================================================================
  const root = document.documentElement;
  root.lang = lang;
  root.dir = LANGS[lang].dir;

  // =============================================================================
  // True when the page needs translating, and which column of the dictionary to use (0 =
  // Hebrew, 1 = Arabic).
  // =============================================================================
  const on = lang !== "en";
  const col = lang === "he" ? 0 : 1;

  // =============================================================================
  // The dictionary: exact phrases, and phrases with a "*" for a name or other text that
  // stays as it is.
  // =============================================================================
  const EXACT = new Map(),
    WILD = [];

  // =============================================================================
  // Makes text safe to use inside a regular expression.
  // =============================================================================
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // =============================================================================
  // Fills the dictionary from the phrase table. "Remove *" becomes a pattern that
  // matches "Remove" followed by any name.
  // =============================================================================
  function load(table) {
    for (const [k, v] of Object.entries(table || {})) {
      const val = v[col];
      if (!val) continue;
      if (k.includes("*")) {
        WILD.push([
          new RegExp("^" + esc(k).replace(/\\\*/g, "(.+?)") + "$"),
          val,
        ]);
      } else EXACT.set(k, val);
    }
  }
  if (on && typeof I18N_STRINGS === "object") load(I18N_STRINGS);

  // =============================================================================
  // Day and month names in English, the way they appear in the pages.
  // =============================================================================
  const DAYS_S = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_L = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const MON_S = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const MON_L = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const WORD = new Map();
  if (on) {
    // =============================================================================
    // The date format of the chosen language, and a known Sunday to start counting days
    // from.
    // =============================================================================
    const loc = lang === "he" ? "he-IL" : "ar";
    const d0 = new Date(2024, 0, 7);

    // =============================================================================
    // Translates the day names (short and long) into the chosen language.
    // =============================================================================
    DAYS_S.forEach((d, i) => {
      const day = new Date(d0.getTime() + i * 864e5);
      WORD.set(
        d,
        new Intl.DateTimeFormat(loc, { weekday: "short" }).format(day),
      );
      WORD.set(
        DAYS_L[i],
        new Intl.DateTimeFormat(loc, { weekday: "long" }).format(day),
      );
    });

    // =============================================================================
    // Translates the month names (short and long) into the chosen language.
    // =============================================================================
    MON_S.forEach((m, i) => {
      const day = new Date(2024, i, 15);
      WORD.set(m, new Intl.DateTimeFormat(loc, { month: "short" }).format(day));
      WORD.set(
        MON_L[i],
        new Intl.DateTimeFormat(loc, { month: "long" }).format(day),
      );
    });
  }

  // =============================================================================
  // What a number looks like (13, 10:30, 25/11, 2026-11-23).
  // =============================================================================
  const NUM = "\\d+(?:[.:/\\-]\\d+)*";
  const NAMES = [...DAYS_L, ...MON_L, ...DAYS_S, ...MON_S].join("|");
  const PIECE = `(?:${NUM}|(?:${NAMES})\\b)`;

  // =============================================================================
  // A run of numbers and day or month names inside a sentence, such as "25 Nov" or "Sun
  // 10:00". These are cut out before looking a phrase up, so one phrase covers every
  // number.
  // =============================================================================
  const TOKEN = new RegExp(`(?<![A-Za-z])${PIECE}(?:,? ${PIECE})*`, "g");

  // =============================================================================
  // Translates the day and month names inside a number token.
  // =============================================================================
  const localToken = (t) =>
    t.replace(new RegExp(`\\b(${NAMES})\\b`, "g"), (w) => WORD.get(w) || w);

  // =============================================================================
  // Puts the numbers and names back into the translated phrase.
  // =============================================================================
  const fill = (val, toks, caps) =>
    val
      .replace(/\{(\d+)\}/g, (m, i) =>
        toks[i] != null ? localToken(toks[i]) : m,
      )
      .replace(/\$(\d)/g, (m, i) => caps[i - 1] ?? m);

  // =============================================================================
  // Phrases already translated, so each one is worked out only once.
  // =============================================================================
  const cache = new Map();

  // =============================================================================
  // Finds the translation of one piece of text: an exact phrase, a phrase with numbers,
  // a phrase with a "*", or a sentence made of known parts. Returns the text unchanged
  // if nothing fits.
  // =============================================================================
  function core(t, depth = 0) {
    if (EXACT.has(t)) return EXACT.get(t);
    const sym = t.match(/^([●✓≈+·•‹›←→✕×★⟳\s]+)(\S.*)$/u);
    if (sym) {
      const r = core(sym[2], depth + 1);
      if (r != null) return sym[1] + r;
    }
    const toks = [];
    const norm = t.replace(TOKEN, (x) => {
      toks.push(x);
      return `{${toks.length - 1}}`;
    });
    if (toks.length && norm !== t && EXACT.has(norm))
      return fill(EXACT.get(norm), toks, []);
    for (const [re, val] of WILD) {
      const m = norm.match(re);
      if (!m) continue;
      return fill(
        val,
        toks,
        m.slice(1).map((c) => {
          const raw = c.replace(/\{(\d+)\}/g, (x, i) => toks[i] ?? x);
          return depth < 3
            ? (core(raw, depth + 1) ?? localToken(raw))
            : localToken(raw);
        }),
      );
    }
    if (toks.length && /^[\s{}\d,·:+\-–]*$/.test(norm))
      return fill(norm, toks, []);
    const p = t.match(/^(.*?[^.:!?…])([.:!?…]+)$/);
    if (p && EXACT.has(p[1])) return EXACT.get(p[1]) + p[2];
    if (depth < 3)
      for (const sep of [" · ", ", ", " / "]) {
        if (!t.includes(sep)) continue;
        const parts = t.split(sep),
          out = parts.map((x) => core(x, depth + 1));
        if (out.some((x) => x != null))
          return out.map((x, i) => x ?? parts[i]).join(sep);
      }
    return null;
  }

  // =============================================================================
  // Translates one piece of text, keeping the spaces around it.
  // =============================================================================
  function t(text) {
    if (!on || text == null) return text;
    const s = String(text);
    if (!/[A-Za-z]/.test(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const trimmed = s.replace(/\s+/g, " ").trim();
    const r = trimmed ? core(trimmed) : null;
    const out = r == null ? s : s.match(/^\s*/)[0] + r + s.match(/\s*$/)[0];
    if (cache.size > 5000) cache.clear();
    cache.set(s, out);
    return out;
  }

  // =============================================================================
  // Parts of the page that are never translated: code, text boxes, and anything people
  // wrote themselves.
  // =============================================================================
  const SKIP =
    "script, style, textarea, code, pre, [dir=auto]:not([data-tr]), .no-tr, .ch, [contenteditable]";
  const ATTRS = ["placeholder", "aria-label", "title"];

  // =============================================================================
  // Translates one piece of text on the page.
  // =============================================================================
  function textNode(n) {
    const el = n.parentElement;
    if (!el || el.closest(SKIP)) return;
    const v = n.nodeValue,
      r = t(v);
    if (r !== v) n.nodeValue = r;
  }

  // =============================================================================
  // Translates an element's placeholder, label and title.
  // =============================================================================
  function element(el) {
    if (el.nodeType !== 1 || el.closest(".no-tr")) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && /[A-Za-z]/.test(v)) {
        const r = t(v);
        if (r !== v) el.setAttribute(a, r);
      }
    }
    if (el.tagName === "OPTION" && !el.hasAttribute("value"))
      el.setAttribute("value", el.textContent);
  }

  // =============================================================================
  // A title written in two styles ("Your <span>shelf.</span>") is translated as a whole
  // phrase and the words go back into the same pieces, so the styling stays.
  // =============================================================================
  const INLINE = /^(SPAN|B|I|EM|STRONG)$/;

  // =============================================================================
  // Translates a title made of a few styled pieces as one phrase.
  // =============================================================================
  function phrase(el) {
    if (!el.children.length || el.children.length > 3 || el.closest(SKIP))
      return;
    const full = el.textContent.replace(/\s+/g, " ").trim();
    if (
      full.length > 90 ||
      !EXACT.has(full) ||
      [...el.querySelectorAll("*")].some((c) => !INLINE.test(c.tagName))
    )
      return;
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue.trim()) nodes.push(n);
    if (nodes.length < 2) return;
    const val = EXACT.get(full),
      parts = val.includes("|") ? val.split("|") : [val];
    nodes.forEach((x, i) => {
      const lead = x.nodeValue.match(/^\s*/)[0],
        tail = x.nodeValue.match(/\s*$/)[0];
      x.nodeValue =
        i < parts.length
          ? lead + parts[i] + (i === nodes.length - 1 ? "" : tail)
          : "";
    });
  }

  // =============================================================================
  // Translates a whole part of the page: every element, its text and its labels.
  // =============================================================================
  function walk(node) {
    if (node.nodeType === 3) return textNode(node);
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (node.matches("script, style")) return;
      phrase(node);
      element(node);
    }
    node
      .querySelectorAll?.("h1, h2, h3, h4, p, div, span, a, li, label, b")
      .forEach((el) => {
        if (el.children.length) phrase(el);
      });
    node
      .querySelectorAll?.("[placeholder], [aria-label], [title], option")
      .forEach(element);
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) textNode(n);
  }
  if (on) {
    // =============================================================================
    // Translates anything the page adds or changes later, as soon as it appears.
    // =============================================================================
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") m.addedNodes.forEach(walk);
        else if (m.type === "characterData") textNode(m.target);
        else if (m.type === "attributes") element(m.target);
      }
    }).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });

    // =============================================================================
    // Translates the tab title.
    // =============================================================================
    const title = () => {
      const r = t(document.title);
      if (r !== document.title) document.title = r;
    };
    addEventListener("DOMContentLoaded", () => {
      walk(document.body);
      title();
    });
    if (lang === "ar") {
      // =============================================================================
      // Arabic needs its own fonts; they are loaded here.
      // =============================================================================
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href =
        "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap";
      document.head.appendChild(l);
    }
  }

  // =============================================================================
  // Switches to another language and reloads the page.
  // =============================================================================
  function set(next) {
    if (!LANGS[next] || next === lang) return;
    try {
      localStorage.setItem("cp.lang", next);
    } catch (e) {}
    location.reload();
  }

  // =============================================================================
  // The language buttons (English, עברית, العربية) for the account menu and the sign-in
  // page.
  // =============================================================================
  function pickerHTML(cls = "") {
    return `<div class="lang-pick ${cls}" role="group" aria-label="Language">${Object.entries(
      LANGS,
    )
      .map(
        ([k, v]) =>
          `<button type="button" data-lang="${k}" aria-pressed="${k === lang}" lang="${k}">${v.name}</button>`,
      )
      .join("")}</div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".lang-pick [data-lang]");
    if (b) set(b.dataset.lang);
  });

  return {
    t,
    pickerHTML,
    get lang() {
      return lang;
    },
    get rtl() {
      return LANGS[lang].dir === "rtl";
    },
  };
})();
