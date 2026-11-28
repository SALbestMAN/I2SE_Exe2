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
// The mouse pointer on the light pages. The pointer is a small dot that follows the
// mouse smoothly. Over a button or a link it changes into the button's own shape and
// wraps around it, as if selecting it, and the button leans slightly toward the
// mouse. Over text boxes, drawing areas, dialogs and the course books the normal
// pointer comes back. Off on phones and tablets, for reduced motion, and on the dark
// screens (scan and projector).
// =============================================================================
(() => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CLICKABLE =
    "a[href], button:not(:disabled), [role=button], [role=tab], summary, label[for], .chip, .code-btn";
  const NATIVE =
    "input, textarea, select, [contenteditable=true], canvas, iframe, video, dialog, .shelf, [data-native-cursor]";
  const LEAN = "button, .btn, .round-btn, .icon-btn";

  // =============================================================================
  // The pointer's look. White with "difference" blending, so it shows dark on the paper
  // and light on dark buttons.
  // =============================================================================
  const CSS = `
    html.mx-cursor :where(body, body *:not(input, textarea, select, [contenteditable=true], canvas, iframe, video, dialog, dialog *, .shelf, .shelf *, [data-native-cursor], [data-native-cursor] *)) { cursor: none !important; }
    .mx-cur { position: fixed; left: 0; top: 0; width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box;
      background: #fff; border: 0 solid #fff; mix-blend-mode: difference; pointer-events: none; z-index: 2147483000;
      will-change: transform, width, height; transition: background-color .2s, border-width .2s, opacity .2s; }
    .mx-cur.ring { background: rgba(255, 255, 255, .08); border-width: 2px; }
    .mx-cur.hide { opacity: 0; }`;

  // =============================================================================
  // Starts the pointer once the page is ready.
  // =============================================================================
  function start() {
    if (!fine || reduce || document.body.classList.contains("dark-screen"))
      return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const cur = document.createElement("div");
    cur.className = "mx-cur";
    cur.setAttribute("aria-hidden", "true");
    document.body.appendChild(cur);
    document.documentElement.classList.add("mx-cursor");

    // Where the mouse is, the button under it, and the pointer's current shape (it
    // eases toward its target shape every frame).
    let mx = -100,
      my = -100,
      over = null,
      leaning = null,
      raf = 0,
      first = true;
    const now = { x: -100, y: -100, w: 10, h: 10, r: 5 };

    // The shape the pointer is heading for: a dot at the mouse, or the button's outline.
    function target() {
      if (over && over.isConnected) {
        const b = over.getBoundingClientRect(),
          pad = 5;
        if (b.width < 420 && b.height < 160) {
          const cx = b.left + b.width / 2,
            cy = b.top + b.height / 2;
          const ox = Math.max(-6, Math.min(6, (mx - cx) * 0.12)),
            oy = Math.max(-6, Math.min(6, (my - cy) * 0.12));
          const h = b.height + pad * 2,
            radius =
              parseFloat(getComputedStyle(over).borderTopLeftRadius) || 0;
          return {
            x: b.left - pad + ox,
            y: b.top - pad + oy,
            w: b.width + pad * 2,
            h,
            r: Math.min(radius + pad, h / 2),
            ring: true,
          };
        }
        return { x: mx - 20, y: my - 20, w: 40, h: 40, r: 20, ring: true };
      }
      return { x: mx - 5, y: my - 5, w: 10, h: 10, r: 5, ring: false };
    }

    // Moves the pointer one step toward its target shape, and the button a little
    // toward the mouse.
    function frame() {
      const t = target(),
        k = first ? 1 : 0.28;
      first = false;
      let moving = false;
      for (const key of ["x", "y", "w", "h", "r"]) {
        now[key] += (t[key] - now[key]) * k;
        if (Math.abs(t[key] - now[key]) > 0.2) moving = true;
      }
      cur.style.transform = `translate(${now.x.toFixed(1)}px, ${now.y.toFixed(1)}px)`;
      cur.style.width = now.w.toFixed(1) + "px";
      cur.style.height = now.h.toFixed(1) + "px";
      cur.style.borderRadius = now.r.toFixed(1) + "px";
      cur.classList.toggle("ring", t.ring);
      if (leaning) {
        const b = leaning.getBoundingClientRect();
        const lx = Math.max(
            -3,
            Math.min(3, (mx - b.left - b.width / 2) * 0.06),
          ),
          ly = Math.max(-3, Math.min(3, (my - b.top - b.height / 2) * 0.06));
        leaning.style.translate = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
      }
      raf = moving || over ? requestAnimationFrame(frame) : 0;
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // Lets go of the button the pointer was wrapped around.
    function release() {
      if (leaning) {
        leaning.style.translate = "";
        leaning = null;
      }
      over = null;
    }

    addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        mx = e.clientX;
        my = e.clientY;
        const el = e.target instanceof Element ? e.target : null;
        const native = el?.closest(NATIVE);
        cur.classList.toggle("hide", !!native);
        const hit = native ? null : el?.closest(CLICKABLE) || null;
        if (hit !== over) {
          release();
          over = hit;
          if (hit && hit.matches(LEAN)) leaning = hit;
        }
        wake();
      },
      { passive: true },
    );
    addEventListener("scroll", wake, { passive: true });
    document.addEventListener("pointerleave", () => {
      cur.classList.add("hide");
      release();
      wake();
    });
    document.addEventListener("pointerenter", () =>
      cur.classList.remove("hide"),
    );
    addEventListener("pointerdown", () =>
      cur.animate([{ scale: 1 }, { scale: 0.9 }, { scale: 1 }], {
        duration: 260,
        easing: "cubic-bezier(.23, 1, .32, 1)",
      }),
    );
  }
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", start);
  else start();
})();
