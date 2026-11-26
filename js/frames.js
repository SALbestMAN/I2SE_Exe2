// =============================================================================
// The animated attendance code. On the projector it draws each signed frame as a QR
// code inside a turning ring, 5 times a second. On the phone it reads the frames with
// the camera. On a single computer the frames also travel between open windows, so the
// check-in can be tried without a camera.
// =============================================================================
const FRAMES = (() => {
  // =============================================================================
  // A channel between windows of this browser, used to pass frames from the projector
  // window to a scan window on the same computer.
  // =============================================================================
  const channel =
    "BroadcastChannel" in window
      ? new BroadcastChannel("lectureapp-frames")
      : null;

  // =============================================================================
  // Draws a rectangle with rounded corners on a canvas.
  // =============================================================================
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // =============================================================================
  // Draws one frame: a light card with the QR code in the middle and a ring around it
  // that turns a little with every frame. During the second check the ring changes
  // colour so the room can see it.
  // =============================================================================
  function draw(canvas, raw, accent = "#FFE45C") {
    const ctx = canvas.getContext("2d");
    const size = 600,
      c = size / 2;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.clearRect(0, 0, size, size);
    const f = API.parseFrame(raw);
    if (!f) return;
    const color = f.round === 2 ? "#A3B1FF" : accent;

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(f.n * 0.15);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.setLineDash([140, 30, 50, 30, 200, 30, 70, 30]);
    ctx.beginPath();
    ctx.arc(0, 0, 280, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    const card = 440,
      x0 = c - card / 2;
    ctx.fillStyle = "#F3F0E8";
    roundRect(ctx, x0, x0, card, card, 28);
    ctx.fill();
    if (typeof qrcode === "function") {
      const qr = qrcode(0, "M");
      qr.addData(raw);
      qr.make();
      const n = qr.getModuleCount(),
        quiet = 2,
        cell = Math.floor((card - 24) / (n + quiet * 2));
      const off = c - (cell * n) / 2;
      ctx.fillStyle = "#0E0E0E";
      for (let r = 0; r < n; r++)
        for (let k = 0; k < n; k++)
          if (qr.isDark(r, k))
            ctx.fillRect(off + k * cell, off + r * cell, cell, cell);
    } else {
      ctx.fillStyle = "#0E1116";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR library didn't load", c, c);
    }
  }

  // =============================================================================
  // Sends a frame to the other windows of this browser.
  // =============================================================================
  function broadcast(raw) {
    channel?.postMessage(raw);
  }

  // =============================================================================
  // Calls cb for every frame another window sends. Returns a function that stops
  // listening.
  // =============================================================================
  function listen(cb) {
    if (!channel) return () => {};
    // Passes the frame inside the message on to the caller.
    const h = (e) => cb(e.data);
    channel.addEventListener("message", h);
    return () => channel.removeEventListener("message", h);
  }

  // =============================================================================
  // Starts the back camera and reads QR codes from it about 15 times a second. Calls
  // onFrame each time a new code is read. Returns a function that turns the camera off.
  // =============================================================================
  async function startCamera(video, onFrame) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("This browser can't use the camera (it needs https).");
    if (typeof jsQR !== "function")
      throw new Error("The QR reader didn't load (are you online?)");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    await video.play();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let running = true,
      last = "";
    // Takes one picture from the video, looks for a QR code in it, and schedules the next look.
    const tick = () => {
      if (!running) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 720 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data && code.data !== last) {
          last = code.data;
          onFrame(code.data);
        }
      }
      setTimeout(tick, 60);
    };
    tick();
    return () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  return { draw, broadcast, listen, startCamera };
})();
