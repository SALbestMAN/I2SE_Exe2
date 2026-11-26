// =============================================================================
// Drawing on slides and on the whiteboard: pen, highlighter, eraser and typed text.
// Every mark is saved in positions from 0 to 1 of its page, so it stays in the right
// place at any screen size and can be printed sharp onto the PDF.
// =============================================================================
var Ink = (() => {
  // =============================================================================
  // The ink colours in the toolbar: black, blue, red, green, yellow and white.
  // =============================================================================
  const COLORS = [
    "#141414",
    "#2440E6",
    "#C8371D",
    "#1E8E4E",
    "#FFE45C",
    "#FFFFFF",
  ];
  const SIZES = {
    pen: [0.002, 0.004, 0.008],
    hl: [0.012, 0.022, 0.036],
    text: [0.025, 0.04, 0.06],
  };

  // =============================================================================
  // Draws all the marks of one page (lines, highlights and text) onto a canvas of w by h
  // pixels.
  // =============================================================================
  function paint(ctx, items, w, h) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const it of items || []) {
      if (it.t === "text") {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = it.c;
        ctx.textBaseline = "top";
        ctx.font = `600 ${Math.max(8, it.s * w)}px "Inter Tight", system-ui, sans-serif`;
        String(it.text)
          .split("\n")
          .forEach((line, i) =>
            ctx.fillText(line, it.x * w, it.y * h + i * it.s * w * 1.25),
          );
        continue;
      }
      const p = it.p;
      if (!p || p.length < 2) continue;
      ctx.globalCompositeOperation = it.t === "hl" ? "multiply" : "source-over";
      ctx.globalAlpha = it.t === "hl" ? 0.38 : 1;
      ctx.strokeStyle = it.c;
      ctx.lineWidth = Math.max(1, it.w * w);
      ctx.beginPath();
      ctx.moveTo(p[0] * w, p[1] * h);
      if (p.length === 2) ctx.lineTo(p[0] * w + 0.1, p[1] * h + 0.1);
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = ((p[i] + p[i + 2]) / 2) * w,
          my = ((p[i + 1] + p[i + 3]) / 2) * h;
        ctx.quadraticCurveTo(p[i] * w, p[i + 1] * h, mx, my);
      }
      if (p.length > 2) ctx.lineTo(p[p.length - 2] * w, p[p.length - 1] * h);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =============================================================================
  // Turns the marks of one page into a PNG picture of w by h pixels, for saving into the
  // PDF.
  // =============================================================================
  function toPNG(items, w, h, background) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    paint(ctx, items, w, h);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  // =============================================================================
  // Lets the user draw on a canvas that lies exactly over a slide or the board.
  // opts.items() gives the marks of the current page and opts.changed() is called after
  // every change so it can be saved. Returns a small controller that the toolbar uses to
  // pick tools, colours and sizes, undo and clear.
  // =============================================================================
  function attach(canvas, opts) {
    const st = { tool: "none", color: COLORS[0], size: 1, undo: [] };
    const ctx = canvas.getContext("2d");
    let drawing = null,
      raf = 0;
    // The marks of the page being shown right now.
    const items = () => opts.items() || [];
    // Makes the canvas match its size on screen (sharp on high-resolution screens) and redraws it.
    function fit() {
      const r = canvas.getBoundingClientRect(),
        dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)),
        H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
    }
    // Redraws all the marks, at most once per screen refresh.
    function redraw() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fit();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paint(
          ctx,
          drawing ? [...items(), drawing] : items(),
          canvas.width,
          canvas.height,
        );
      });
    }
    // Where the pointer is on the page, from 0 to 1 across and down.
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    // Rounds a position to 4 decimals so saved drawings stay small.
    const r4 = (v) => Math.round(v * 10000) / 10000;
    // Removes any mark that passes close to this point.
    function eraseAt([x, y]) {
      const list = items(),
        rad = 0.018;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        const hit =
          it.t === "text"
            ? x >= it.x - rad &&
              x <= it.x + it.s * Math.max(2, it.text.length) * 0.55 &&
              y >= it.y - rad &&
              y <= it.y + it.s * 1.6
            : it.p.some(
                (_, k) =>
                  k % 2 === 0 &&
                  Math.hypot(
                    it.p[k] - x,
                    (it.p[k + 1] - y) * (canvas.height / canvas.width || 1),
                  ) <
                    rad + it.w,
              );
        if (hit) {
          st.undo.push({ add: it, at: i });
          list.splice(i, 1);
          opts.changed();
          redraw();
        }
      }
    }
    canvas.addEventListener("pointerdown", (e) => {
      if (st.tool === "none" || e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const pt = at(e);
      if (st.tool === "text") return placeText(pt);
      if (st.tool === "eraser") {
        drawing = { erasing: true };
        return eraseAt(pt);
      }
      drawing = {
        t: st.tool,
        c: st.color,
        w: SIZES[st.tool][st.size],
        p: [r4(pt[0]), r4(pt[1])],
      };
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of pts.length ? pts : [e]) {
        const pt = at(ev);
        if (drawing.erasing) {
          eraseAt(pt);
          continue;
        }
        const p = drawing.p,
          lx = p[p.length - 2],
          ly = p[p.length - 1];
        if (Math.hypot(pt[0] - lx, pt[1] - ly) > 0.0015)
          p.push(r4(pt[0]), r4(pt[1]));
      }
      if (!drawing.erasing) redraw();
    });
    // Finishes the line being drawn and saves it.
    const end = () => {
      if (!drawing) return;
      if (!drawing.erasing) {
        items().push(drawing);
        st.undo.push({ remove: drawing });
        opts.changed();
      }
      drawing = null;
      redraw();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // Typed text: a box appears where the user clicked. Enter places the text (Shift+Enter starts a
    // new line) and Esc drops it.
    function placeText([x, y]) {
      const host = canvas.parentElement,
        r = canvas.getBoundingClientRect(),
        hr = host.getBoundingClientRect();
      const size = SIZES.text[st.size] * r.width;
      const box = document.createElement("textarea");
      box.className = "ink-text";
      box.style.cssText = `left:${r.left - hr.left + x * r.width}px;top:${r.top - hr.top + y * r.height}px;font-size:${size}px;color:${st.color}`;
      box.rows = 1;
      box.setAttribute("aria-label", "Text to place");
      host.append(box);
      setTimeout(() => box.focus(), 0);
      let done = false;
      // Places the typed text on the page (or drops it), then removes the box.
      const commit = (keep) => {
        if (done) return;
        done = true;
        const text = box.value.replace(/\s+$/, "");
        box.remove();
        if (keep && text) {
          const it = {
            t: "text",
            c: st.color,
            s: SIZES.text[st.size],
            x: r4(x),
            y: r4(y),
            text,
          };
          items().push(it);
          st.undo.push({ remove: it });
          opts.changed();
          redraw();
        }
      };
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit(true);
        } else if (e.key === "Escape") commit(false);
        e.stopPropagation();
      });
      box.addEventListener("input", () => {
        box.style.height = "auto";
        box.style.height = box.scrollHeight + "px";
      });
      box.addEventListener("blur", () => commit(true));
    }

    const ctl = {
      state: st,
      setTool(t) {
        st.tool = t;
        canvas.dataset.tool = t;
        canvas.style.pointerEvents = t === "none" ? "none" : "auto";
      },
      setColor(c) {
        st.color = c;
      },
      setSize(i) {
        st.size = i;
      },
      undo() {
        const u = st.undo.pop();
        if (!u) return;
        const list = items();
        if (u.remove) {
          const i = list.indexOf(u.remove);
          if (i >= 0) list.splice(i, 1);
        } else if (u.add) list.splice(Math.min(u.at, list.length), 0, u.add);
        opts.changed();
        redraw();
      },
      clear() {
        const list = items();
        if (!list.length) return;
        const old = list.splice(0);
        old.forEach((it, i) => st.undo.push({ add: it, at: i }));
        opts.changed();
        redraw();
      },
      newPage() {
        st.undo = [];
        redraw();
      },
      redraw,
    };
    ctl.setTool("none");
    return ctl;
  }

  // =============================================================================
  // Builds the drawing toolbar (tools, colours, sizes, undo, clear) inside host and
  // connects it to one drawing controller.
  // =============================================================================
  function toolbar(host, ctl, { dark = false, withNone = true } = {}) {
    host.classList.add("ink-bar");
    if (dark) host.classList.add("dark");
    // One tool button with its icon.
    const tool = (t, label, svg) =>
      `<button type="button" class="ink-tool" data-t="${t}" aria-pressed="false" title="${label}" aria-label="${label}">${svg}</button>`;
    host.innerHTML = `
      ${withNone ? tool("none", "Point (no drawing)", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 8-6 2-3 6z"/></svg>') : ""}
      ${tool("pen", "Pen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1L19 8l-3-3L5 16z"/></svg>')}
      ${tool("hl", "Highlighter", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l-3 5h6l1-3M9 15l8-11 4 3-8 10z"/></svg>')}
      ${tool("eraser", "Eraser", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4l5 5-10 10H6l-3-3z"/><path d="M11 9l5 5M8 20h13"/></svg>')}
      ${tool("text", "Text (type with the keyboard)", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>')}
      <span class="ink-sep"></span>
      ${COLORS.map((c, i) => `<button type="button" class="ink-color" data-c="${c}" aria-pressed="${i === 0}" style="--c:${c}" aria-label="Colour ${i + 1}"></button>`).join("")}
      <span class="ink-sep"></span>
      ${[0, 1, 2].map((i) => `<button type="button" class="ink-size" data-s="${i}" aria-pressed="${i === 1}" aria-label="${["Thin", "Medium", "Thick"][i]}"><i style="--d:${4 + i * 4}px"></i></button>`).join("")}
      <span class="ink-sep"></span>
      <button type="button" class="ink-tool" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg></button>
      <button type="button" class="ink-tool" data-act="clear" title="Clear this page" aria-label="Clear this page"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`;
    // Marks one button in a group as pressed and the others as not pressed.
    const press = (sel, el) =>
      host
        .querySelectorAll(sel)
        .forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
    host.querySelectorAll("[data-t]").forEach((b) =>
      b.addEventListener("click", () => {
        ctl.setTool(b.dataset.t);
        press("[data-t]", b);
        if (
          b.dataset.t === "hl" &&
          /^#(141414|FFFFFF)$/i.test(ctl.state.color)
        ) {
          const y = host.querySelector('[data-c="#FFE45C"]');
          ctl.setColor("#FFE45C");
          press("[data-c]", y);
        }
      }),
    );
    host.querySelectorAll("[data-c]").forEach((b) =>
      b.addEventListener("click", () => {
        ctl.setColor(b.dataset.c);
        press("[data-c]", b);
        if (ctl.state.tool === "none" || ctl.state.tool === "eraser")
          host.querySelector('[data-t="pen"]').click();
      }),
    );
    host.querySelectorAll("[data-s]").forEach((b) =>
      b.addEventListener("click", () => {
        ctl.setSize(+b.dataset.s);
        press("[data-s]", b);
      }),
    );
    host
      .querySelector('[data-act="undo"]')
      .addEventListener("click", () => ctl.undo());
    host
      .querySelector('[data-act="clear"]')
      .addEventListener("click", () => ctl.clear());
    press("[data-t]", host.querySelector(`[data-t="${ctl.state.tool}"]`));
    return {
      select(t) {
        host.querySelector(`[data-t="${t}"]`)?.click();
      },
    };
  }

  return { toPNG, attach, toolbar };
})();
