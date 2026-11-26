// =============================================================================
// The "printer" that appears when the user downloads or prints something: a small desk
// printer floats in, prints a page that rolls up, and then the real file is saved (or
// the print window opens). It also prints clean pages such as summaries and reviews.
// =============================================================================
var Printer = (() => {
  // =============================================================================
  // The printer on screen (if any) and whether it is printing right now.
  // =============================================================================
  let el = null,
    busy = false;

  // =============================================================================
  // True when the person asked their system for less motion.
  // =============================================================================
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =============================================================================
  // Waits for the given number of milliseconds.
  // =============================================================================
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // =============================================================================
  // The little page that comes out of the printer: title, date, and a few lines that
  // look like the file.
  // =============================================================================
  function paperHTML(o) {
    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `
      <div class="pp-head">
        <span class="pp-mark">${esc(o.kicker || "Printout")}</span><span>${esc(date)}</span>
      </div>
      <p class="pp-title" dir="auto">${esc(o.title || "")}</p>
      ${o.sub ? `<p class="pp-sub" dir="auto">${esc(o.sub)}</p>` : ""}
      <div class="pp-rows">${(o.rows || [])
        .slice(0, 14)
        .map(
          ([a, b]) =>
            `<div class="pp-row"><span dir="auto">${esc(a)}</span><span>${esc(b ?? "")}</span></div>`,
        )
        .join("")}</div>
      ${o.note ? `<p class="pp-note" dir="auto">${esc(o.note)}</p>` : ""}`;
  }

  // =============================================================================
  // Takes the printer off the screen.
  // =============================================================================
  function close() {
    if (!el) return;
    const node = el;
    el = null;
    node.classList.add("pr-leaving");
    setTimeout(() => node.remove(), 320);
    document.removeEventListener("keydown", onKey);
  }

  // =============================================================================
  // Esc closes the printer (unless it is in the middle of printing).
  // =============================================================================
  function onKey(e) {
    if (e.key === "Escape" && !busy) close();
  }

  // =============================================================================
  // Shows the printer with a choice of buttons (for example CSV or Excel). Pressing one
  // starts printing.
  // =============================================================================
  function open(o) {
    if (el) close();
    busy = false;
    el = document.createElement("div");
    el.className = "pr-overlay" + (o.receipt ? " is-receipt" : "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", `Print ${o.title || ""}`);
    el.innerHTML = `
      <button class="pr-close icon-btn" aria-label="Close">${typeof icon === "function" ? icon("close", 18) : "×"}</button>
      <div class="pr-scene">
        <button class="pr-printer" aria-label="Print ${esc(o.title || "")}">
          <span class="pr-body">
            <span class="pr-seam"></span>
            <span class="pr-led"></span>
            <span class="pr-slot"></span>
          </span>
          <span class="pr-feet"></span>
        </button>
        <div class="pr-out"><div class="pr-paper">${paperHTML(o)}</div><span class="pr-roll"></span></div>
      </div>
      <div class="pr-caption">
        <p class="pr-title" dir="auto">${esc(o.title || "")}</p>
        <p class="pr-hint" role="status">Press the printer to print.</p>
        <div class="row" style="gap:8px;justify-content:center;margin-top:14px">
          <button class="btn" data-pr="cancel">Cancel</button>
          <button class="btn btn-primary" data-pr="go">Print</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.addEventListener("keydown", onKey);
    el.querySelector(".pr-close").addEventListener(
      "click",
      () => !busy && close(),
    );
    el.querySelector("[data-pr=cancel]").addEventListener(
      "click",
      () => !busy && close(),
    );
    el.addEventListener("click", (e) => {
      if (e.target === el && !busy) close();
    });
    // Starts printing with these options.
    const go = () => run(o);
    el.querySelector(".pr-printer").addEventListener("click", go);
    el.querySelector("[data-pr=go]").addEventListener("click", go);
    setTimeout(() => el?.querySelector("[data-pr=go]")?.focus(), 50);
  }

  // =============================================================================
  // Plays the printing animation while the real work (o.action) runs, then shows "done"
  // or the error.
  // =============================================================================
  async function run(o) {
    if (busy || !el) return;
    busy = true;
    const node = el,
      hint = node.querySelector(".pr-hint");
    node.querySelectorAll("[data-pr]").forEach((b) => (b.disabled = true));
    hint.textContent = "Printing…";
    // Runs the real work and returns the error, if there was one.
    const work = () =>
      Promise.resolve()
        .then(() => o.action?.())
        .then(
          () => null,
          (e) => e || new Error("Printing failed"),
        );
    const early = o.when === "end" ? null : work();
    if (!reduce()) {
      node.classList.add("is-printing");
      await wait(1400);
      node.classList.remove("is-printing");
      node.classList.add("is-rolling");
      await wait(480);
      node.classList.add("is-dropping");
      await wait(380);
    }
    const error = await (early || work());
    if (el !== node) return;
    node.classList.add(error ? "is-error" : "is-done");
    hint.textContent = error
      ? error.message || "Printing failed"
      : o.done || "Done";
    busy = false;
    if (error) {
      node.querySelectorAll("[data-pr]").forEach((b) => (b.disabled = false));
      node.querySelector("[data-pr=go]").textContent = "Try again";
      node.classList.remove("is-rolling", "is-dropping");
      return;
    }
    await wait(650);
    if (el === node) close();
  }

  // =============================================================================
  // Prints a clean page (for example a summary or a review) from a hidden frame, so the
  // user gets a neat printout or PDF.
  // =============================================================================
  function printHTML(title, html) {
    const f = document.createElement("iframe");
    f.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        @page { margin: 18mm; }
        body { font: 12pt/1.55 "Inter Tight", "Heebo", system-ui, sans-serif; color: #1D1D1F; }
        h1 { font-size: 22pt; letter-spacing: -0.02em; margin: 0 0 4pt; } h2 { font-size: 14pt; margin: 18pt 0 6pt; } h3 { font-size: 12pt; margin: 14pt 0 4pt; }
        .muted, .small.muted { color: #6E6E73; } .small { font-size: 10pt; } p { margin: 0 0 6pt; } ul, ol { margin: 4pt 0 8pt; }
        .head { display: flex; justify-content: space-between; font-size: 9pt; color: #6E6E73; border-bottom: 1px solid #ddd; padding-bottom: 6pt; margin-bottom: 14pt; }
        .stack > * + * { margin-top: 8pt; } .row { display: flex; gap: 8pt; align-items: baseline; }
        table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: 4pt 6pt; border-bottom: 1px solid #eee; }
      </style></head><body dir="auto">
      <div class="head"><span>${esc(title)}</span><span>${new Date().toLocaleDateString("en-GB")}</span></div>
      ${html}</body></html>`);
    d.close();
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          f.contentWindow.focus();
          f.contentWindow.print();
        } catch (e) {}
        setTimeout(() => {
          f.remove();
          resolve();
        }, 1000);
      }, 250);
    });
  }

  return { open, printHTML };
})();
