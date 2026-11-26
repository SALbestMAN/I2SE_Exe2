// =============================================================================
// Supabase Edge Function "fetch-recording". It turns a lecture recording link (Zoom or
// Google Drive) into something Gemini can summarize. A browser cannot do this itself,
// because Zoom and Drive do not let other websites read their files.
//
// Two actions:
// - inspect: opens the link. If Zoom made a transcript, it returns the text. Otherwise
// it opens an upload at Gemini and returns what is needed to copy the video.
// - chunk: copies the next piece of the video into that upload. Copying in pieces
// keeps every call short, so even a 2-hour lecture fits in the server's time limit.
//
// To deploy: Supabase, Edge Functions, Deploy a new function, Via Editor. Name it
// exactly fetch-recording, paste this file and deploy. Then in its Settings turn
// "Verify JWT" off: this file checks the sign-in itself.
// =============================================================================

// =============================================================================
// Lets the app's pages (on another website) call this function.
// =============================================================================
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =============================================================================
// An answer in JSON.
// =============================================================================
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// =============================================================================
// How we introduce ourselves to Zoom (as a normal browser), how much is copied per
// call (32 MB), and Gemini's address.
// =============================================================================
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const CHUNK = 32 * 1024 * 1024;
const GEMINI = "https://generativelanguage.googleapis.com";

// =============================================================================
// Only Zoom and Google addresses may be opened, and only Gemini may receive uploads,
// so this function can never be used to reach other websites.
// =============================================================================
const SOURCE_OK =
  /^https:\/\/([a-z0-9-]+\.)*(zoom\.us|zoom\.com|zoomgov\.com|googleusercontent\.com|google\.com)\//i;
const UPLOAD_OK = /^https:\/\/generativelanguage\.googleapis\.com\//i;

// =============================================================================
// The entry point. Only people signed in to the app may use it. "chunk" copies the
// next piece; anything else inspects the link.
// =============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!(await signedIn(req)))
      return json({ ok: false, error: "Sign in again, then try once more." });
    const body = await req.json();
    if (body.action === "chunk")
      return json({ ok: true, ...(await copyChunk(body)) });
    const url = String(body.url || "").trim(),
      key = String(body.key || "");
    if (!url) throw new Error("Paste a link first.");
    if (!key) throw new Error("Add your Gemini key in AI settings first.");
    return json({ ok: true, ...(await inspect(url, key)) });
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// =============================================================================
// A recording found behind a link: where to download it from, the headers it needs,
// its title and length.
// =============================================================================
type Source = {
  src: string;
  headers: Record<string, string>;
  title?: string;
  durationSec?: number;
};

// =============================================================================
// Looks behind a link. Zoom: returns the transcript if there is one, otherwise opens
// an upload for the video. Google Drive: opens an upload for the file.
// =============================================================================
async function inspect(url: string, key: string) {
  url = zoomShareURL(url);
  if (/zoom\.(us|com)\/rec\/(share|play)\//i.test(url)) {
    const z = await fromZoom(url);
    if (z.transcript)
      return {
        kind: "transcript",
        text: z.transcript,
        title: z.title,
        durationSec: z.durationSec,
      };
    return openUpload(z.video, key);
  }
  const drive = url.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([\w-]{20,})/,
  );
  if (drive)
    return openUpload(
      {
        src: `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`,
        headers: {},
      },
      key,
    );
  if (!SOURCE_OK.test(url))
    throw new Error(
      "Use a Zoom, Google Drive or YouTube link, or upload the file.",
    );
  return openUpload({ src: url, headers: {} }, key);
}

// =============================================================================
// The address shown while a Zoom recording plays only works with the cookies Zoom gave
// the person's own browser. It carries the real share link inside it, which is what we
// need.
// =============================================================================
function zoomShareURL(url: string) {
  try {
    const u = new URL(url);
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
  } catch (_) {
    return url;
  }
}

