// =============================================================================
// Small animations on the light pages: big titles settle in letter by letter, and the
// shelf of course books spreads out as it scrolls into view. Nothing moves for people
// who asked their system for reduced motion, and nothing moves on the dark screens
// (scan and projector).
// =============================================================================
var Motion = (() => {
  // =============================================================================
  // True when the person asked their system for less motion.
  // =============================================================================
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =============================================================================
  // Watches titles further down the page and plays each one once, when it scrolls into
  // view.
  // =============================================================================
  const seen =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (list) =>
            list.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("sx-play");
                seen.unobserve(e.target);
              }
            }),
          { rootMargin: "0px 0px -8% 0px" },
        )
      : null;

  // =============================================================================
  // The titles that get the letter animation. A course name is left out on purpose: it
  // travels from page to page in one piece.
  // =============================================================================
  const TITLES =
    ".page-title, .section-title, .signin-h1, .signin-h2, .sx-title";

  // =============================================================================
  // Splits a title into words and letters, each letter with its own small delay, so the
  // title can settle in like a wave. Arabic is never split, because its letters join
  // each other.
  // =============================================================================
  function split(el) {
    if (document.documentElement.lang === "ar") return;
    if (el.dataset.split === el.textContent) return;
    const label = el.textContent.replace(/\s+/g, " ").trim();
    let i = 0;
    // Goes through the title's text and wraps each word and letter in its own element.
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 1) return walk(n);
        if (n.nodeType !== 3 || !n.textContent) return;
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((word) => {
          if (!word) return;
          if (/^\s+$/.test(word))
            return frag.append(document.createTextNode(word));
          const w = document.createElement("span");
          w.className = "w";
          for (const ch of word) {
            const s = document.createElement("span");
            s.className = "ch";
            s.textContent = ch;
            const k = i++;
            s.style.setProperty("--i", k);
            s.style.setProperty(
              "--y",
              (Math.sin(k * 0.85) * 0.25 + 0.3).toFixed(2) + "em",
            );
            s.style.setProperty(
              "--r",
              ((k % 2 ? 1 : -1) * (4 + ((k * 37) % 7))).toFixed(0) + "deg",
            );
            w.append(s);
          }
          frag.append(w);
        });
        n.replaceWith(frag);
      });
    };
    walk(el);
    el.setAttribute("aria-label", label);
    el.querySelectorAll(".w").forEach((w) =>
      w.setAttribute("aria-hidden", "true"),
    );
    el.dataset.split = el.textContent;
    const r = el.getBoundingClientRect();
    el.classList.add("sx-intro");
    if (r.top < innerHeight * 0.95 || !seen) el.classList.add("sx-play");
    else seen.observe(el);
  }

  // =============================================================================
  // Finds every title on the page, splits it, and either plays it now (if it is on
  // screen) or waits until it scrolls into view.
  // =============================================================================
  function scan() {
    document.querySelectorAll(TITLES).forEach((el) => {
      if (
        el.closest(
          ".dark-screen, .sidebar, dialog, .shelf, .curtain, .returning",
        )
      )
        return;
      if (el.dataset.split !== el.textContent) {
        delete el.dataset.split;
        el.classList.remove("sx-intro", "sx-play");
        split(el);
      }
    });
  }

  // =============================================================================
  // How far the shelf of books is spread: 0.4 when the books are stacked together, 1
  // when fully spread.
  // =============================================================================
  let spread = 1;

  // =============================================================================
  // Works out how far the shelf has scrolled into view and spreads the books to match.
  // =============================================================================
  function measureShelf() {
    const sh = document.querySelector(".shelf");
    if (!sh) return;
    const r = sh.getBoundingClientRect(),
      vh = innerHeight;
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.75)));
    const e = 1 - Math.pow(1 - p, 3);
    const next = 0.4 + 0.6 * e;
    if (Math.abs(next - spread) > 0.002) {
      spread = next;
      sh.dispatchEvent(new CustomEvent("spread"));
    }
  }

  // =============================================================================
  // Turns the animations on when the page loads (or off, for reduced motion and dark
  // screens).
  // =============================================================================
  function start() {
    if (reduce || document.body.classList.contains("dark-screen")) {
      document.documentElement.classList.add("sx-off");
      return;
    }
    document.documentElement.classList.add("sx-on");
    scan();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    if (document.querySelector(".shelf")) {
      measureShelf();
      let ticking = false;
      addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            measureShelf();
          });
        },
        { passive: true },
      );
      addEventListener("resize", measureShelf);
    }
  }
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", start);
  else start();

  return {
    get spread() {
      return reduce ? 1 : spread;
    },
  };
})();

