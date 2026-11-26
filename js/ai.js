// =============================================================================
// The AI features: lecture summaries and homework reviews, using Google's Gemini. The
// lecturer's Gemini key is kept only in the lecturer's own browser (AI settings);
// students' phones never get it.
// =============================================================================
const AI = (() => {
  // =============================================================================
  // Where the AI settings are saved in this browser, Gemini's web address, and the
  // largest file (15 MB) we send inside a request. Bigger files are uploaded first.
  // =============================================================================
  const KEY = "lectureapp.ai";
  const BASE = "https://generativelanguage.googleapis.com";
  const INLINE_MAX = 15 * 1024 * 1024;

  // =============================================================================
  // The saved AI settings: the Gemini key and the chosen model.
  // =============================================================================
  function settings() {
    try {
      return {
        key: "",
        model: "",
        ...JSON.parse(localStorage.getItem(KEY) || "{}"),
      };
    } catch (e) {
      return { key: "", model: "" };
    }
  }

  // =============================================================================
  // Saves AI settings in this browser.
  // =============================================================================
  function saveSettings(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...settings(), ...s }));
    } catch (e) {}
  }

  // =============================================================================
  // True when a key and a model have been chosen.
  // =============================================================================
  function ready() {
    const s = settings();
    return !!(s.key && s.model);
  }

  // =============================================================================
  // Turns an error from Gemini into a short message a lecturer can act on (wrong key,
  // daily limit used up, recording too long, no connection...).
  // =============================================================================
  function friendly(err) {
    const m = String(err?.message || err);
    if (m === "NO_KEY") return "Add a Gemini API key in AI settings.";
    if (m === "UPLOAD_BLOCKED")
      return "The browser couldn't upload this large file directly. Use a transcript, a clip under 15 MB, or wait for the server step.";
    if (/API key not valid|API_KEY_INVALID/i.test(m))
      return "The API key isn't valid.";
    if (/quota/i.test(m))
      return "The free Gemini limit is used up for now (per minute or per day). Wait a bit, use a shorter recording, or try again tomorrow.";
    if (/not found|is not supported/i.test(m) && /models\//.test(m))
      return "This Gemini model isn't available for your key. Open AI settings → Load models and pick another one.";
    if (/too large|exceeds|token count|maximum number of tokens/i.test(m))
      return "The recording is too long for Gemini in one go. Use the audio only, a shorter part, or the transcript.";
    if (/Failed to fetch|NetworkError/i.test(m))
      return "No connection to the AI service.";
    return m;
  }

  // =============================================================================
  // Asks Google which Gemini models this key can use, fast ("Flash") models first.
  // =============================================================================
  async function listModels(key) {
    const r = await fetch(`${BASE}/v1beta/models?pageSize=200`, {
      headers: { "x-goog-api-key": key },
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.status);
    return (j.models || [])
      .filter((m) =>
        (m.supportedGenerationMethods || []).includes("generateContent"),
      )
      .filter((m) => !/image|tts|live|embedding|aqa|learnlm/i.test(m.name))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        label: m.displayName || m.name,
      }))
      .sort(
        (a, b) =>
          /flash/i.test(b.id) - /flash/i.test(a.id) || b.id.localeCompare(a.id),
      );
  }

  // =============================================================================
  // Who wants to hear progress messages from inside (retries, switching to another
  // model).
  // =============================================================================
  let notify = null;

  // =============================================================================
  // Sets who receives those progress messages.
  // =============================================================================
  function setNotifier(fn) {
    notify = fn;
  }

  // =============================================================================
  // Errors that mean "busy, try again soon" (by status code or by Google's wording).
  // Other errors fail right away.
  // =============================================================================
  const BUSY_STATUS = [429, 500, 502, 503, 504];
  const BUSY_TEXT =
    /high demand|overloaded|UNAVAILABLE|try again later|RESOURCE_EXHAUSTED|deadline exceeded/i;

  // =============================================================================
  // True when an error means the model is busy.
  // =============================================================================
  const isBusy = (e) =>
    BUSY_STATUS.includes(e.status) || BUSY_TEXT.test(e.message);

  // =============================================================================
  // When we last called Gemini, to keep a gap between calls.
  // =============================================================================
  let lastCall = 0;

  // =============================================================================
  // Waits for the given number of milliseconds.
  // =============================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // =============================================================================
  // The free plan allows only a few calls a minute, so this waits until enough time has
  // passed since the last call.
  // =============================================================================
  async function pace(gap = 4000) {
    const w = lastCall + gap - Date.now();
    if (w > 0) await sleep(w);
    lastCall = Date.now();
  }

  // =============================================================================
  // Waits while telling the lecturer how many seconds are left before the next try.
  // =============================================================================
  async function countdown(ms, model) {
    for (let left = Math.ceil(ms / 1000); left > 0; left -= 5) {
      notify?.(`${model} is busy, trying again in ${left} s…`);
      await sleep(Math.min(5000, left * 1000));
    }
  }

  // =============================================================================
  // Asks Gemini and returns its answer. If the model is busy it waits as long as Google
  // asks (or 5 then 15 seconds) and then tries the other models this key can use. A
  // model whose free daily limit is used up is skipped at once.
  // =============================================================================
  async function generate(parts, opts = {}) {
    const { key, model } = settings();
    if (!key || !model) throw new Error("NO_KEY");
    const models = [model, ...(await backupModels(key, model))];
    let lastErr,
      allDaily = true;
    for (const m of models) {
      if (m !== model) notify?.(`Trying ${m}…`);
      for (let attempt = 0; attempt < 3; attempt++) {
        await pace();
        try {
          return await generateOnce(parts, opts, key, m);
        } catch (e) {
          lastErr = e;
          if (e.badFormat) {
            allDaily = false;
            if (attempt >= 1) break;
            continue;
          }
          if (!isBusy(e)) throw e;
          if (e.daily) break;
          allDaily = false;
          if (attempt === 2) break;
          await countdown(
            Math.min(60000, Math.max(e.retryMs || 0, [5000, 15000][attempt])),
            m,
          );
        }
      }
    }
    if (allDaily)
      throw new Error(
        "Today's free Gemini limit is used up (on every model this key can use). It resets tomorrow; or add billing to the key in Google AI Studio.",
      );
    if (lastErr?.badFormat)
      throw new Error(
        "Gemini kept sending a garbled answer. Press Review again in a moment.",
      );
    throw new Error(
      "Gemini is overloaded right now (all models tried). Wait a minute or two and press Review again.",
    );
  }

  // =============================================================================
  // Other models this key can use, fast ones first; "lite" models have the highest free
  // limits.
  // =============================================================================
  async function backupModels(key, model) {
    let { models = [] } = settings();
    if (!models.length) {
      try {
        models = (await listModels(key)).map((m) => m.id);
        saveSettings({ models });
      } catch (e) {
        return [];
      }
    }
    const ok = models.filter(
      (m) =>
        m !== model &&
        /flash/i.test(m) &&
        !/preview|exp|tts|image|live/i.test(m),
    );
    const lite = ok.filter((m) => /lite/i.test(m)),
      rest = ok.filter((m) => !/lite/i.test(m));
    return [...rest.slice(0, 1), ...lite.slice(0, 2)];
  }

  // =============================================================================
  // An error with a status code attached.
  // =============================================================================
  const fail = (message, status) =>
    Object.assign(new Error(message), { status });

  // =============================================================================
  // One request to one model. Asks for JSON by default, sends recordings at low
  // resolution to save tokens, and gives up after 6 minutes with a clear message.
  // =============================================================================
  async function generateOnce(
    parts,
    { json = true, media = false, think = 0 } = {},
    key,
    model,
    lowRes = true,
  ) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6 * 60 * 1000);
    const config = {
      temperature: 0.3,
      ...(json ? { responseMimeType: "application/json" } : {}),
      ...(media && lowRes ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
      ...(think && /gemini-2\.5/i.test(model)
        ? {
            thinkingConfig: {
              thinkingBudget: /pro/i.test(model) ? Math.max(128, think) : think,
            },
          }
        : {}),
    };
    let r, raw;
    try {
      r = await fetch(`${BASE}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: config,
        }),
      });
      raw = await r.text();
    } catch (e) {
      throw fail(
        e.name === "AbortError"
          ? "Gemini took longer than 6 minutes. Try a shorter recording, the audio only, or a faster model."
          : e.message,
      );
    } finally {
      clearTimeout(timer);
    }
    let j;
    try {
      j = JSON.parse(raw);
    } catch (e) {
      throw fail(
        `Gemini sent an unexpected reply (HTTP ${r.status})`,
        r.status,
      );
    }
    if (!r.ok) {
      const msg = j.error?.message || `HTTP ${r.status}`;
      if (
        media &&
        lowRes &&
        r.status === 400 &&
        /mediaResolution|media_resolution/i.test(msg)
      )
        return generateOnce(parts, { json, media, think }, key, model, false);
      if (think && r.status === 400 && /thinking/i.test(msg))
        return generateOnce(parts, { json, media }, key, model, lowRes);
      const details = JSON.stringify(j.error?.details || []);
      const delay = (details.match(/"retryDelay"\s*:\s*"([\d.]+)s"/) || [])[1];
      const daily =
        r.status === 429 && /PerDay|per_day|per day|daily/i.test(details + msg);
      throw Object.assign(fail(msg, r.status), {
        retryMs: delay ? parseFloat(delay) * 1000 : 0,
        daily,
      });
    }
    const cand = j.candidates?.[0];
    if (!cand)
      throw fail(
        "Gemini returned no answer" +
          (j.promptFeedback?.blockReason
            ? " (blocked: " + j.promptFeedback.blockReason + ")"
            : ""),
      );
    const text = (cand.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("")
      .trim();
    if (!text) {
      const why = cand.finishReason;
      if (
        why === "SAFETY" ||
        why === "RECITATION" ||
        why === "PROHIBITED_CONTENT" ||
        why === "BLOCKLIST"
      )
        throw fail(`Gemini refused to summarize this content (${why}).`);
      throw fail(
        "Gemini returned an empty answer" + (why ? " (" + why + ")" : ""),
        why ? undefined : 503,
      );
    }
    if (!json) return text;
    if (cand.finishReason === "MAX_TOKENS")
      throw Object.assign(fail("Gemini's answer was cut off. Try again."), {
        badFormat: true,
      });
    return parseJSON(text);
  }

  // =============================================================================
  // Replaces the long dash in everything the AI writes ("a — b" becomes "a, b"), so the
  // app's writing stays consistent.
  // =============================================================================
  function noDashes(v) {
    if (typeof v === "string")
      return v.replace(/\s*\u2014\s*/g, ", ").replace(/^, |, $/g, "");
    if (Array.isArray(v)) return v.map(noDashes);
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) v[k] = noDashes(v[k]);
      return v;
    }
    return v;
  }

  // =============================================================================
  // Reads the JSON answer even when Gemini wrapped it in a code block or added a
  // sentence around it.
  // =============================================================================
  function parseJSON(text) {
    const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const tries = [clean];
    const a = clean.indexOf("{"),
      b = clean.lastIndexOf("}");
    if (a >= 0 && b > a) tries.push(clean.slice(a, b + 1));
    tries.push(
      ...tries.map((t) =>
        t.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"'),
      ),
    );
    for (const t of tries) {
      try {
        const v = noDashes(JSON.parse(t));
        return Array.isArray(v) && v.length === 1 && typeof v[0] === "object"
          ? v[0]
          : v;
      } catch (e) {}
    }
    throw Object.assign(fail("Gemini's answer came back garbled. Try again."), {
      badFormat: true,
    });
  }

  // =============================================================================
  // File types by file ending, for files the browser does not label itself.
  // =============================================================================
  const MIME = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "video/webm",
    mp4: "video/mp4",
    mov: "video/quicktime",
    pdf: "application/pdf",
  };

  // =============================================================================
  // The type of a file (audio, video, PDF...).
  // =============================================================================
  const mimeOf = (file) =>
    file.type ||
    MIME[file.name.split(".").pop().toLowerCase()] ||
    "application/octet-stream";

  // =============================================================================
  // Reads a file into text form (base64) so it can go inside a request.
  // =============================================================================
  function toBase64(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1]);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  // =============================================================================
  // Uploads a big file to Gemini's file storage in one resumable upload, then waits
  // until Gemini has processed it.
  // =============================================================================
  async function uploadFile(file, onStep) {
    const { key } = settings();
    const mime = mimeOf(file);
    onStep?.("Uploading recording…");
    let start;
    try {
      start = await fetch(`${BASE}/upload/v1beta/files`, {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(file.size),
          "X-Goog-Upload-Header-Content-Type": mime,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: file.name } }),
      });
    } catch (e) {
      throw new Error("UPLOAD_BLOCKED");
    }
    const url = start.headers.get("x-goog-upload-url");
    if (!url) throw new Error("UPLOAD_BLOCKED");
    const up = await fetch(url, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: file,
    });
    const uploaded = (await up.json().catch(() => ({}))).file;
    if (!up.ok || !uploaded?.name)
      throw fail(
        "The upload to Google failed (HTTP " +
          up.status +
          "). Try again, or use a smaller file.",
      );
    const info = await waitActive(uploaded, onStep);
    return {
      file_data: { mime_type: info.mimeType || mime, file_uri: info.uri },
    };
  }

  // =============================================================================
  // Waits until Gemini has finished processing an uploaded file (a long video can take
  // minutes), telling the lecturer while it waits.
  // =============================================================================
  async function waitActive(info, onStep, minutes = 5) {
    const { key } = settings();
    onStep?.("Google is processing the recording…");
    const name = info?.name;
    if (!name) throw fail("Google didn't accept the recording.");
    for (let i = 0; i < minutes * 20 && info.state !== "ACTIVE"; i++) {
      if (info.state === "FAILED")
        throw new Error(
          "Google couldn't read this recording (is it a normal audio/video file?)",
        );
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`${BASE}/v1beta/${name}`, {
        headers: { "x-goog-api-key": key },
      });
      const next = await res
        .json()
        .catch(() => ({ error: { message: "unexpected reply" } }));
      if (!res.ok || next.error)
        throw new Error(
          "Google stopped processing the recording: " +
            (next.error?.message || res.status),
        );
      info = next;
      if (i % 5 === 4)
        onStep?.(`Google is processing the recording… (${info.state})`);
    }
    if (info.state !== "ACTIVE")
      throw new Error(
        `Google is still processing the recording after ${minutes} minutes. Try again in a bit, or use the audio only.`,
      );
    return info;
  }

  // =============================================================================
  // A file ready to send to Gemini: inside the request when small, uploaded first when
  // big.
  // =============================================================================
  async function filePart(file, onStep) {
    if (file.size <= INLINE_MAX)
      return {
        inline_data: { mime_type: mimeOf(file), data: await toBase64(file) },
      };
    return uploadFile(file, onStep);
  }

  // =============================================================================
  // What a summary must look like (the same layout as Zoom's own meeting summary): a
  // title, a short recap, next steps by person, then the lecture topic by topic.
  // =============================================================================
  const SUMMARY_SHAPE = `Return JSON only, with this shape:
{"title": string (short: what the lecture was about),
 "recap": string (one paragraph, 4-7 sentences: what the lecture focused on, what the lecturer stressed, what students have to do),
 "nextSteps": [{"who": string, "items": [string]}],
 "sections": [{"title": string, "time": "HH:MM:SS" or "", "text": string}]}
Rules:
- Write like Zoom's meeting summary: plain, flowing prose in the third person ("The lecturer explained…", "He stressed…"). No bullet lists inside "recap" or "sections".
- Call the lecturer by the name used in the lecture if one is said; otherwise "the lecturer" (in the summary's language).
- "nextSteps": only concrete things someone said will be done (uploads, deadlines, tasks, demos). Group them by who does them: the lecturer by name first, then the students (in the summary's language, e.g. "Students"). Start each item with a verb, or with "Students:" style when the group mixes people. Leave the list empty if nothing was assigned.
- "sections": 4-7 sections in the order they came up. Each "title" is a short noun phrase; each "text" is one paragraph of 3-6 sentences with the specifics (examples, requirements, warnings, analogies the lecturer used).
- Never use the long dash character; use commas or full stops.
- Use only what is said in the lecture. Do not invent content.`;

  // =============================================================================
  // The opening instructions for a summary: which language was spoken and which language
  // to write in.
  // =============================================================================
  function summaryIntro({ spoken, outLang }) {
    const lang = String(outLang || "English").replace(
      / with English terms$/i,
      "",
    );
    const keepTerms = / with English terms$/i.test(outLang || "");
    return `You are summarizing a university lecture, the way Zoom's AI meeting summary does.
The lecture is spoken in ${spoken}.${/English terms/i.test(spoken) ? " The lecturer switches to English for technical terms." : ""}
Write the whole summary in ${lang}. ${
      lang === "English"
        ? ""
        : keepTerms
          ? `Keep technical terms (class, use case, API, etc.) in English inside the ${lang} text.`
          : `Write technical terms in ${lang} too; only names of tools, languages and products stay in English.`
    }`;
  }

  // =============================================================================
  // Summarizes a lecture from its transcript. A very long transcript is summarized in
  // parts and the parts are then joined into one summary.
  // =============================================================================
  async function summarizeTranscript(text, opts, onStep) {
    const CHUNK = 120000;
    if (text.length <= CHUNK) {
      onStep?.("Summarizing…");
      return generate([
        {
          text:
            summaryIntro(opts) +
            "\n" +
            SUMMARY_SHAPE +
            "\n\nTRANSCRIPT:\n" +
            text,
        },
      ]);
    }
    const parts = [];
    for (let i = 0; i < text.length; i += CHUNK)
      parts.push(text.slice(i, i + CHUNK));
    const notes = [];
    for (let i = 0; i < parts.length; i++) {
      onStep?.(`Summarizing part ${i + 1} of ${parts.length}…`);
      notes.push(
        await generate(
          [
            {
              text:
                summaryIntro(opts) +
                `\nThis is part ${i + 1} of ${parts.length}. Write detailed notes with timestamps if present.\n\n` +
                parts[i],
            },
          ],
          { json: false },
        ),
      );
    }
    onStep?.("Combining the parts…");
    return generate([
      {
        text:
          summaryIntro(opts) +
          "\n" +
          SUMMARY_SHAPE +
          "\n\nNOTES FROM ALL PARTS, IN ORDER:\n" +
          notes.join("\n\n---\n\n"),
      },
    ]);
  }

  // =============================================================================
  // Summarizes a lecture from a recording the lecturer uploaded.
  // =============================================================================
  async function summarizeMedia(file, opts, onStep) {
    onStep?.(`Reading the file (${(file.size / 1048576).toFixed(1)} MB)…`);
    const part = await filePart(file, onStep);
    onStep?.("Listening and summarizing…");
    return generate(
      [
        part,
        {
          text:
            summaryIntro(opts) +
            "\nListen to the attached recording.\n" +
            SUMMARY_SHAPE,
        },
      ],
      { media: true },
    );
  }

  // =============================================================================
  // Recognises a YouTube link. YouTube goes straight to Gemini; Zoom, Google Drive and
  // direct links go through our server function first.
  // =============================================================================
  const YT = /(youtube\.com\/(watch|live|shorts|embed)|youtu\.be\/)/i;

  // =============================================================================
  // A clean YouTube link (https://www.youtube.com/watch?v=ID), without the start time,
  // playlist or tracking parts.
  // =============================================================================
  function youtubeURL(url) {
    const m = String(url).match(
      /(?:v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/,
    );
    return m ? "https://www.youtube.com/watch?v=" + m[1] : null;
  }

  // =============================================================================
  // When the lecturer pastes the address of a Zoom recording that is playing, that
  // address only works in their own browser. It contains the real share link, which is
  // what we need; this takes it out.
  // =============================================================================
  function zoomShareURL(url) {
    try {
      const u = new URL(String(url).trim());
      if (
        !/(^|\.)zoom\.(us|com)$/i.test(u.hostname) ||
        !/\/rec\/play\//i.test(u.pathname)
      )
        return url;
      const share = new URL(u.searchParams.get("originRequestUrl") || "");
      return /(^|\.)zoom\.(us|com)$/i.test(share.hostname) &&
        /\/rec\/share\//i.test(share.pathname)
        ? share.href
        : url;
    } catch (e) {
      return url;
    }
  }

  // =============================================================================
  // Summarizes a lecture from a link. YouTube: Gemini watches it directly. Zoom or
  // Drive: our server function opens the link; if Zoom made a transcript we summarize
  // the text (fast), otherwise the server copies the video to Gemini piece by piece and
  // then Gemini summarizes it.
  // =============================================================================
  async function summarizeLink(url, opts, onStep) {
    const { key, model } = settings();
    if (!key || !model) throw new Error("NO_KEY");
    let part, r;
    if (YT.test(url)) {
      onStep?.("YouTube link: Gemini watches it directly…");
      const clean = youtubeURL(url);
      if (!clean)
        throw new Error("This doesn't look like a YouTube video link.");
      const prompt = {
        text:
          summaryIntro(opts) +
          "\nWatch/listen to the attached lecture recording.\n" +
          SUMMARY_SHAPE,
      };
      const tries = [
        { mime_type: "video/mp4", file_uri: clean },
        { file_uri: clean },
        { mime_type: "video/*", file_uri: clean },
      ];
      let last;
      for (let i = 0; i < tries.length; i++) {
        try {
          if (i) onStep?.("Trying the YouTube link another way…");
          else onStep?.("Listening and summarizing…");
          return await generate([{ file_data: tries[i] }, prompt], {
            media: true,
          });
        } catch (e) {
          last = e;
          if (
            !/mime|unsupported|file_uri|file_data|invalid argument|INVALID_ARGUMENT/i.test(
              e.message || "",
            )
          )
            throw e;
        }
      }
      throw new Error(
        "Gemini couldn't open this YouTube video (" +
          (last?.message || "unknown") +
          "). Make sure it's Public or Unlisted, or use Upload a recording.",
      );
    } else {
      const share = zoomShareURL(url);
      if (share !== url) {
        onStep?.(
          "That's Zoom's player address; using the recording's share link from inside it.",
        );
        url = share;
      }
      onStep?.("Opening the link on the server…");
      r = await API.callFunction("fetch-recording", {
        action: "inspect",
        url,
        key,
      });
      const len = r.durationSec
        ? ` (${Math.round(r.durationSec / 60)} min)`
        : "";
      if (r.kind === "transcript") {
        onStep?.(
          `Found Zoom's transcript for "${r.title || "the recording"}"${len}, ${Math.round(r.text.length / 1000)}k characters`,
        );
        const out = await summarizeTranscript(r.text, opts, onStep);
        if (r.durationSec) out.durationSec = r.durationSec;
        return out;
      }
      // Bytes as megabytes, for the progress messages.
      const mb = (n) => Math.round(n / 1048576);
      onStep?.(
        `No transcript, so the video is used${len}: copying ${mb(r.size)} MB to Gemini…`,
      );
      let offset = 0,
        file = null,
        tries = 0,
        lastPct = -1;
      while (!file) {
        try {
          const c = await API.callFunction("fetch-recording", {
            action: "chunk",
            src: r.src,
            referer: r.referer,
            uploadUrl: r.uploadUrl,
            offset,
            size: r.size,
            chunk: r.chunk,
          });
          offset = c.offset;
          tries = 0;
          if (c.done) file = c.file;
          const pct = Math.floor((offset / r.size) * 100);
          if (pct >= lastPct + 10 || c.done) {
            onStep?.(
              `Copying the recording… ${pct}% (${mb(offset)} of ${mb(r.size)} MB)`,
            );
            lastPct = pct;
          }
        } catch (e) {
          if (++tries > 2) throw e;
          onStep?.("A piece didn't copy, trying it again…");
          await new Promise((res) => setTimeout(res, 2000 * tries));
        }
      }
      const info = await waitActive(
        { ...file },
        onStep,
        r.size > 150e6 ? 15 : 5,
      );
      part = {
        file_data: {
          mime_type: info.mimeType || file.mimeType || r.mimeType,
          file_uri: info.uri,
        },
      };
    }
    onStep?.("Listening and summarizing…");
    const out = await generate(
      [
        part,
        {
          text:
            summaryIntro(opts) +
            "\nWatch/listen to the attached lecture recording.\n" +
            SUMMARY_SHAPE,
        },
      ],
      { media: true },
    );
    if (r?.durationSec) out.durationSec = r.durationSec;
    return out;
  }

  // =============================================================================
  // What a homework review must look like. It is short and human, so a student can read
  // it in a minute. The AI only checks the assignment's own requirements; the score is
  // then worked out here from that checklist (done = full points, partial = half,
  // missing = none).
  // =============================================================================
  const REVIEW_SHAPE = `Return JSON only, in this shape:
{"requirements": [{"item": string (one requirement, max 8 words), "status": "done" | "partial" | "missing",
                   "note": string ("" when done; otherwise max 15 words saying exactly what part of THE ASSIGNMENT is not met)}],
 "summary": string (2 short sentences, plain words, like a kind teaching assistant talking to the student),
 "strengths": [string] (max 3, each one short sentence),
 "improvements": [string] (ONLY about requirements that are partial or missing; [] if everything is done),
 "tips": [string] (max 2 optional ideas that are NOT required by the assignment; they never lower the grade),
 "approach": string (1 sentence on HOW they solved it, no names),
 "team": {"alone": true | false | null (null when the work doesn't say), "names": [string] (every author named in the work: README, docs, file headers, the document's title page; full names or GitHub users exactly as written), "where": string (where it says so, e.g. "README, top")}}
WRITING RULES: simple everyday English, short sentences, no long lists of file paths or function names, no markdown.`;

  // =============================================================================
  // The grading rules the AI must follow, so reviews are fair and only grade what the
  // assignment asked for.
  // =============================================================================
  const GRADING_RULES = `HOW TO GRADE (follow strictly):
1. Build the requirement list ONLY from what the assignment document and the lecturer's notes explicitly ask for
   (to-do lists, "must"/"should" statements, required inputs/outputs, required documents, answers in a Q&A section).
   Do NOT invent requirements. Code style, splitting into modules/classes, docstrings, .gitignore, extra tests,
   naming conventions and "best practices" are NOT requirements unless the assignment says so.
2. Mark a requirement "done" when the work reasonably meets it. Small differences that don't change what was asked
   (e.g. a script named Ex1.py instead of Ex0.py, a different but equivalent command format, wording) still count as done.
3. Things you cannot check from files (e.g. how often they committed, run-time speed on the lecturer's machine) are "done"
   unless the files clearly show otherwise. If a document exists but you only saw its name, treat it as done.
4. Use "partial" or "missing" only with a concrete reason taken from the assignment. When in doubt, it is "done".
5. Never lower the grade for anything outside the list. Put such ideas in "tips".`;

  // =============================================================================
  // File endings we read from a student's GitHub repository (code, documents,
  // configuration).
  // =============================================================================
  const CODE_EXT =
    /\.(java|py|js|jsx|ts|tsx|c|h|cpp|hpp|cc|cs|go|rb|php|kt|swift|rs|scala|m|r|sql|html|css|scss|vue|svelte|sh|gradle|xml|yml|yaml|toml|json|md|txt|ipynb)$/i;
  const SKIP =
    /(^|\/)(node_modules|\.git|dist|build|out|target|bin|obj|venv|\.venv|__pycache__|\.idea|\.vscode|vendor|coverage|\.next)\//i;

  // =============================================================================
  // Reads a GitHub link into owner, repository, branch and folder. Returns null for
  // anything that is not a GitHub repository link.
  // =============================================================================
  function parseRepo(url) {
    const m = String(url || "")
      .trim()
      .match(
        /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s?#]+)(\/[^\s?#]*)?)?\/?(?:[?#].*)?$/i,
      );
    if (!m) return null;
    let sub = (m[4] || "").replace(/^\/|\/$/g, "");
    if (/\.[a-z0-9]+$/i.test(sub)) sub = sub.split("/").slice(0, -1).join("/");
    return { owner: m[1], repo: m[2], ref: m[3] || "HEAD", sub };
  }

  // =============================================================================
  // Repositories already read on this page.
  // =============================================================================
  const repoCache = new Map();

  // =============================================================================
  // Reads a public GitHub repository straight from the browser: one call lists the
  // files, then the files themselves are downloaded and joined into one text (README
  // first, then documents, code and tests), up to maxChars characters.
  // =============================================================================
  async function fetchRepo(url, onStep, maxChars = 90000) {
    const r = parseRepo(url);
    if (!r) return null;
    const key = `${r.owner}/${r.repo}@${r.ref}/${r.sub}`;
    if (repoCache.has(key)) return repoCache.get(key);
    onStep?.(`Reading ${r.owner}/${r.repo} on GitHub…`);
    const t = await fetch(
      `https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(r.ref)}?recursive=1`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (t.status === 404 || t.status === 409)
      throw new Error(
        `GitHub: ${r.owner}/${r.repo} wasn't found or is empty (private, renamed or deleted?)`,
      );
    if (t.status === 403 || t.status === 429)
      throw new Error(
        "GitHub's limit for reading repositories is used up for this hour. Try again later.",
      );
    if (!t.ok) throw new Error("GitHub didn't answer (" + t.status + ")");
    const tree = (await t.json()).tree || [];
    const files = tree
      .filter(
        (f) =>
          f.type === "blob" &&
          CODE_EXT.test(f.path) &&
          !SKIP.test(f.path) &&
          f.size < 200000,
      )
      .filter((f) => !r.sub || f.path.startsWith(r.sub + "/"));
    // Which files come first: README, then documents, then code, then tests, then configuration.
    const rank = (f) =>
      /(^|\/)readme/i.test(f.path)
        ? 0
        : /\.(md|txt)$/i.test(f.path)
          ? 1
          : /\.(json|ya?ml|xml|toml|gradle)$/i.test(f.path)
            ? 4
            : /test/i.test(f.path)
              ? 3
              : 2;
    files.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.size - b.size,
    );
    const listing = tree
      .filter((f) => f.type === "blob" && !SKIP.test(f.path))
      .map((f) => f.path);
    let out = `REPOSITORY ${r.owner}/${r.repo}\nFILES (${listing.length}):\n${listing.slice(0, 300).join("\n")}\n\n`;
    let used = 0;
    for (const f of files) {
      if (out.length > maxChars) break;
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${r.ref}/${f.path.split("/").map(encodeURIComponent).join("/")}`,
        );
        if (!res.ok) continue;
        let body = await res.text();
        if (/\.ipynb$/i.test(f.path)) {
          try {
            body = (JSON.parse(body).cells || [])
              .map((c) => [].concat(c.source || []).join(""))
              .join("\n\n");
          } catch (e) {}
        }
        const cap = Math.min(
          rank(f) === 0 ? 12000 : 7000,
          Math.max(0, maxChars - out.length),
        );
        out += `\n===== ${f.path} =====\n${body.slice(0, cap)}${body.length > cap ? "\n[… rest of the file not shown]" : ""}\n`;
        used++;
        if (used % 8 === 0)
          onStep?.(`Reading ${r.owner}/${r.repo}: ${used} files…`);
      } catch (e) {}
    }
    const res = {
      text: out,
      files: used,
      total: listing.length,
      name: `${r.owner}/${r.repo}`,
    };
    repoCache.set(key, res);
    return res;
  }

  // =============================================================================
  // Reviews one student's work: the assignment (its PDF text and requirements), the
  // student's file or text, and their GitHub repository. The AI grades against the
  // requirements written in the assignment itself.
  // =============================================================================
  async function reviewSubmission(assignment, { text, file, link }, onStep) {
    let repo = null,
      repoNote = "";
    if (link && parseRepo(link)) {
      try {
        repo = await fetchRepo(link, onStep, 70000);
      } catch (e) {
        repoNote = `(The student's repository ${link} couldn't be read: ${e.message})`;
      }
    }
    const multi = (assignment.rubric || []).length > 1;
    const prompt = `You review a student's homework for a university course, the way a fair and friendly teaching assistant would.
First list the requirements of the assignment below, then check the student's work against each one.
${GRADING_RULES}
ASSIGNMENT: ${assignment.title}
${assignment.instructions ? "NOTES FROM THE LECTURER: " + assignment.instructions + "\n" : ""}${assignment.briefText ? "THE ASSIGNMENT DOCUMENT:\n" + assignment.briefText.slice(0, 20000) + "\n" : ""}${multi ? 'Also add "criteria": [{"name": string (exactly as below), "score": number, "feedback": string (one short sentence)}] for these parts:\n' + assignment.rubric.map((r) => `- ${r.name} (max ${r.points})`).join("\n") + "\n" : ""}
${REVIEW_SHAPE}`;
    onStep?.("Reviewing…");
    const work = [
      text ? "STUDENT DOCUMENT:\n" + String(text).slice(0, 40000) : "",
      repo
        ? `STUDENT REPOSITORY (${repo.files} of ${repo.total} files read):\n` +
          repo.text
        : "",
      repoNote,
      link && !repo ? "Link the student gave: " + link : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!file && !(text || repo))
      throw fail(
        repoNote ||
          "There is nothing to review yet: no file, no text and no readable GitHub link.",
      );
    const parts = file
      ? [
          await filePart(file, onStep),
          { text: prompt + (work ? "\n\n" + work : "") },
        ]
      : [{ text: prompt + "\n\n" + work }];
    const res = await generate(parts, { think: 1024 });
    if (!res || typeof res !== "object")
      throw fail("Gemini's review wasn't in the expected format. Try again.");
    shapeReview(assignment, res);
    res.repo = repo
      ? { name: repo.name, files: repo.files, total: repo.total }
      : null;
    res.fp = fingerprint((text || "") + "\n" + (repo?.text || ""));
    if (repoNote) res.repo_error = repoNote;
    return res;
  }

  // =============================================================================
  // Turns the AI's checklist into the final review and score. The score goes into
  // "criteria", which the class statistics add up.
  // =============================================================================
  function shapeReview(assignment, res) {
    const rub = (assignment.rubric || []).length
      ? assignment.rubric
      : [{ name: "Score", points: 100 }];
    // A whole number between 0 and max.
    const clamp = (x, max) =>
      Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
    const reqs = (res.requirements || []).filter((q) => q && q.item);
    if (reqs.length) {
      const got = reqs.reduce(
        (t, q) =>
          t + (q.status === "missing" ? 0 : q.status === "partial" ? 0.5 : 1),
        0,
      );
      res.score = Math.round((got / reqs.length) * 100);
      reqs.forEach((q) => {
        if (q.status === "done") q.note = "";
      });
    }
    if (rub.length === 1) {
      const score =
        res.score != null
          ? Number(res.score)
          : (res.criteria || []).reduce(
              (t, c) => t + (Number(c.score) || 0),
              0,
            );
      res.criteria = [
        {
          name: rub[0].name,
          max: rub[0].points,
          score: clamp((score / 100) * rub[0].points, rub[0].points),
          feedback: "",
        },
      ];
    } else {
      res.criteria = rub.map((r) => {
        const c = (res.criteria || []).find((x) => x.name === r.name) || {};
        return {
          name: r.name,
          max: r.points,
          score: clamp(
            c.score ?? ((Number(res.score) || 0) / 100) * r.points,
            r.points,
          ),
          feedback: c.feedback || "",
        };
      });
    }
    if (reqs.length && !reqs.some((q) => q.status !== "done"))
      res.improvements = [];
    ["strengths", "improvements", "tips"].forEach((k) => {
      if (Array.isArray(res[k])) res[k] = res[k].slice(0, 3);
    });
    return res;
  }

  // =============================================================================
  // What a comparison with the class must look like. Classmates are anonymous (P1,
  // P2...): only the lecturer's page turns the labels back into names; a student only
  // ever sees "classmates".
  // =============================================================================
  const COMPARE_SHAPE = `Return JSON only:
{"standing": string (1-2 short sentences: where this work stands in the class),
 "ahead": [string] (max 2: what they did better than most classmates, one short sentence each),
 "behind": [string] (max 2: what most classmates did that they missed, one short sentence each),
 "different_approach": string (one short sentence if their approach is unusual, else ""),
 "learn_from": [string] (max 2 ideas from other submissions, one short sentence each, no labels),
 "similar_to": [{"peer": string (a label like "P3"), "why": string (short)}] (only if a solution is unusually close; else [])}
Simple everyday English, short sentences, no markdown.`;

  // =============================================================================
  // Compares one student's review with the rest of the class: where the work stands,
  // what it does better, and what others did better.
  // =============================================================================
  async function compareWithClass(assignment, mine, peers) {
    // One review as a short line of text for the AI.
    const line = (x) =>
      `score ${x.total}/${x.max}. approach: ${x.approach || "?"}. strengths: ${(x.strengths || []).join("; ")}. weaknesses: ${(x.improvements || []).join("; ")}`;
    return generate(
      [
        {
          text: `You compare ONE student's homework with the rest of the class for "${assignment.title}".
Use only the anonymous reviews below. Be specific and kind; never invent facts. Write in English.
THIS STUDENT: ${line(mine)}
CLASSMATES:
${peers.map((p) => `${p.label}: ${line(p)}`).join("\n")}
${COMPARE_SHAPE}`,
        },
      ],
      { think: 512 },
    );
  }

  // =============================================================================
  // Reads all the reviews of an assignment and tells the lecturer the common mistakes,
  // what went well, and what to teach again.
  // =============================================================================
  async function classInsights(assignment, reviews) {
    const text = reviews
      .map(
        (r, i) =>
          `#${i + 1} score ${r.total}/${r.max}\nImprovements: ${(r.improvements || []).join("; ")}\nStrengths: ${(r.strengths || []).join("; ")}`,
      )
      .join("\n\n");
    return generate([
      {
        text: `These are anonymous AI reviews of ${reviews.length} submissions for "${assignment.title}".
Find patterns for the lecturer. Return JSON only:
{"common_mistakes": [{"issue": string, "how_many": string (e.g. "about half")}], "what_went_well": [string], "teaching_tips": [string]}

${text}`,
      },
    ]);
  }

  // =============================================================================
  // A fingerprint of a piece of code: a sample of short hashes of every run of 8 code
  // words, ignoring comments and spacing. This is the method universities use to find
  // copied code. Two pieces of work that share many hashes share code.
  // =============================================================================
  function fingerprint(text) {
    const toks =
      String(text || "")
        .toLowerCase()
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|(^|\s)#[^\n]*/g, " ")
        .match(/[a-z_][a-z0-9_]*|\d+|[^\s\w]/g) || [];
    const out = new Set();
    for (let i = 0; i + 8 <= toks.length && out.size < 3000; i++) {
      let h = 2166136261;
      for (let j = i; j < i + 8; j++) {
        const t = toks[j];
        for (let k = 0; k < t.length; k++) {
          h ^= t.charCodeAt(k);
          h = Math.imul(h, 16777619);
        }
        h ^= 32;
        h = Math.imul(h, 16777619);
      }
      h >>>= 0;
      if (h % 6 === 0) out.add(h);
    }
    return [...out];
  }

  // =============================================================================
  // Finds pairs of students whose work shares a lot of code. Code that comes from the
  // assignment itself (base) does not count. Each pair gets a score: the share of the
  // smaller one's own code that also appears in the other.
  // =============================================================================
  function similarWork(items, base = []) {
    const n = items.length,
      seen = new Map();
    items.forEach((x) =>
      new Set(x.fp).forEach((h) => seen.set(h, (seen.get(h) || 0) + 1)),
    );
    const common = new Set(base);
    seen.forEach((c, h) => {
      if (c > Math.max(2, n * 0.4)) common.add(h);
    });
    const own = items.map((x) => ({
      key: x.key,
      set: new Set(x.fp.filter((h) => !common.has(h))),
    }));
    const pairs = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const A = own[i].set,
          B = own[j].set,
          small = Math.min(A.size, B.size);
        if (small < 40) continue;
        let both = 0;
        for (const h of A.size < B.size ? A : B)
          if ((A.size < B.size ? B : A).has(h)) both++;
        const score = both / small;
        if (score >= 0.3)
          pairs.push({
            a: own[i].key,
            b: own[j].key,
            score: Math.round(score * 100) / 100,
          });
      }
    return pairs.sort((x, y) => y.score - x.score);
  }

  // =============================================================================
  // The text of a student's repository, for fingerprints and for comparing a pair.
  // =============================================================================
  async function repoText(link, onStep) {
    return link && parseRepo(link)
      ? (await fetchRepo(link, onStep, 70000))?.text || ""
      : "";
  }

  // =============================================================================
  // Asks the AI to look at two suspiciously similar pieces of work side by side and say
  // whether they are really copied.
  // =============================================================================
  async function judgePair(assignment, A, B) {
    return generate(
      [
        {
          text: `Two students handed in work for "${assignment.title}". A plagiarism check found that they share a lot of code.
Decide if one was likely copied from the other (or written together), or if they only look alike because the assignment forces it.
Ignore anything that comes from the assignment itself (given starter code, required names, required output formats).
${assignment.briefText ? "THE ASSIGNMENT:\n" + assignment.briefText.slice(0, 6000) + "\n" : ""}
WORK A:\n${String(A).slice(0, 25000)}
WORK B:\n${String(B).slice(0, 25000)}
Return JSON only: {"verdict": "copied" | "similar" | "independent", "why": string (1-2 short sentences naming the shared parts, plain words)}`,
        },
      ],
      { think: 512 },
    );
  }

  // =============================================================================
  // How similar each pair of texts is, by the words they share (TF-IDF and cosine
  // similarity). No AI involved.
  // =============================================================================
  function similarity(docs) {
    // The words of a text, longer than 2 letters.
    const tok = (s) =>
      String(s)
        .toLowerCase()
        .split(/[^\p{L}\p{N}_]+/u)
        .filter((w) => w.length > 2);
    const tfs = docs.map((d) => {
      const m = new Map();
      tok(d).forEach((w) => m.set(w, (m.get(w) || 0) + 1));
      return m;
    });
    const df = new Map();
    tfs.forEach((m) => m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const vecs = tfs.map((m) => {
      const v = new Map();
      m.forEach((c, w) => v.set(w, c * Math.log(1 + docs.length / df.get(w))));
      return v;
    });
    // The length of a word-weight vector.
    const norm = (v) =>
      Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;
    // The cosine similarity of two word-weight vectors (1 = the same words, 0 = nothing in common).
    const cos = (a, b) => {
      let s = 0;
      a.forEach((x, w) => {
        if (b.has(w)) s += x * b.get(w);
      });
      return s / (norm(a) * norm(b));
    };
    return vecs.map((a, i) => vecs.map((b, j) => (i === j ? 1 : cos(a, b))));
  }

  return {
    settings,
    saveSettings,
    setNotifier,
    ready,
    listModels,
    summarizeTranscript,
    summarizeMedia,
    summarizeLink,
    reviewSubmission,
    classInsights,
    similarity,
    friendly,
    compareWithClass,
    parseRepo,
    fingerprint,
    similarWork,
    repoText,
    judgePair,
  };
})();
