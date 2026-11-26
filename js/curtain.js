// =============================================================================
// The curtain on the way into and out of the live room (the projector and the
// student's check-in screen). A coloured sheet sweeps over the old page and leaves
// from the new one. Every other page change uses the browser's own smooth page change
// instead.
// =============================================================================
var Curtain = (() => {
  // =============================================================================
  // The motion curves of the curtain: a smooth start and finish while it sweeps, and a
  // quick close for the circle.
  // =============================================================================
  const EASE_COVER = "cubic-bezier(0.87, 0, 0.13, 1)";
  const EASE_REVEAL = "cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_CIRCLE = "cubic-bezier(0.025, 0.99, 0.08, 1)";

  // =============================================================================
  // True when the person asked their system for less motion.
  // =============================================================================
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =============================================================================
  // Where we remember, between pages, that a curtain is on its way.
  // =============================================================================
  const KEY = "cp.curtain";
  let busy = false,
    revealed = false,
    lenis = null;

  // =============================================================================
  // True for the dark live pages (projector and scan).
  // =============================================================================
  const isDark = (url) => /\/(live|scan)\.html$/.test(url.pathname);

  // =============================================================================
  // Finds the curtain sheet on the page, or makes one.
  // =============================================================================
  function sheet() {
    let c = document.querySelector(".curtain");
    if (!c) {
      c = document.createElement("div");
      c.className = "curtain";
      c.setAttribute("aria-hidden", "true");
      document.body.appendChild(c);
    }
    return c;
  }

  // =============================================================================
  // Rounds the sheet's leading edge on the side it comes from.
  // =============================================================================
  const edge = (c, side) => {
    c.classList.toggle("edge-left", side === "left");
    c.classList.toggle("edge-right", side === "right");
  };

  // =============================================================================
  // Plays an animation on the sheet and waits until it ends.
  // =============================================================================
  async function play(c, frames, opts) {
    const a = c.animate(frames, { fill: "forwards", ...opts });
    await a.finished.catch(() => {});
    try {
      a.commitStyles();
    } catch (e) {}
    a.cancel();
  }

  // =============================================================================
  // Leaving a page: the sheet sweeps in and covers it.
  // =============================================================================
  async function cover(dir, color) {
    const c = sheet();
    c.classList.remove("ink", "blue", "dark");
    c.classList.add(color);
    c.style.clipPath = "";
    c.style.opacity = "";
    c.style.pointerEvents = "auto";
    if (reduce()) {
      c.style.transform = "translateX(0)";
      return play(c, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease",
      });
    }
    edge(c, dir === "back" ? "right" : "left");
    await play(
      c,
      [
        { transform: `translateX(${dir === "back" ? -100 : 100}%)` },
        { transform: "translateX(0)" },
      ],
      { duration: 560, easing: EASE_COVER },
    );
  }

  // =============================================================================
  // Arriving on a page: the sheet slides away (into the live room it closes like a
  // camera iris instead).
  // =============================================================================
  async function reveal(o = {}) {
    const c = document.querySelector(".curtain");
    if (!c || revealed) return;
    revealed = true;
    const dir = o.dir || c.dataset.dir || "forward",
      mode = o.mode || c.dataset.mode || "slide";
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    uncovered();
    if (reduce())
      await play(c, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: "ease",
      });
    else if (mode === "circle") {
      edge(c, "none");
      c.style.transform = "translateX(0)";
      await play(
        c,
        [
          { clipPath: "circle(150vmax at 50% 50%)" },
          { clipPath: "circle(0vmax at 50% 50%)" },
        ],
        { duration: 620, easing: EASE_CIRCLE },
      );
    } else {
      edge(c, dir === "back" ? "left" : "right");
      await play(
        c,
        [
          { transform: "translateX(0)" },
          { transform: `translateX(${dir === "back" ? 100 : -100}%)` },
        ],
        { duration: 520, easing: EASE_REVEAL },
      );
    }
    c.remove();
    busy = false;
    lenis?.start();
  }

  // =============================================================================
  // Goes to another page: covers the old one first, then navigates.
  // =============================================================================
  async function go(href, o = {}) {
    const url = new URL(href, location.href);
    if (!wantsCurtain(url))
      return o.replace
        ? location.replace(url.href)
        : (location.href = url.href);
    if (busy) return;
    busy = true;
    lenis?.stop();
    const dir = o.dir || "forward";
    const color =
      isDark(url) || document.body.classList.contains("dark-screen")
        ? "blue"
        : "ink";
    try {
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ dir, color, mode: "slide" }),
      );
      sessionStorage.setItem("cp.navdir", dir);
    } catch (e) {}
    await cover(dir, color);
    o.replace ? location.replace(url.href) : (location.href = url.href);
  }

  // =============================================================================
  // True when this page is one of the dark live pages.
  // =============================================================================
  const dark = () => document.body.classList.contains("dark-screen");

  // =============================================================================
  // A curtain is used only when we cross between the dark live pages and the light
  // pages.
  // =============================================================================
  const wantsCurtain = (url) => isDark(url) !== dark();

  // =============================================================================
  // When the user clicks a normal link that crosses into or out of the live room, run
  // the curtain instead of jumping straight there.
  // =============================================================================
  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self"))
      return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname))
      return;
    if (url.pathname === location.pathname && url.search === location.search)
      return;
    if (!wantsCurtain(url)) return;
    e.preventDefault();
    go(url.href, {
      dir: a.matches(
        '.back-link, [aria-label="Back"], [aria-label="Cancel"], [data-back]',
      )
        ? "back"
        : "forward",
    });
  });

  addEventListener("pageswap", (e) => {
    try {
      if (sessionStorage.getItem(KEY)) e.viewTransition?.skipTransition();
    } catch (x) {}
  });
  addEventListener("pagereveal", (e) => {
    if (document.querySelector(".curtain")) e.viewTransition?.skipTransition();
  });
  addEventListener("pagehide", () => {
    try {
      sessionStorage.setItem("cp.fromDark", dark() ? "1" : "");
    } catch (x) {}
  });

  // =============================================================================
  // When the user comes back with the Back button, the browser may show the page still
  // covered. Uncover it.
  // =============================================================================
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    busy = false;
    revealed = false;
    const c = document.querySelector(".curtain");
    if (c) {
      c.dataset.dir = "back";
      c.dataset.mode = "slide";
      reveal({ dir: "back", mode: "slide" });
    } else lenis?.start();
  });

  // =============================================================================
  // Tells the page it is now uncovered (so its content can show).
  // =============================================================================
  function uncovered() {
    document.documentElement.classList.add("uncovered");
  }

  // =============================================================================
  // Called by a page when it has drawn its content: the curtain can now leave.
  // =============================================================================
  function ready() {
    if (!document.querySelector(".curtain")) return uncovered();
    reveal();
  }
  if (!document.querySelector(".curtain")) uncovered();
  addEventListener("DOMContentLoaded", () => setTimeout(ready, 900));
  if (typeof BOOT === "object" && BOOT.done) setTimeout(ready, 0);

  // =============================================================================
  // Smooth scrolling with the mouse wheel on the light pages (touch keeps its own
  // scrolling). Pauses while a dialog is open.
  // =============================================================================
  function startLenis() {
    if (
      !window.Lenis ||
      reduce() ||
      document.body.classList.contains("dark-screen")
    )
      return;
    lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
      anchors: true,
      prevent: (node) => {
        if (node.closest?.("dialog, .table-scroll, [data-lenis-prevent]"))
          return true;
        const side = node.closest?.(".split > .side, .split > .side-col");
        return !!side && side.scrollHeight > side.clientHeight + 1;
      },
    });
    let dialogOpen = false,
      n = 0;
    // Moves the smooth scroll one step, every screen refresh.
    const raf = (t) => {
      if (++n % 6 === 0) {
        const open = !!document.querySelector("dialog[open], .pr-overlay");
        if (open !== dialogOpen) {
          dialogOpen = open;
          open ? lenis.stop() : busy || lenis.start();
        }
      }
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    if (document.querySelector(".curtain")) lenis.stop();
  }
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", startLenis);
  else startLenis();

  return { go, ready };
})();
