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