// =============================================================================
// Two things every page gets: the right book arrows for the pointer in Hebrew and
// Arabic, and the site's icon in the browser tab (the bookmark logo, favicon.svg next
// to index.html).
// =============================================================================
(() => {
  // In Hebrew and Arabic the books still go from left to right, so the pointer over a
  // book on the left keeps its "back" arrow and over a book on the right its "next" arrow.
  const fix = document.createElement("style");
  fix.textContent = `@media (hover: hover) and (pointer: fine) {
    [dir=rtl] .book.to-left { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='22' fill='%23141414'/%3E%3Cpath d='M27 15l-9 9 9 9' fill='none' stroke='%23F3F0E8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 24 24, w-resize; }
    [dir=rtl] .book.to-right { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='22' fill='%23141414'/%3E%3Cpath d='M21 15l9 9-9 9' fill='none' stroke='%23F3F0E8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 24 24, e-resize; }
    [dir=rtl] .shelf.dragging .book { cursor: grabbing; } }`;
  document.head.appendChild(fix);

  if (document.querySelector('link[rel="icon"]')) return;
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = new URL(
    "../favicon.svg",
    document.currentScript?.src || location.href,
  ).href;
  document.head.appendChild(link);
})();

// =============================================================================
// The mouse pointer on the light pages: a pencil. It writes a thin, short line behind
// it as it moves. Near a button, a tab, a link or a word that is already highlighted
// in yellow, it turns into a yellow highlighter, its line turns yellow, and the thing
// under it gets highlighted. Over the course books it becomes a round arrow (back,
// next, or open). Big titles do a small wave when the mouse passes over them.
// While a dialog is open, and over text boxes and drawing areas, the normal pointer
// is used. Off on phones and tablets, for reduced motion, and on the dark screens
// (scan and projector).
// =============================================================================
(() => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CLICKABLE =
    "a[href], button:not(:disabled), [role=button], [role=tab], summary, label[for], .code-btn";
  const NATIVE =
    "input, textarea, select, [contenteditable=true], canvas:not(.mx-trail), iframe, video, [data-native-cursor]";
  const WAVE = ".sx-intro.sx-play";
  // Words that are already highlighted in yellow (like the one word in each big title):
  // the pencil turns into the highlighter over them too.
  const MARKED = ".hl:not(.avatar)";
  // How close counts as "near" a button: a lot sideways, very little up and down.
  const PAD_X = 22,
    PAD_Y = 4;

  // =============================================================================
  // The pencil and the highlighter. Both are drawn tilted, with the tip at the
  // exact mouse position, so the tip stays in place when one turns into the other.
  // =============================================================================
  const PENCIL =
    '<svg class="mx-pencil" width="14" height="58" viewBox="0 0 14 58"><g transform="rotate(35) translate(-7 -58)"><path d="M7 58 L4.6 52 H9.4 Z" fill="#141414"/><path d="M4.6 52 L1 42 H13 L9.4 52 Z" fill="#E6C9A0" stroke="#141414" stroke-width=".8"/><rect x="1" y="12" width="12" height="30" fill="#FFE45C" stroke="#141414" stroke-width="1"/><path d="M5 12 V42 M9 12 V42" stroke="#141414" stroke-opacity=".25"/><rect x="1" y="7" width="12" height="5" fill="#B5B0A6" stroke="#141414" stroke-width="1"/><rect x="1" y="0" width="12" height="7" rx="3" fill="#2440E6" stroke="#141414" stroke-width="1"/></g></svg>';
  const MARKER =
    '<svg class="mx-marker" width="18" height="56" viewBox="0 0 18 56"><g transform="rotate(35) translate(-6 -56)"><path d="M6 56 L13 50 V45 H3 V52 Z" fill="#FFE45C" stroke="#141414" stroke-width="1"/><rect x="2" y="40" width="14" height="5" fill="#141414"/><rect x="1" y="8" width="16" height="32" rx="3" fill="#FFE45C" stroke="#141414" stroke-width="1"/><path d="M5 14 H13" stroke="#141414" stroke-width="1.4" stroke-linecap="round"/><rect x="2" y="0" width="14" height="9" rx="3" fill="#141414"/></g></svg>';

  // Small arrows inside the round pointer over the course books.
  const ARROW = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    open: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  };

  // =============================================================================
  // The pointer, and what the highlighter does to the thing under it: tabs and side
  // links get a yellow highlighter stroke behind their words, plain buttons turn
  // light yellow, and filled buttons lift a little. Only while this pointer is on.
  // =============================================================================
  const CSS = `
    html.mx-cursor :where(body, body *:not(input, textarea, select, [contenteditable=true], canvas:not(.mx-trail), iframe, video, [data-native-cursor], [data-native-cursor] *)) { cursor: none !important; }
    .mx-pen { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483001; will-change: transform; transition: opacity .2s; }
    .mx-pen svg { position: absolute; left: 0; top: 0; overflow: visible; transform-origin: 0 0; filter: drop-shadow(0 3px 4px rgba(20, 20, 20, .18));
      transition: transform .34s cubic-bezier(.34, 1.4, .5, 1), opacity .18s ease; }
    .mx-pen .mx-marker { opacity: 0; transform: rotate(40deg) scale(.55); }
    .mx-pen.hl .mx-marker { opacity: 1; transform: rotate(-6deg) scale(1.1); }
    .mx-pen.hl .mx-pencil { opacity: 0; transform: rotate(-40deg) scale(.55); }
    .mx-ball { position: fixed; left: 0; top: 0; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; display: grid; place-items: center;
      background: #141414; color: #F3F0E8; box-shadow: 0 8px 24px rgba(20, 20, 20, .25); pointer-events: none; z-index: 2147483001;
      opacity: 0; scale: .6; transition: opacity .18s ease, scale .25s cubic-bezier(.23, 1, .32, 1), background-color .2s, color .2s; }
    .mx-ball.on { opacity: 1; scale: 1; }
    .mx-ball.open { background: #FFE45C; color: #141414; }
    .mx-pen.hide, .mx-ball.hide, html:not(.mx-cursor) :is(.mx-pen, .mx-ball, .mx-trail) { opacity: 0; }
    .mx-trail { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483000; }
    .sx-on .mx-wave .ch { animation: mx-wave 520ms cubic-bezier(.23, 1, .32, 1) both; animation-delay: calc(min(var(--i), 30) * 18ms); }
    @keyframes mx-wave { 40% { transform: translateY(-0.09em) rotate(calc(var(--r) * .35)); } to { transform: none; } }
    html.mx-cursor :is(.tabs button, .subtabs a) { background: linear-gradient(#FFE45C, #FFE45C) no-repeat 0 66% / 0% 32%; transition: background-size .35s cubic-bezier(.23, 1, .32, 1), color .2s; }
    html.mx-cursor[dir=rtl] :is(.tabs button, .subtabs a), html.mx-cursor [dir=rtl] :is(.tabs button, .subtabs a) { background-position: 100% 66%; }
    html.mx-cursor :is(.tabs button, .subtabs a):hover { background-size: 100% 32%; color: #141414; }
    html.mx-cursor :is(.side-nav a, .side-course):not([aria-current="page"]) { background-image: linear-gradient(#FFF3B0, #FFF3B0); background-repeat: no-repeat; background-position: 0 0; background-size: 0% 100%;
      transition: background-size .35s cubic-bezier(.23, 1, .32, 1), background-color .2s; }
    html.mx-cursor[dir=rtl] :is(.side-nav a, .side-course), html.mx-cursor [dir=rtl] :is(.side-nav a, .side-course) { background-position: 100% 0; }
    html.mx-cursor :is(.side-nav a, .side-course):not([aria-current="page"]):hover { background-color: transparent; background-size: 100% 100%; }
    html.mx-cursor :is(.btn:not(.btn-primary, .btn-dark, .btn-accent, .btn-hl, .btn-destructive, [aria-pressed="true"]), .round-btn:not(.fill), .icon-btn, .side-me, .code-btn):hover:not(:disabled) { background-color: #FFF3B0; }
    html.mx-cursor .btn:not(.btn-primary, .btn-dark, .btn-accent, .btn-hl, .btn-destructive, [aria-pressed="true"]):hover:not(:disabled) { border-color: #141414; }
    html.mx-cursor :is(.btn-primary, .btn-dark, .btn-accent, .btn-hl, .btn-destructive, .round-btn.fill):hover:not(:disabled) { translate: 0 -2px; box-shadow: 0 10px 22px -10px rgba(20, 20, 20, .5); }
    html.mx-cursor .btn-accent:hover:not(:disabled) { box-shadow: 0 10px 22px -10px rgba(36, 64, 230, .7); }
    html.mx-cursor :is(.btn, .round-btn) { transition: background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .25s ease, translate .25s cubic-bezier(.23, 1, .32, 1), transform .16s cubic-bezier(.23, 1, .32, 1); }`;

  // =============================================================================
  // Starts the pointer once the page is ready.
  // =============================================================================
  function start() {
    if (!fine || reduce || document.body.classList.contains("dark-screen"))
      return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const pen = document.createElement("div");
    pen.className = "mx-pen";
    pen.setAttribute("aria-hidden", "true");
    pen.innerHTML = PENCIL + MARKER;
    const ball = document.createElement("div");
    ball.className = "mx-ball";
    ball.setAttribute("aria-hidden", "true");
    const trail = document.createElement("canvas");
    trail.className = "mx-trail";
    trail.setAttribute("aria-hidden", "true");
    document.body.append(trail, pen, ball);
    const ctx = trail.getContext("2d");
    const root = document.documentElement;
    root.classList.add("mx-cursor");

    // Where the mouse is, whether it is near something clickable, which arrow to show
    // over a book, and the pointer's last positions (for the line behind it).
    let mx = -100,
      my = -100,
      lastX = -100,
      tilt = 0,
      raf = 0,
      near = false,
      book = null,
      icon = "",
      last = null,
      leaveT = 0;
    const points = [];

    // Sizes the trail canvas to the window, sharp on high-resolution screens.
    function size() {
      const d = Math.min(devicePixelRatio || 1, 2);
      trail.width = innerWidth * d;
      trail.height = innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    size();
    addEventListener("resize", size);

    // True when (x, y) is on a highlighted word (exactly on it: the words next to it keep
    // the pencil), or on a clickable thing, or close enough to the last one: a few
    // pixels around it, or the gap between it and its neighbours in the same row (tabs,
    // a row of buttons). In a column, like the side menu, only the links themselves count.
    const around = (r, x, y) =>
      x > r.left - PAD_X &&
      x < r.right + PAD_X &&
      y > r.top - PAD_Y &&
      y < r.bottom + PAD_Y;
    function isNear(el, x, y) {
      if (el?.closest(MARKED)) {
        last = null;
        return true;
      }
      const on = el?.closest(CLICKABLE);
      if (on) {
        last = on;
        return true;
      }
      if (!last || !last.isConnected) return false;
      const b = last.getBoundingClientRect();
      if (around(b, x, y)) return true;
      const row = last.parentElement,
        cs = row && getComputedStyle(row);
      if (
        !cs ||
        !cs.display.includes("flex") ||
        cs.flexDirection.startsWith("column")
      )
        return false;
      const r = row.getBoundingClientRect();
      return (
        x > r.left && x < r.right && y > b.top - PAD_Y && y < b.bottom + PAD_Y
      );
    }

    // Turns the highlighter on at once, and off only after a short moment, so sliding
    // quickly from one button to the next never flashes the pencil.
    function setNear(v) {
      if (v) {
        clearTimeout(leaveT);
        leaveT = 0;
        if (!near) {
          near = true;
          pen.classList.add("hl");
        }
        return;
      }
      if (!near || leaveT) return;
      leaveT = setTimeout(() => {
        leaveT = 0;
        near = false;
        pen.classList.remove("hl");
        wake();
      }, 180);
    }

    // Draws the line behind the pointer: thin graphite for the pencil, a wider yellow
    // stroke for the highlighter. It thins and fades within a fifth of a second.
    function drawTrail(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      while (points.length && t - points[0].t > 220) points.shift();
      if (points.length < 2) return points.length > 0;
      ctx.lineCap = "round";
      const col = near ? "230, 196, 30" : "20, 20, 20";
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          k = i / points.length,
          age = 1 - (t - b.t) / 220;
        ctx.strokeStyle = `rgba(${col}, ${((near ? 0.6 : 0.35) * k * age).toFixed(3)})`;
        ctx.lineWidth = near ? 3 + 7 * k * age : 0.6 + 3 * k * age;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      return true;
    }

    // One frame: place the pen (leaning a little with the mouse's speed), the round
    // arrow over the books, and the line behind.
    function frame(t) {
      const vx = mx - lastX;
      lastX = mx;
      tilt += (Math.max(-22, Math.min(22, vx * 2.2)) - tilt) * 0.2;
      pen.style.transform = `translate(${mx}px, ${my}px) rotate(${(-tilt * 0.5).toFixed(1)}deg)`;
      ball.style.transform = `translate(${mx}px, ${my}px)`;
      const want = ARROW[book] || "";
      if (want !== icon) {
        icon = want;
        ball.innerHTML = want;
      }
      ball.classList.toggle("on", !!book);
      ball.classList.toggle("open", book === "open");
      pen.classList.toggle("hide", !!book || pen.dataset.native === "1");
      const prev = points[points.length - 1];
      if (
        !book &&
        pen.dataset.native !== "1" &&
        (!prev || Math.hypot(mx - prev.x, my - prev.y) > 0.5)
      )
        points.push({ x: mx, y: my, t });
      const tail = drawTrail(t);
      raf = tail || Math.abs(tilt) > 0.3 ? requestAnimationFrame(frame) : 0;
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // Which arrow to show over a course book: back for a book on the left, next for a
    // book on the right, open for the book in front.
    function bookKind(el) {
      const b = el?.closest(".shelf .book");
      if (!b || b.closest(".shelf.dragging")) return null;
      return b.classList.contains("is-active")
        ? "open"
        : b.classList.contains("to-left")
          ? "back"
          : b.classList.contains("to-right")
            ? "next"
            : null;
    }

    // The title under the mouse plays a small wave, once each time the mouse comes onto it.
    let waved = null;
    function wave(el) {
      const t = el?.closest(WAVE) || null;
      if (t === waved) return;
      waved = t;
      if (!t) return;
      t.classList.remove("mx-wave");
      void t.offsetWidth;
      t.classList.add("mx-wave");
      setTimeout(() => t.classList.remove("mx-wave"), 1300);
    }

    addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        if (mx < -50) lastX = e.clientX;
        mx = e.clientX;
        my = e.clientY;
        // While a dialog is open the normal pointer is used (a dialog always sits on top
        // of everything, so the pencil could not show above it).
        const modal = document.querySelector("dialog[open]");
        root.classList.toggle("mx-cursor", !modal);
        if (modal) {
          book = null;
          setNear(false);
          return;
        }
        const el = e.target instanceof Element ? e.target : null;
        const native = !!el?.closest(NATIVE);
        pen.dataset.native = native ? "1" : "";
        book = native ? null : bookKind(el);
        setNear(!native && !book && isNear(el, mx, my));
        wave(el);
        wake();
      },
      { passive: true },
    );
    addEventListener(
      "scroll",
      () => {
        if (last && !last.isConnected) last = null;
      },
      { passive: true },
    );
    document.addEventListener("pointerleave", () => {
      pen.classList.add("hide");
      ball.classList.remove("on");
      book = null;
      points.length = 0;
      wake();
    });
    document.addEventListener("pointerenter", () =>
      pen.classList.remove("hide"),
    );
    // A small press when clicking, like putting the pen down on the paper.
    addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && !book)
        pen.animate([{ scale: 1 }, { scale: 0.88 }, { scale: 1 }], {
          duration: 220,
          easing: "cubic-bezier(.23, 1, .32, 1)",
        });
    });
    // When the page changes, the pointer is hidden first, so it is not caught in the
    // picture of the old page that slides away (and does not jump on the new one).
    const away = () => {
      pen.style.display = ball.style.display = trail.style.display = "none";
    };
    addEventListener("pageswap", away);
    addEventListener("pagehide", away);
    addEventListener("pageshow", (e) => {
      if (e.persisted)
        pen.style.display = ball.style.display = trail.style.display = "";
    });
    // The moment a dialog opens the normal pointer comes back, and when it closes the
    // pencil returns.
    new MutationObserver(() => {
      const open = !!document.querySelector("dialog[open]");
      root.classList.toggle("mx-cursor", !open);
      if (open) {
        book = null;
        setNear(false);
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  }
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", start);
  else start();
})();
