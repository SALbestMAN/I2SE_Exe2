// =============================================================================
// The bookshelf: each course is shown as a notebook on a shelf. The user browses with
// the mouse wheel, the arrow keys, by dragging, or by swiping, and opens a course by
// clicking the book in front. Used on the lecturer's course list and the student's
// home page.
// =============================================================================
var Shelf = (() => {
  // =============================================================================
  // True when the person asked their system for less motion.
  // =============================================================================
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =============================================================================
  // The short "when" line printed on a book, such as "Sun 10:00".
  // =============================================================================
  const whenOf = (c) =>
    typeof scheduleText === "function"
      ? scheduleText(c, { short: true })
      : [c.day, c.time].filter(Boolean).join(" ");

  // =============================================================================
  // The HTML of one book: a cloth cover in the course's colour, a band with the join
  // code, ruled lines, the volume number and a ribbon.
  // =============================================================================
  function bookHTML(c, i, opts) {
    const float = `style="animation-delay:${(-i * 1.7).toFixed(1)}s"`;
    if (c.isExtra)
      return `
      <button class="book new" data-i="${i}" aria-label="${esc(opts.extra.label)}">
        <span class="book-float" ${float}><span class="book-3d">
          <span class="cover"><span class="cover-front"><span class="new-plus">${icon("plus", 24, "currentColor", 2)}</span>
            <span class="new-label">${esc(opts.extra.a || "Add a")} <span class="serif">${esc(opts.extra.b || "book")}</span></span>
            <span class="mono muted" style="font-size:10px">${esc(opts.extra.hint || "")}</span></span><span class="cover-back"></span></span>
        </span></span><span class="book-shadow" ${float}></span>
      </button>`;
    const words = String(c.name).trim().split(/\s+/),
      t1 = words.shift() || "",
      t2 = words.join(" ");
    const long =
      t1.length > 7
        ? t1.length > 10
          ? "long xlong"
          : "long"
        : t2.length > 16
          ? "long"
          : "";
    return `
      <button class="book" data-i="${i}" data-code="${esc(c.code || "")}" style="${coverVars({ ...c, cover: c.cover ?? i })}" aria-label="${esc(c.name)}${c.live ? ", live now" : ""}">
        <span class="book-float" ${float}><span class="book-3d">
          <span class="face spine"></span>
          <span class="face pages"></span>
          <span class="face back"></span>
          <span class="face inside"><b dir="auto">${esc(c.name)}</b><span>${esc(whenOf(c))}</span></span>
          <span class="cover"><span class="cover-front">
            <span class="cover-band"><span dir="ltr">${esc(c.code || "")}</span></span>
            <span class="cover-body">
              <span class="cover-top"><span>Vol. ${pad2(i + 1)}</span>${c.live ? '<span class="cover-live">● Live</span>' : ""}</span>
              <span class="cover-title ${long}" dir="auto"><b>${esc(t1)}</b>${t2 ? `<i>${esc(t2)}</i>` : ""}<span class="cover-rule"></span></span>
              <span class="cover-foot">${esc(opts.footOf ? opts.footOf(c) : "")}</span>
            </span>
          </span><span class="cover-back"></span></span>
          <span class="ribbon"></span>
        </span></span><span class="book-shadow" ${float}></span>
      </button>`;
  }

  // =============================================================================
  // Builds a shelf inside opts.root and returns what the page needs to control it (show
  // a list of courses, move to a book, open one). Remembers where the user was, so
  // coming back shows the same book.
  // =============================================================================
  function create(opts) {
    const root = opts.root,
      stage = document.createElement("div");
    stage.className = "stage";
    root.innerHTML = "";
    root.appendChild(stage);
    let items = [],
      active = 0,
      pos = 0,
      sig = "",
      busy = false,
      startX = null,
      moved = false,
      pid = null,
      trail = [],
      slop = 6;
    let shownId,
      frame = 0,
      anim = 0,
      vel = 0,
      target = 0,
      startPos = 0;
    // All the books on the shelf right now.
    const books = () => stage.querySelectorAll(".book");
    // True on narrow (phone) screens, where the books are smaller.
    const small = () => innerWidth < 700;

    // Places every book for a position on the shelf (it can be between two books while moving): the
    // one in front faces the user, the others turn and step back.
    function layout(p = pos) {
      const W = small() ? 190 : 280;
      books().forEach((b, i) => {
        if (b.classList.contains("is-opening")) return;
        const d = i - p,
          ad = Math.abs(d);
        const f = window.Motion ? Motion.spread : 1;
        const x = d * W * f,
          z = -ad * 200 - (1 - f) * 120,
          r = -26 * Math.max(-1.4, Math.min(1.4, d)) * (0.6 + 0.4 * f);
        b.style.transform = `translateX(calc(-50% + ${x}px)) translateZ(${z}px) rotateY(${r}deg)`;
        b.style.opacity = ad > 2.6 ? 0 : Math.max(0, 1 - ad * 0.22);
        b.style.zIndex = 100 - Math.round(ad * 10);
        b.style.pointerEvents = ad > 2.6 ? "none" : "";
        b.classList.toggle("near", ad <= 2.6);
        b.classList.toggle("far", ad > 3.6);
        b.classList.toggle("is-active", i === active);
        b.classList.toggle("to-left", i < active);
        b.classList.toggle("to-right", i > active);
        b.tabIndex = i === active ? 0 : -1;
      });
    }

    // Updates the "03 / 07" counter and the arrow buttons, and tells the page which course is in
    // front.
    function announce() {
      if (opts.pos) {
        const t = items.length
          ? `${pad2(active + 1)} / ${pad2(items.length)}`
          : "";
        if (opts.pos._t !== t) {
          opts.pos._t = t;
          opts.pos.textContent = t;
          opts.pos.setAttribute(
            "aria-label",
            `${active + 1} of ${items.length}`,
          );
        }
      }
      if (opts.prev) opts.prev.disabled = active <= 0;
      if (opts.next) opts.next.disabled = active >= items.length - 1;
      const c = items[active];
      if (c) opts.onActive?.(c.isExtra ? null : c, active, c.id !== shownId);
      shownId = c?.id;
    }

    // Moves the shelf to book n with a spring, frame by frame. It starts from where the books are
    // right now and keeps their speed, so a new press or a flick in the middle just changes the
    // target.
    function animateTo(n, v0 = vel) {
      target = n;
      vel = v0;
      if (anim) return;
      let last = performance.now();
      const K = 170,
        C = 2 * Math.sqrt(K);
      // One step of the spring. It settles in about half a second without going past the target.
      const tick = (now) => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        vel += (-K * (pos - target) - C * vel) * dt;
        pos += vel * dt;
        if (Math.abs(pos - target) < 0.002 && Math.abs(vel) < 0.02) {
          pos = target;
          vel = 0;
          anim = 0;
          layout();
          return;
        }
        layout();
        anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    }
    // Stops the movement where it is.
    const stop = () => {
      cancelAnimationFrame(anim);
      anim = 0;
      vel = 0;
    };

    // Brings book i to the front (and gives it keyboard focus if asked).
    function go(i, { focus = false } = {}) {
      const n = Math.max(0, Math.min(items.length - 1, i));
      if (n === active && pos === n && !anim) return;
      active = n;
      layout();
      animateTo(n);
      announce();
      try {
        sessionStorage.setItem(opts.storeKey || "cp.shelf", items[active].id);
      } catch (e) {}
      if (focus) books()[active]?.focus({ preventScroll: true });
    }

    // Shows a new list of courses. The books are redrawn only when something about them changed, so a
    // running animation is not interrupted.
    function set(list) {
      const next = [
        ...list,
        ...(opts.extra ? [{ isExtra: true, id: "extra" }] : []),
      ];
      const s = JSON.stringify(
        next.map((c) => [
          c.id,
          c.name,
          JSON.stringify(c.schedule || [c.day, c.time, c.room]),
          c.live,
          opts.footOf && !c.isExtra ? opts.footOf(c) : "",
        ]),
      );
      const keep = items[active]?.id;
      items = next;
      if (s === sig || busy || startX != null) {
        announce();
        return;
      }
      sig = s;
      let want = keep;
      try {
        want = want || sessionStorage.getItem(opts.storeKey || "cp.shelf");
      } catch (e) {}
      const k = items.findIndex((c) => c.id === want);
      stop();
      active = pos = target = k >= 0 ? k : 0;
      root.classList.add("no-anim");
      stage.innerHTML = items.map((c, i) => bookHTML(c, i, opts)).join("");
      layout();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList.remove("no-anim")),
      );
      announce();
    }

    const morphs = "CSSViewTransitionRule" in window;
    // Gives the front book's cover and title the names the browser uses to fly them smoothly into the
    // course page.
    const names = (b, on) => {
      const f = b?.querySelector(".cover-front"),
        t = b?.querySelector(".cover-title");
      if (f) f.style.viewTransitionName = on ? "course-book" : "";
      if (t) t.style.viewTransitionName = on ? "course-title" : "";
    };
    // Opens the course of book i: the book flies forward and the course page opens.
    function open(i = active) {
      const c = items[i];
      if (!c || busy) return;
      if (c.isExtra) return opts.onExtra?.();
      const href = opts.hrefOf(c);
      try {
        sessionStorage.setItem("cp.opened", c.code || "");
        sessionStorage.setItem("cp.navdir", "forward");
      } catch (e) {}
      if (reduce()) return (location.href = href);
      busy = true;
      stop();
      pos = i;
      layout();
      const b = books()[i];
      b.querySelector(".book-3d").style.transform = "";
      if (morphs) {
        b.classList.add("lift");
        names(b, true);
        setTimeout(() => (location.href = href), 130);
        return;
      }
      root.classList.add("opening");
      b.classList.add("is-opening");
      b.style.transform = `translateX(calc(-50% + ${small() ? 40 : 110}px)) translateZ(${small() ? 120 : 230}px) rotateY(0deg)`;
      setTimeout(() => b.classList.add("open"), 160);
      setTimeout(() => opts.fade?.classList.add("on"), 640);
      setTimeout(() => (location.href = href), 860);
    }
    addEventListener("pagereveal", (e) => {
      let code = "";
      try {
        code = sessionStorage.getItem("cp.opened") || "";
      } catch (x) {}
      if (!e.viewTransition || !code) return;
      const k = items.findIndex((c) => c.code === code);
      if (k < 0) return;
      if (k !== active) {
        active = pos = target = k;
        layout();
        announce();
      }
      const b = books()[k];
      names(b, true);
      e.viewTransition.finished.finally(() => names(b, false));
    });
    // Puts the shelf back to normal after coming back from a course page.
    const reset = () => {
      busy = false;
      opts.fade?.classList.remove("on");
      root.classList.remove("opening");
      stage.querySelectorAll(".book").forEach((b) => {
        b.classList.remove("is-opening", "open", "lift");
        names(b, false);
      });
      layout();
    };
    addEventListener("pageshow", () => {
      startX = null;
      moved = false;
      root.classList.remove("dragging");
      if (busy) reset();
    });
    // A click on a book: the one in front opens, any other one comes to the front.
    const tap = (b) => {
      const i = +b.dataset.i;
      if (i === active) open(i);
      else go(i);
    };
    // Which book is under the pointer, worked out from where the books are drawn (the browser's own
    // hit-testing is unreliable for 3D-turned books). The front book wins, then its neighbours.
    const bookAt = (x, y) => {
      const list = [...books()];
      const order = list
        .map((_, i) => i)
        .sort((a, b) => Math.abs(a - active) - Math.abs(b - active));
      for (const i of order) {
        const r = (
          list[i].querySelector(".cover-front") || list[i]
        ).getBoundingClientRect();
        if (
          r.width &&
          x >= r.left &&
          x <= r.right &&
          y >= r.top - 16 &&
          y <= r.bottom + 16
        )
          return list[i];
      }
      return null;
    };
    // A click: opens or brings forward the book under the pointer; a click beside the books moves the
    // shelf in that direction.
    const tapAt = (x, y) => {
      const b = bookAt(x, y);
      if (b) return tap(b);
      const front = books()[active]?.getBoundingClientRect();
      if (!front) return;
      if (x < front.left) go(active - 1);
      else if (x > front.right) go(active + 1);
    };
    stage.addEventListener("click", (e) => {
      const b = e.target.closest(".book");
      if (b && e.detail === 0 && !moved) tap(b);
    });
    opts.prev?.addEventListener("click", () => go(active - 1));
    opts.next?.addEventListener("click", () => go(active + 1));
    root.addEventListener("keydown", (e) => {
      const k = {
        ArrowRight: active + 1,
        ArrowLeft: active - 1,
        Home: 0,
        End: items.length - 1,
      }[e.key];
      if (k === undefined) return;
      e.preventDefault();
      go(k, { focus: true });
    });
    let acc = 0,
      lockUntil = 0;
    root.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        const d = e.deltaX;
        e.preventDefault();
        if (performance.now() < lockUntil) return;
        acc += d;
        if (Math.abs(acc) > 40) {
          go(active + Math.sign(acc));
          acc = 0;
          lockUntil = performance.now() + 380;
        }
      },
      { passive: false },
    );

    root.addEventListener("pointerdown", (e) => {
      if (busy || e.button > 0) return;
      startX = e.clientX;
      moved = false;
      pid = e.pointerId;
      trail = [[e.clientX, e.timeStamp]];
      slop = e.pointerType === "mouse" ? 6 : 12;
      if (anim) {
        stop();
        startPos = pos;
      } else startPos = active;
    });
    // Straightens books that were tilted by the mouse.
    const resetTilt = () =>
      stage
        .querySelectorAll(".book-3d")
        .forEach((el) => (el.style.transform = ""));
    root.addEventListener("pointermove", (e) => {
      if (startX != null && e.pointerId === pid) {
        const dx = e.clientX - startX;
        trail.push([e.clientX, e.timeStamp]);
        if (trail.length > 6) trail.shift();
        if (!moved && Math.abs(dx) > slop) {
          moved = true;
          root.classList.add("dragging");
          root.setPointerCapture(pid);
          resetTilt();
        }
        if (moved) {
          const raw = startPos - dx / step(),
            max = items.length - 1;
          pos =
            raw < 0 ? -rubber(-raw) : raw > max ? max + rubber(raw - max) : raw;
          if (!frame)
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (startX != null) layout(pos);
            });
        }
        return;
      }
      if (e.pointerType !== "mouse") return;
      const b = e.target.closest(".book.is-active");
      if (!b || busy || reduce()) return resetTilt();
      const r = b.getBoundingClientRect(),
        px = (e.clientX - r.left) / r.width,
        py = (e.clientY - r.top) / r.height;
      b.querySelector(".book-3d").style.transform =
        `translateY(-8px) scale(1.035) rotateY(${(px - 0.5) * 10}deg) rotateX(${(0.5 - py) * 8}deg)`;
      const f = b.querySelector(".cover-front");
      f.style.setProperty("--mx", px * 100 + "%");
      f.style.setProperty("--my", py * 100 + "%");
    });
    // How many pixels of dragging move the shelf by one book.
    const step = () => (small() ? 200 : 260);
    // Makes dragging past the first or last book feel soft, like a rubber band.
    const rubber = (over) => (over * 0.55) / (1 + 0.55 * over * 2);
    // When the user lets go after dragging: a short tap clicks; a flick keeps moving in its direction
    // and settles on the nearest book.
    const endDrag = (e) => {
      if (startX == null) return;
      startX = null;
      root.classList.remove("dragging");
      if (!moved) {
        if (e?.type === "pointerup" && !busy) {
          if (anim) stop();
          tapAt(e.clientX, e.clientY);
        }
        return;
      }
      const a = trail[0],
        b = trail[trail.length - 1],
        dt = b[1] - a[1];
      const v =
        dt > 0 && performance.now() - b[1] < 90
          ? ((b[0] - a[0]) / dt) * 1000
          : 0;
      const projected = pos - ((v / 1000) * 0.992) / (1 - 0.992) / step();
      const n = Math.max(
        0,
        Math.min(
          items.length - 1,
          Math.max(
            Math.round(pos) - 2,
            Math.min(Math.round(pos) + 2, Math.round(projected)),
          ),
        ),
      );
      active = n;
      vel = -v / step();
      layout();
      animateTo(n, vel);
      announce();
      try {
        sessionStorage.setItem(opts.storeKey || "cp.shelf", items[active].id);
      } catch (e) {}
      setTimeout(() => (moved = false), 0);
    };
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    root.addEventListener("pointerleave", resetTilt);
    addEventListener("resize", () => layout());
    root.addEventListener("spread", () => {
      if (!anim && startX == null) layout();
    });

    return {
      set,
      open,
      go: (i) => go(i),
      current: () => (items[active]?.isExtra ? null : items[active]),
    };
  }

  return { create };
})();
