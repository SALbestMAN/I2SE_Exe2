// =============================================================================
// End-to-end smoke tests in headless Chromium against the site's real pages (data layer = test sample data).
// =============================================================================
const test = require("node:test"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });
async function open(url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (opts.lang) await ctx.addInitScript((l) => localStorage.setItem("cp.lang", l), opts.lang);
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdn\.sheetjs/, (r) => r.abort());
  const p = await ctx.newPage(); const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + url); await p.waitForTimeout(opts.wait ?? 1500);
  return { p, ctx, errors };
}
const PAGES = ["/index.html", "/student/home.html", "/student/course.html?course=ABC123", "/student/attendance.html", "/student/questions.html",
  "/student/homework.html?course=ABC123&a=a1", "/lecturer/courses.html", "/lecturer/course.html?course=ABC123", "/lecturer/attendance.html?course=ABC123",
  "/lecturer/live.html?course=ABC123&session=s4", "/lecturer/roster.html?course=ABC123", "/lecturer/questions.html?course=ABC123",
  "/lecturer/summaries.html?course=ABC123", "/lecturer/homework.html?course=ABC123", "/lecturer/inbox.html", "/lecturer/requests.html"];

test("TC-56 all 16 main pages load with no script errors", async () => {
  const bad = [];
  for (const u of PAGES) { const { ctx, errors } = await open(u); if (errors.length) bad.push(u + ": " + errors[0]); await ctx.close(); }
  assert.deepEqual(bad, []);
});

test("TC-57 the projector code animates (canvas changes several times a second)", async () => {
  const { p, ctx } = await open("/lecturer/live.html?course=ABC123&session=s4", { wait: 2500 });
  await p.click('[data-view="checkin"]').catch(() => {});
  const hash = () => p.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0]; return c ? c.toDataURL().length + ":" + c.toDataURL().slice(-60) : ""; });
  const seen = new Set(); for (let i = 0; i < 10; i++) { seen.add(await hash()); await p.waitForTimeout(100); }
  await ctx.close();
  assert.ok(seen.size >= 4, `only ${seen.size} different frames in 1 s`);
});

test("TC-58 a student votes in the live poll and sees the result", async () => {
  const { p, ctx } = await open("/student/course.html?course=ABC123", { phone: true });
  await p.locator("#poll-card button").nth(1).click(); await p.waitForTimeout(800);
  const txt = await p.locator("#poll-card").innerText();
  await ctx.close();
  assert.match(txt, /Answer saved/);
});

test("TC-59 a student sends an anonymous question and the box clears", async () => {
  const { p, ctx, errors } = await open("/student/course.html?course=ABC123", { phone: true });
  await p.fill("#q", "Can we see one more composition example?"); await p.click("#send-btn"); await p.waitForTimeout(900);
  const left = await p.inputValue("#q");
  await ctx.close();
  assert.equal(left, ""); assert.deepEqual(errors, []);
});

test("TC-60 Hebrew and Arabic switch the page to right-to-left and translate it", async () => {
  for (const [lang, word] of [["he", "מי מתחבר?"], ["ar", "يسجّل الدخول؟"]]) {
    const { p, ctx } = await open("/index.html", { lang });
    const dir = await p.evaluate(() => document.documentElement.dir), body = await p.locator("body").innerText();
    await ctx.close();
    assert.equal(dir, "rtl", lang); assert.ok(body.includes(word), `${lang}: "${word}" not on the page`);
  }
});

test("TC-61 student pages fit a 390 px phone (no sideways scroll)", async () => {
  const wide = [];
  for (const u of PAGES.filter((x) => x.startsWith("/student"))) {
    const { p, ctx } = await open(u, { phone: true });
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) wide.push(`${u}: ${w}px`); await ctx.close();
  }
  assert.deepEqual(wide, []);
});

test("TC-62 the projector QR decodes to a signed CP1 frame", async () => {
  const { p, ctx } = await open("/lecturer/live.html?course=ABC123&session=s4", { wait: 2500 });
  const shot = await p.evaluate(() => [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0].toDataURL("image/png"));
  await ctx.close();
  const fs = require("fs"), { execFileSync } = require("child_process");
  fs.writeFileSync("" + require("os").tmpdir() + "/qr.png", Buffer.from(shot.split(",")[1], "base64"));
  const out = execFileSync("python3", ["-c", "import cv2;d=cv2.QRCodeDetector();print(d.detectAndDecode(cv2.imread('" + require("os").tmpdir() + "/qr.png'))[0])"]).toString().trim();
  assert.match(out, /^CP1\|[^|]+\|[12]\|\d+\|\d+\|[0-9a-f]+$/, out);
});