// =============================================================================
// Opens a Zoom recording the way a browser would: loads the player page (keeping
// cookies, entering the passcode if the link includes one), finds the recording's data
// address, and from it the video and, when Zoom made one, the transcript.
// =============================================================================
async function fromZoom(shareUrl: string) {
  const jar = new Map<string, string>();
  // Keeps the cookies Zoom sends.
  const keep = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const kv = c.split(";")[0],
        i = kv.indexOf("=");
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
  };
  // The cookies to send back to Zoom.
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const origin = new URL(shareUrl).origin;
  // Downloads an address with our cookies and returns the text.
  const get = async (
    u: string,
    accept = "application/json, text/plain, */*",
  ) => {
    const res = await fetch(u, {
      headers: {
        "User-Agent": UA,
        Accept: accept,
        Referer: origin + "/",
        Cookie: cookie(),
      },
    });
    keep(res);
    return res;
  };

  // Opens the player page, following redirects by hand so the cookies are kept on the way.
  const openPage = async (start: string, init: RequestInit = {}) => {
    let u = start,
      text = "";
    for (let i = 0; i < 8; i++) {
      const res = await fetch(u, {
        redirect: "manual",
        ...init,
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          Referer: origin + "/",
          Cookie: cookie(),
          ...(init.headers || {}),
        },
      });
      keep(res);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        u = new URL(loc, u).href;
        init = {};
        continue;
      }
      text = await res.text();
      if (res.status === 403 || res.status === 429) throw blocked();
      break;
    }
    if (/signin|sso|login/i.test(new URL(u).pathname))
      throw new Error(
        "This Zoom recording is only for signed-in users. In Zoom → Recordings → Share, allow viewing without signing in (or download it and upload the file).",
      );
    return { url: u, html: text };
  };
  const { url, html } = await openPage(shareUrl);
  const apiDomain = unescape(pick(html, /apiDomain\s*:\s*"([^"]+)"/)) || origin;
  const playInfoApi = unescape(pick(html, /playInfoApi\s*:\s*"([^"]+)"/));
  if (!playInfoApi) {
    if (
      /Just a moment|cf-chl|challenge-form/i.test(html) &&
      !/__zm_unified_player__/.test(html)
    )
      throw blocked();
    const other = await viaPageData(shareUrl, url, html);
    if (other) return other;
    const title = pick(html, /<title[^>]*>([^<]*)</i).trim();
    throw new Error(
      `Couldn't read that Zoom page (it went to ${new URL(url).pathname.split("/").slice(0, 3).join("/")}${title ? `, titled "${title.slice(0, 60)}"` : ""}, ${html.length} characters). Download the recording, or Zoom's transcript (.vtt), and upload it instead.`,
    );
  }

  // Reads the recording's details from the data the player page asks for.
  async function viaPageData(link: string, pageUrl: string, page: string) {
    const pwd = new URL(link).searchParams.get("pwd") || "";
    // The value of a form field in Zoom's page.
    const field = (h: string, name: string) =>
      pick(h, new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)`, "i")) ||
      pick(
        h,
        new RegExp(`value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"),
      );
    // When Zoom asks for the passcode and the link carries it (pwd=), fills it in and continues.
    const unlock = async (h: string, u: string, kind: "share" | "play") => {
      if (!/password_form|id=["']passcode|name=["']passwd/i.test(h))
        return { url: u, html: h };
      if (!pwd) throw needsPasscode();
      const id =
        kind === "share"
          ? field(h, "meetingId") || pick(h, /meetingId\s*:\s*["']([^"']+)/)
          : field(h, "id") || pick(h, /fileId\s*:\s*["']([^"']+)/);
      const path =
        kind === "share"
          ? "/nws/recording/1.0/validate-meeting-passwd"
          : "/rec/play/validate-meeting-passwd";
      const res = await fetch(origin + path, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Referer: u,
          Cookie: cookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id,
          passwd: pwd,
          action: field(h, "action") || "viewdetailpage",
          recaptcha: "",
        }),
      });
      keep(res);
      const j = await res.json().catch(() => null);
      if (j && j.status === false) throw needsPasscode();
      return await openPage(u);
    };

    let cur = await unlock(
      page,
      pageUrl,
      /\/rec\/share\//i.test(pageUrl) ? "share" : "play",
    );
    if (/\/rec\/share\//i.test(cur.url)) {
      const meetingId = unescape(
        pick(cur.html, /meetingId\s*:\s*["']([^"']+)/),
      );
      if (!meetingId) return null;
      const info = await (
        await get(
          `${origin}/nws/recording/1.0/play/share-info/${encodeURIComponent(meetingId)}`,
        )
      )
        .json()
        .catch(() => null);
      const next = info?.result?.redirectUrl;
      if (!next) {
        if (/passcode|password/i.test(String(info?.errorMessage || "")))
          throw needsPasscode();
        throw new Error(
          "Zoom didn't give the recording" +
            (info?.errorMessage ? `: ${info.errorMessage}` : "."),
        );
      }
      const play = await openPage(new URL(next, origin).href);
      cur = await unlock(play.html, play.url, "play");
    }
    const fileId = unescape(pick(cur.html, /fileId\s*:\s*["']([^"']+)/));
    if (!fileId) return null;
    const res = await get(
      `${origin}/nws/recording/1.0/play/info/${encodeURIComponent(fileId)}?continueMode=true`,
    );
    const j = await res.json().catch(() => null);
    const d = j?.result;
    if (!d) {
      if (/passcode|password/i.test(String(j?.errorMessage || "")))
        throw needsPasscode();
      throw new Error(
        "Zoom didn't give the recording" +
          (j?.errorMessage ? `: ${j.errorMessage}` : "."),
      );
    }
    const title = String(d.meet?.topic || d.topic || "Zoom recording");
    const durationSec = Number(d.duration) || undefined;
    let transcript = "";
    for (const t of [d.transcriptUrl, d.ccUrl]) {
      if (!t || transcript) continue;
      try {
        const r = await get(new URL(t, origin).href);
        if (r.ok) transcript = toText(await r.text());
      } catch (_) {}
      if (transcript.length < 300) transcript = "";
    }
    const src = d.viewMp4Url || d.shareMp4Url || "";
    if (!transcript && !src)
      throw new Error(
        "Zoom didn't give a video or a transcript for this link.",
      );
    return {
      transcript,
      title,
      durationSec,
      video: {
        src,
        headers: { Referer: origin + "/" },
        title,
        durationSec,
      } as Source,
    };
  }

  const infoRes = await get(new URL(playInfoApi, apiDomain).href);
  const info = await infoRes.json().catch(() => null);
  if (!info?.status) {
    const msg = String(info?.errorMessage || "");
    if (/passcode|password/i.test(msg)) throw needsPasscode();
    throw new Error(
      "Zoom didn't give the recording" + (msg ? `: ${msg}` : "."),
    );
  }
  const media = info.result?.mediaInfo || {};
  const title = media.mediaTopic || "Zoom recording";
  const durationSec = Number(media.mediaDuration) || undefined;
  const playUrl =
    media.playUrl || media.multipleSourceInfo?.speakerWithShare?.playUrl || "";

  const base = playInfoApi.replace(/[?#].*$/, "");
  const shareRoot = base.replace(/[^/]+$/, "");
  const ids = new Set<string>([base.split("/").pop() || ""]);
  const featureApi = unescape(pick(html, /featureConfigApi\s*:\s*"([^"]+)"/));
  const texts = [html, JSON.stringify(info)];
  if (featureApi) {
    try {
      texts.push(await (await get(new URL(featureApi, apiDomain).href)).text());
    } catch (_) {}
  }
  for (const t of texts)
    for (const m of t.matchAll(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ))
      ids.add(m[0]);
  for (const t of texts)
    for (const m of t.matchAll(
      /(\\?\/nws\/recording\/[^"'\s]*transcript[^"'\s]*)/gi,
    ))
      ids.add("path:" + unescape(m[1]));
  let transcript = "";
  for (const id of [...ids].filter(Boolean).slice(0, 10)) {
    const path = id.startsWith("path:")
      ? id.slice(5)
      : `${shareRoot}${id}/transcript?pageType=web`;
    try {
      const res = await get(new URL(path, apiDomain).href);
      if (!res.ok) continue;
      const body = await res.text();
      transcript = toText(body);
      if (transcript.length > 300) break;
      transcript = "";
    } catch (_) {}
  }

  if (!transcript && !playUrl)
    throw new Error("Zoom didn't give a video or a transcript for this link.");
  const video: Source = {
    src: playUrl,
    headers: { Referer: origin + "/" },
    title,
    durationSec,
  };
  return { transcript, title, durationSec, video };
}

// =============================================================================
// Turns Zoom's transcript (JSON with timed lines, or WebVTT subtitles) into plain
// lines of text with their times.
// =============================================================================
function toText(body: string): string {
  if (/^\s*WEBVTT/.test(body)) {
    return body
      .split(/\r?\n/)
      .filter(
        (l) => l && !/^\d+$/.test(l) && !/-->/.test(l) && !/^WEBVTT/.test(l),
      )
      .join("\n");
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (_) {
    return "";
  }
  const rows: { t: unknown; who: string; text: string }[] = [];
  const TEXT = [
    "text",
    "content",
    "displayContent",
    "sentence",
    "transcript",
    "txt",
  ];
  const TIME = ["ts", "time", "startTime", "start", "timestamp", "startTs"];
  // Goes through the transcript data and collects every spoken line.
  const walk = (o: unknown) => {
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    const k = TEXT.find(
      (n) => typeof r[n] === "string" && (r[n] as string).trim(),
    );
    if (k) {
      const t = TIME.map((n) => r[n]).find(
        (v) => v !== undefined && v !== null && v !== "",
      );
      const who =
        typeof r.username === "string"
          ? r.username
          : typeof r.speaker === "string"
            ? r.speaker
            : "";
      rows.push({ t, who, text: String(r[k]).trim() });
      return;
    }
    Object.values(r).forEach(walk);
  };
  walk(data);
  const ms = rows.some((x) => typeof x.t === "number" && x.t > 20000);
  const lines = rows.map(
    (x) =>
      `${x.t !== undefined ? `[${clock(x.t, ms)}] ` : ""}${x.who ? x.who + ": " : ""}${x.text}`,
  );
  if (!lines.length && typeof data === "object") {
    const vtt = JSON.stringify(data).match(/WEBVTT[^"]*/);
    if (vtt) return toText(JSON.parse(`"${vtt[0]}"`));
  }
  return lines.join("\n");
}

// =============================================================================
// A time as hh:mm:ss.
// =============================================================================
function clock(v: unknown, ms = false): string {
  if (typeof v === "string" && /\d+:\d+/.test(v))
    return v.replace(/\.\d+$/, "");
  let s = Number(v);
  if (!isFinite(s)) return String(v);
  if (ms) s = s / 1000;
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = Math.floor(s % 60);
  return [h, m, x].map((n) => String(n).padStart(2, "0")).join(":");
}

// =============================================================================
// Opens a resumable upload at Gemini, sized to the recording.
// =============================================================================
async function openUpload(s: Source, key: string) {
  if (!SOURCE_OK.test(s.src))
    throw new Error("That link doesn't lead to a recording this app can open.");
  const probe = await fetch(s.src, {
    headers: { "User-Agent": UA, Range: "bytes=0-0", ...s.headers },
  });
  const type = (probe.headers.get("content-type") || "").split(";")[0].trim();
  await probe.body?.cancel();
  if (!probe.ok)
    throw new Error(
      `The recording didn't open (HTTP ${probe.status}). Check that anyone with the link can watch it.`,
    );
  if (type.startsWith("text/") || type.includes("json")) {
    throw new Error(
      /drive/.test(s.src)
        ? 'Google Drive didn\'t give the file. In Drive: Share → General access → "Anyone with the link".'
        : "That link doesn't lead to an audio or video file.",
    );
  }
  const size =
    Number((probe.headers.get("content-range") || "").split("/")[1]) ||
    Number(probe.headers.get("content-length")) ||
    0;
  if (!size)
    throw new Error(
      "The file size is unknown, so it can't be copied. Download the recording and upload it instead.",
    );
  if (size > 2e9)
    throw new Error(
      "This recording is bigger than 2 GB, Gemini's limit. Download the audio only and upload that.",
    );

  const start = await fetch(`${GEMINI}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": type || "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: (s.title || "lecture recording").slice(0, 100) },
    }),
  });
  if (!start.ok)
    throw new Error(
      "Gemini refused the upload: " + (await start.text()).slice(0, 200),
    );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini didn't return an upload address.");
  const gran =
    Number(start.headers.get("x-goog-upload-chunk-granularity")) ||
    8 * 1024 * 1024;
  const chunk = Math.max(gran, Math.floor(CHUNK / gran) * gran);
  return {
    kind: "upload",
    uploadUrl,
    src: s.src,
    referer: s.headers.Referer || "",
    size,
    chunk,
    mimeType: type || "video/mp4",
    title: s.title,
    durationSec: s.durationSec,
  };
}

// =============================================================================
// Copies one piece of the recording into the Gemini upload. On the last piece it
// returns the finished file.
// =============================================================================
async function copyChunk(b: {
  src: string;
  referer?: string;
  uploadUrl: string;
  offset: number;
  size: number;
  chunk: number;
}) {
  if (!SOURCE_OK.test(String(b.src)) || !UPLOAD_OK.test(String(b.uploadUrl)))
    throw new Error("Not allowed.");
  const offset = Number(b.offset) || 0,
    size = Number(b.size),
    chunk = Number(b.chunk) || CHUNK;
  const end = Math.min(size, offset + chunk) - 1,
    last = end + 1 >= size;
  const res = await fetch(b.src, {
    headers: {
      "User-Agent": UA,
      Range: `bytes=${offset}-${end}`,
      ...(b.referer ? { Referer: b.referer } : {}),
    },
  });
  if (res.status !== 206 && !(res.status === 200 && offset === 0 && last)) {
    await res.body?.cancel();
    throw new Error(
      `The recording stopped sending (HTTP ${res.status}). Try again; if it keeps failing, download it and upload the file.`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== end - offset + 1)
    throw new Error(
      "The recording sent a different amount than asked. Try again.",
    );
  const up = await fetch(b.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": String(offset),
      "X-Goog-Upload-Command": last ? "upload, finalize" : "upload",
    },
    body: bytes,
  });
  if (!up.ok)
    throw new Error(
      "Copying to Gemini failed: " + (await up.text()).slice(0, 200),
    );
  if (!last) {
    await up.body?.cancel();
    return { offset: end + 1, done: false };
  }
  const j = await up.json().catch(() => ({}));
  if (!j.file)
    throw new Error(
      "Gemini didn't confirm the file: " + JSON.stringify(j).slice(0, 200),
    );
  return {
    offset: size,
    done: true,
    file: {
      name: j.file.name,
      uri: j.file.uri,
      mimeType: j.file.mimeType,
      state: j.file.state,
    },
  };
}

// =============================================================================
// True when the request comes from someone signed in to this app (Supabase checks the
// token).
// =============================================================================
async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const apikey =
    req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!auth.startsWith("Bearer ") || !base) return false;
  const res = await fetch(`${base}/auth/v1/user`, {
    headers: { Authorization: auth, apikey },
  });
  if (!res.ok) {
    await res.body?.cancel();
    return false;
  }
  const u = await res.json().catch(() => null);
  return !!u?.id;
}

// =============================================================================
// The first group a regular expression finds, or an empty string.
// =============================================================================
function pick(s: string, re: RegExp): string {
  return s.match(re)?.[1] || "";
}

// =============================================================================
// Undoes the escaping inside addresses found in Zoom's page.
// =============================================================================
function unescape(s: string): string {
  return s
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&");
}

// =============================================================================
// The error for a Zoom recording that needs a passcode the link does not include.
// =============================================================================
function needsPasscode() {
  return new Error(
    "This Zoom recording needs a passcode. In Zoom → Recordings → Share, turn the passcode off (or download it and upload the file).",
  );
}

// =============================================================================
// The error when Zoom refuses the server's request, with what the lecturer can do
// instead.
// =============================================================================
function blocked() {
  return new Error(
    "Zoom refused the server's request. Download the recording and upload it, or copy Zoom's transcript (Transcript tab on the recording page) into \"Transcript (text)\".",
  );
}
