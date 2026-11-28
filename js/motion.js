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
// The mouse pointer on the light pages. The pointer is a small drop of liquid glass
// that follows the mouse smoothly and leaves a short, thin trail behind it. Over a
// button or a link the glass stretches into the button's own shape, as if selecting
// it, and the button leans slightly toward the mouse. Over the course books it
// becomes a round arrow (back, next, or open). Big titles do a small wave when the
// mouse passes over them, and in other titles a thin line draws itself under the
// words in italics.
// While a dialog is open, and over text boxes and drawing areas, the normal pointer
// is used. Off on phones and tablets, for reduced motion, and on the dark screens
// (scan and projector).
// =============================================================================
(() => {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CLICKABLE =
    "a[href], button:not(:disabled), [role=button], [role=tab], summary, label[for], .chip, .code-btn";
  const NATIVE =
    "input, textarea, select, [contenteditable=true], canvas:not(.mx-trail), iframe, video, [data-native-cursor]";
  const LEAN = "button.btn, button.round-btn, button.icon-btn, a.btn";
  const WAVE = ".sx-intro.sx-play";

  // =============================================================================
  // Small arrows drawn inside the pointer over the course books.
  // =============================================================================
  const ARROW = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    open: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  };

  // =============================================================================
  // The pointer's look: a small drop of liquid glass, like Apple's. It bends and
  // brightens what is under it, with a light rim and a soft shadow, and a tiny ink dot
  // marks the exact mouse position. Over a button the glass stretches into the
  // button's shape. Over the books it is a solid ink circle with an arrow (yellow for
  // "open"). The trail is white with "difference" blending, so it shows on any colour.
  // =============================================================================
  const CSS = `
    html.mx-cursor :where(body, body *:not(input, textarea, select, [contenteditable=true], canvas:not(.mx-trail), iframe, video, [data-native-cursor], [data-native-cursor] *)) { cursor: none !important; }
    .mx-cur { position: fixed; left: 0; top: 0; width: 44px; height: 44px; border-radius: 999px; box-sizing: border-box;
      display: grid; place-items: center; color: transparent; overflow: hidden; pointer-events: none; z-index: 2147483000;
      background: rgba(251, 250, 246, .10);
      -webkit-backdrop-filter: blur(.6px) saturate(1.7) brightness(1.06); backdrop-filter: var(--mx-glass, blur(.6px) saturate(1.7) brightness(1.06));
      box-shadow: inset 0 1px 1.5px rgba(255, 255, 255, .95), inset 0 -1px 1px rgba(255, 255, 255, .45), inset 0 0 0 .6px rgba(255, 255, 255, .75),
        inset 0 0 14px rgba(255, 255, 255, .28), 0 12px 28px -12px rgba(20, 20, 20, .45), 0 1px 2px rgba(20, 20, 20, .14);
      will-change: transform, width, height; transition: background-color .25s, opacity .2s, color .2s, box-shadow .25s; }
    .mx-cur::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
      background: radial-gradient(circle at var(--mx, 35%) var(--my, 28%), rgba(255, 255, 255, .55), rgba(255, 255, 255, 0) 55%); mix-blend-mode: soft-light; }
    .mx-cur.ring { background: rgba(251, 250, 246, .06); }
    .mx-cur.solid, .mx-cur.open { -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 8px 24px rgba(20, 20, 20, .25); }
    .mx-cur.solid { background: #141414; color: #F3F0E8; }
    .mx-cur.open { background: #FFE45C; color: #141414; }
    .mx-cur.solid::after, .mx-cur.open::after { display: none; }
    .mx-pin { position: fixed; left: 0; top: 0; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff;
      mix-blend-mode: difference; pointer-events: none; z-index: 2147483001; transition: opacity .2s; }
    .mx-pin.off { opacity: 0; }
    .mx-cur.hide, .mx-cur.hide + .mx-pin, html:not(.mx-cursor) :is(.mx-cur, .mx-pin, .mx-trail) { opacity: 0; }
    .mx-trail { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147482999; mix-blend-mode: difference; }
    .sx-on .mx-wave .ch { animation: mx-wave 520ms cubic-bezier(.23, 1, .32, 1) both; animation-delay: calc(min(var(--i), 30) * 18ms); }
    @keyframes mx-wave { 40% { transform: translateY(-0.09em) rotate(calc(var(--r) * .35)); } to { transform: none; } }
    :is(h1, h2, .course-title) .serif { background-image: linear-gradient(currentColor, currentColor); background-repeat: no-repeat;
      background-size: 0% .055em; background-position: 0 94%; -webkit-box-decoration-break: clone; box-decoration-break: clone;
      transition: background-size .5s cubic-bezier(.23, 1, .32, 1); }
    [dir=rtl] :is(h1, h2, .course-title) .serif { background-position: 100% 94%; }
    :is(h1, h2, .course-title):hover .serif { background-size: 100% .055em; }`;

  // =============================================================================
  // The lens that makes the glass bend what is behind it (Chrome and Edge only; other
  // browsers get the same glass without the bending). For the glass's current shape we
  // draw a small picture that tells each point where to look: near the rim it looks a
  // little further in, so the edge seems to curve like a drop of water, and the middle
  // magnifies slightly. The picture is redrawn when the glass changes shape.
  // =============================================================================
  function addLens() {
    if (!navigator.userAgentData?.brands?.some((b) => /Chrom/.test(b.brand)))
      return null;
    const SCALE = 28,
      RIM = 14,
      PULL = 9,
      MAG = 0.07;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.innerHTML = `<filter id="mx-lens" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="44" height="44" color-interpolation-filters="sRGB">
      <feImage x="0" y="0" width="44" height="44" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${SCALE}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    document.body.appendChild(svg);
    const filter = svg.querySelector("filter"),
      image = svg.querySelector("feImage");
    const c = document.createElement("canvas"),
      g = c.getContext("2d");

    // Draws the lens picture for a rounded rectangle w × h with corner radius r.
    function draw(w, h, r) {
      const cw = Math.max(2, Math.round(w / 2)),
        ch = Math.max(2, Math.round(h / 2));
      c.width = cw;
      c.height = ch;
      const img = g.createImageData(cw, ch),
        hw = w / 2,
        hh = h / 2;
      r = Math.min(r, hw, hh);
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const px = ((x + 0.5) / cw) * w - hw,
            py = ((y + 0.5) / ch) * h - hh;
          // How far this point is from the edge, and which way is "out".
          const qx = Math.abs(px) - (hw - r),
            qy = Math.abs(py) - (hh - r);
          let nx, ny, dist;
          if (qx > 0 && qy > 0) {
            const l = Math.hypot(qx, qy) || 1;
            nx = qx / l;
            ny = qy / l;
            dist = r - l;
          } else if (qx > qy) {
            nx = 1;
            ny = 0;
            dist = r - qx;
          } else {
            nx = 0;
            ny = 1;
            dist = r - qy;
          }
          nx *= Math.sign(px) || 1;
          ny *= Math.sign(py) || 1;
          const k = Math.pow(Math.max(0, 1 - dist / RIM), 2);
          const ox = -nx * k * PULL - px * MAG,
            oy = -ny * k * PULL - py * MAG;
          const i = (y * cw + x) * 4;
          img.data[i] = 128 + (ox / SCALE) * 255;
          img.data[i + 1] = 128 + (oy / SCALE) * 255;
          img.data[i + 2] = 128;
          img.data[i + 3] = 255;
        }
      g.putImageData(img, 0, 0);
      image.setAttribute("href", c.toDataURL());
      for (const el of [filter, image]) {
        el.setAttribute("width", w.toFixed(0));
        el.setAttribute("height", h.toFixed(0));
      }
    }
    document.documentElement.style.setProperty(
      "--mx-glass",
      "url(#mx-lens) blur(.35px) saturate(1.7) brightness(1.06)",
    );
    return draw;
  }

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
    const trail = document.createElement("canvas");
    trail.className = "mx-trail";
    trail.setAttribute("aria-hidden", "true");
    const pin = document.createElement("div");
    pin.className = "mx-pin";
    pin.setAttribute("aria-hidden", "true");
    document.body.append(trail, cur, pin);
    const fitLens = addLens();
    let lensW = 0,
      lensH = 0;
    const ctx = trail.getContext("2d");
    const root = document.documentElement;
    root.classList.add("mx-cursor");

    // Where the mouse is, what is under it, and the pointer's current shape (it eases
    // toward its target shape every frame). The trail is the pointer's last positions.
    let mx = -100,
      my = -100,
      over = null,
      book = null,
      leaning = null,
      raf = 0,
      first = true,
      icon = "";
    const now = { x: -100, y: -100, w: 44, h: 44, r: 22 },
      points = [];

    // Sizes the trail canvas to the window, sharp on high-resolution screens.
    function size() {
      const d = Math.min(devicePixelRatio || 1, 2);
      trail.width = innerWidth * d;
      trail.height = innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    size();
    addEventListener("resize", size);

    // The shape the pointer is heading for: a dot at the mouse, a round arrow over a
    // book, or the shape of the button under the mouse.
    function target() {
      if (book)
        return { x: mx - 26, y: my - 26, w: 52, h: 52, r: 26, kind: book };
      if (over && over.isConnected) {
        const box = shapeOf(over);
        if (box) {
          const { b, pad, radius } = box,
            cx = b.left + b.width / 2,
            cy = b.top + b.height / 2;
          const ox = Math.max(-3, Math.min(3, (mx - cx) * 0.06)),
            oy = Math.max(-3, Math.min(3, (my - cy) * 0.06));
          const h = b.height + pad * 2;
          return {
            x: b.left - pad + ox,
            y: b.top - pad + oy,
            w: b.width + pad * 2,
            h,
            r: Math.min(radius + pad, h / 2),
            kind: "ring",
          };
        }
        return { x: mx - 28, y: my - 28, w: 56, h: 56, r: 28, kind: "ring" };
      }
      return { x: mx - 22, y: my - 22, w: 44, h: 44, r: 22, kind: "" };
    }

    // The outline to wrap around something clickable. A button with its own background
    // or border is wrapped as it is drawn. A plain text link or tab is wrapped tightly
    // around its words, not around its (larger) clickable area. Anything very big gets
    // a round pointer instead (null).
    function shapeOf(el) {
      const cs = getComputedStyle(el);
      const boxed =
        (cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          cs.backgroundColor !== "transparent") ||
        parseFloat(cs.borderTopWidth) > 0 ||
        parseFloat(cs.borderBottomWidth) > 0;
      let b = el.getBoundingClientRect(),
        pad = 6,
        radius = parseFloat(cs.borderTopLeftRadius) || 0;
      if (!boxed) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        if (t.width && t.height) {
          b = t;
          pad = 6;
          radius = 8;
        }
      }
      return b.width < 420 && b.height < 160 ? { b, pad, radius } : null;
    }

    // Draws the trail: a thin line through the pointer's last positions that gets
    // thinner and fainter toward its end, and is gone after a fifth of a second.
    function drawTrail(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      while (points.length && t - points[0].t > 200) points.shift();
      if (points.length < 2) return false;
      ctx.lineCap = "round";
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          k = i / points.length,
          age = 1 - (t - b.t) / 200;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.55 * k * age).toFixed(3)})`;
        ctx.lineWidth = 1 + 5 * k * age;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      return true;
    }

    // Moves the pointer one step toward its target shape, draws the trail, and leans
    // the button a little toward the mouse.
    function frame(t) {
      const tg = target(),
        k = first ? 1 : 0.28;
      first = false;
      let moving = false;
      for (const key of ["x", "y", "w", "h", "r"]) {
        now[key] += (tg[key] - now[key]) * k;
        if (Math.abs(tg[key] - now[key]) > 0.2) moving = true;
      }
      cur.style.transform = `translate(${now.x.toFixed(1)}px, ${now.y.toFixed(1)}px)`;
      cur.style.width = now.w.toFixed(1) + "px";
      cur.style.height = now.h.toFixed(1) + "px";
      cur.style.borderRadius = now.r.toFixed(1) + "px";
      // The lens is redrawn when the glass has changed shape by a few pixels, and once
      // more when it settles.
      const settled = !moving && (now.w !== lensW || now.h !== lensH);
      if (
        fitLens &&
        (settled || Math.abs(now.w - lensW) > 3 || Math.abs(now.h - lensH) > 3)
      ) {
        lensW = now.w;
        lensH = now.h;
        fitLens(lensW, lensH, now.r);
      }
      cur.classList.toggle("ring", tg.kind === "ring");
      pin.classList.toggle(
        "off",
        tg.kind === "back" || tg.kind === "next" || tg.kind === "open",
      );
      pin.style.transform = `translate(${mx}px, ${my}px)`;
      // The light on the glass sits up and to the side of the mouse, so it moves with it.
      cur.style.setProperty("--mx", (mx - now.x - 6).toFixed(0) + "px");
      cur.style.setProperty("--my", (my - now.y - 8).toFixed(0) + "px");
      cur.classList.toggle("solid", tg.kind === "back" || tg.kind === "next");
      cur.classList.toggle("open", tg.kind === "open");
      const want = ARROW[tg.kind] || "";
      if (want !== icon) {
        icon = want;
        cur.innerHTML = want;
      }
      if (!tg.kind && moving)
        points.push({ x: now.x + now.w / 2, y: now.y + now.h / 2, t });
      const tail = drawTrail(t);
      if (leaning) {
        const b = leaning.getBoundingClientRect();
        const lx = Math.max(
            -3,
            Math.min(3, (mx - b.left - b.width / 2) * 0.06),
          ),
          ly = Math.max(-3, Math.min(3, (my - b.top - b.height / 2) * 0.06));
        leaning.style.translate = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
      }
      raf = moving || tail || over ? requestAnimationFrame(frame) : 0;
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
        mx = e.clientX;
        my = e.clientY;
        // While a dialog is open the custom pointer steps aside (a dialog always sits on
        // top of everything, so the dot could not show above it).
        const modal = document.querySelector("dialog[open]");
        root.classList.toggle("mx-cursor", !modal);
        if (modal) {
          release();
          book = null;
          return;
        }
        const el = e.target instanceof Element ? e.target : null;
        const native = el?.closest(NATIVE);
        cur.classList.toggle("hide", !!native);
        book = native ? null : bookKind(el);
        const hit = native || book ? null : el?.closest(CLICKABLE) || null;
        if (hit !== over) {
          release();
          over = hit;
          if (hit && hit.matches(LEAN)) leaning = hit;
        }
        wave(el);
        wake();
      },
      { passive: true },
    );
    addEventListener("scroll", wake, { passive: true });
    document.addEventListener("pointerleave", () => {
      cur.classList.add("hide");
      release();
      book = null;
      wake();
    });
    document.addEventListener("pointerenter", () =>
      cur.classList.remove("hide"),
    );
    addEventListener("pointerdown", () => {
      if (!over)
        cur.animate([{ scale: 1 }, { scale: 0.85 }, { scale: 1 }], {
          duration: 240,
          easing: "cubic-bezier(.23, 1, .32, 1)",
        });
    });
    // When the page changes, the pointer is hidden first, so it is not caught in the
    // picture of the old page that slides away (and does not jump on the new one).
    const away = () => {
      cur.style.display = pin.style.display = trail.style.display = "none";
      release();
    };
    addEventListener("pageswap", away);
    addEventListener("pagehide", away);
    addEventListener("pageshow", (e) => {
      if (e.persisted)
        cur.style.display = pin.style.display = trail.style.display = "";
    });
    // The moment a dialog opens the normal pointer comes back, and when it closes the
    // custom pointer returns.
    new MutationObserver(() => {
      const open = !!document.querySelector("dialog[open]");
      root.classList.toggle("mx-cursor", !open);
      if (open) {
        release();
        book = null;
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
