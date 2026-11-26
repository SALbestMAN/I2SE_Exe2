// =============================================================================
// Works with files in the browser: shows the pages of a PDF (slides), makes new PDFs,
// and reads the text out of handed-in homework (PDF, Word, notebooks, code). The
// libraries are downloaded only when a page first needs them.
// =============================================================================
var Files = (() => {
  // =============================================================================
  // Where the PDF reader (pdf.js) is downloaded from.
  // =============================================================================
  const PDF_SRC =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDF_WORKER =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const DOCX_SRC =
    "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js";
  const loaded = {};

  // =============================================================================
  // Adds a script to the page and waits until it has loaded. Does nothing if ready()
  // says it is already there.
  // =============================================================================
  function script(src, ready) {
    if (ready()) return Promise.resolve();
    if (!loaded[src])
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => res();
        s.onerror = () => {
          delete loaded[src];
          rej(new Error("A viewer library didn't load (are you online?)"));
        };
        document.head.append(s);
      });
    return loaded[src];
  }

  // =============================================================================
  // Loads the PDF reader once and tells it where its helper (worker) file is.
  // =============================================================================
  async function pdfLib() {
    await script(PDF_SRC, () => !!window.pdfjsLib);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    return pdfjsLib;
  }

  // =============================================================================
  // Loads pdf-lib, which makes new PDF files (slides with drawings on them, the
  // whiteboard, pictures turned into slides).
  // =============================================================================
  async function pdfWriter() {
    await script(
      "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
      () => !!window.PDFLib,
    );
    return PDFLib;
  }

  // =============================================================================
  // Opens a PDF from a file the user picked or from a web address.
  // =============================================================================
  async function openPDF(src) {
    const L = await pdfLib();
    const opts =
      src instanceof Blob
        ? { data: new Uint8Array(await src.arrayBuffer()) }
        : { url: src };
    return L.getDocument(opts).promise;
  }

  // =============================================================================
  // Remembers which drawing job each canvas is busy with, so a new page can cancel the
  // old one.
  // =============================================================================
  const tasks = new WeakMap();

  // =============================================================================
  // Draws page n of a PDF so it fits inside a box on screen. The page is drawn off
  // screen first, so the old slide stays visible until the new one is ready, and it is
  // drawn sharp on high-resolution screens.
  // =============================================================================
  async function drawPage(doc, n, canvas, boxW, boxH) {
    const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, n)));
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.max(
      0.1,
      Math.min(boxW / v1.width, boxH ? boxH / v1.height : Infinity),
    );
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: scale * dpr });
    const off = document.createElement("canvas");
    off.width = Math.round(vp.width);
    off.height = Math.round(vp.height);
    tasks.get(canvas)?.cancel();
    const task = page.render({
      canvasContext: off.getContext("2d"),
      viewport: vp,
    });
    tasks.set(canvas, task);
    try {
      await task.promise;
    } catch (e) {
      if (e?.name === "RenderingCancelledException") return false;
      throw e;
    }
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.style.width = off.width / dpr + "px";
    canvas.style.height = off.height / dpr + "px";
    canvas.getContext("2d").drawImage(off, 0, 0);
    return true;
  }

  // =============================================================================
  // File endings we can read as plain text (code, notes, data).
  // =============================================================================
  const TEXT_EXT =
    /\.(txt|md|py|js|jsx|ts|tsx|java|c|h|cpp|hpp|cs|go|rb|php|html|css|json|sql|kt|swift|rs|scala|m|r|sh|xml|yml|yaml|csv)$/i;

  // =============================================================================
  // Tells what kind of file this is from its name: pdf, docx, notebook, text, or nothing
  // we can read.
  // =============================================================================
  const kindOf = (name) =>
    /\.pdf$/i.test(name)
      ? "pdf"
      : /\.docx$/i.test(name)
        ? "docx"
        : /\.ipynb$/i.test(name)
          ? "ipynb"
          : TEXT_EXT.test(name)
            ? "text"
            : "";

  // =============================================================================
  // The file types students may hand in.
  // =============================================================================
  const ACCEPT =
    ".pdf,.docx,.ipynb,.txt,.md,.py,.js,.ts,.java,.c,.h,.cpp,.hpp,.cs,.go,.html,.css,.json,.sql,.kt,.swift,.rs,.xml,.yml,.yaml";

  // =============================================================================
  // Reads the text of a PDF, page by page, up to maxPages pages.
  // =============================================================================
  async function pdfText(file, maxPages = 60) {
    const doc = await openPDF(file);
    let out = "";
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      out += c.items.map((x) => x.str).join(" ") + "\n\n";
    }
    return { text: out.trim(), pages: doc.numPages };
  }

  // =============================================================================
  // Reads the text out of a handed-in file of any kind we support, so the AI can review
  // it.
  // =============================================================================
  async function textOf(file) {
    const kind = kindOf(file.name);
    if (kind === "pdf") return (await pdfText(file)).text;
    if (kind === "docx") {
      await script(DOCX_SRC, () => !!window.mammoth);
      return (
        await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      ).value.trim();
    }
    if (kind === "ipynb") {
      try {
        const nb = JSON.parse(await file.text());
        return (nb.cells || [])
          .map(
            (c) => `# [${c.cell_type}]\n` + [].concat(c.source || []).join(""),
          )
          .join("\n\n");
      } catch (e) {
        return await file.text();
      }
    }
    if (kind === "text") return await file.text();
    return "";
  }
  return { pdfWriter, openPDF, drawPage, pdfText, textOf, kindOf, ACCEPT };
})();
