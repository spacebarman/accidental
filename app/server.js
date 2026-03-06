const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8787);

const appRoot = __dirname;
const publicRoot = path.join(appRoot, "public");
const docsRoot = path.join(appRoot, "..", "docs");

const ALBUM_SIZE = 16;

const albumTracks = Array.from({ length: ALBUM_SIZE }, (_, i) => {
  const number = String(i + 1).padStart(2, "0");
  return {
    index: i,
    title: `Song ${number}`,
    audio: `/mp3/Spacebarman-Accidental-Song${number}.mp3`,
    thumbnail: `/images/thumbnails/Spacebarman-Accidental-thumb${number}.jpg`,
    cover: `/images/coverarts/Spacebarman-Accidental-coverart${number}.jpg`
  };
});

const state = {
  sessionId: 0,
  queue: shuffle(indexes()),
  queuePos: 0,
  activeIndex: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  lastScanEventId: null
};

const clients = {
  grid: new Set(),
  cover: new Set(),
  unknown: new Set()
};

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg"
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/") {
    sendExternalLinkPage(res, {
      title: "Accidental",
      heading: "Accidental",
      message: "Open the public album page:",
      href: "https://www.spacebarman.com/accidental",
      linkText: "www.spacebarman.com/accidental"
    });
    return;
  }

  if (pathname === "/grid") {
    if (requestUrl.searchParams.get("qr") !== "true") {
      sendExternalLinkPage(res, {
        title: "Grid Access",
        heading: "Grid Access",
        message: "This page is intended to be opened from the installation QR code. For the public album page, use:",
        href: "https://www.spacebarman.com/accidental",
        linkText: "www.spacebarman.com/accidental"
      });
      return;
    }

    serveFile(path.join(publicRoot, "grid.html"), res);
    return;
  }

  if (pathname === "/cover") {
    serveFile(path.join(publicRoot, "cover.html"), res);
    return;
  }

  if (pathname === "/api/album") {
    sendJson(res, { tracks: albumTracks });
    return;
  }

  if (pathname === "/api/state") {
    sendJson(res, buildStatePayload());
    return;
  }

  if (pathname === "/health") {
    sendJson(res, { ok: true });
    return;
  }

  if (
    pathname.startsWith("/images/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/mp3/")
  ) {
    serveSafeRelativeFile(docsRoot, pathname.slice(1), res);
    return;
  }

  if (pathname.startsWith("/public/")) {
    serveSafeRelativeFile(publicRoot, pathname.slice("/public/".length), res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  socket.role = "unknown";
  clients.unknown.add(socket);

  send(socket, {
    type: "hello",
    message: "Connected to Accidental player server"
  });

  send(socket, {
    type: "album_manifest",
    tracks: albumTracks
  });

  send(socket, {
    type: "state_update",
    ...buildStatePayload()
  });

  socket.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Invalid JSON message" });
      return;
    }

    handleMessage(socket, message);
  });

  socket.on("close", () => {
    removeClient(socket);
  });

  socket.on("error", () => {
    removeClient(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Accidental app listening on http://localhost:${PORT}`);
  console.log(`Grid app:  http://localhost:${PORT}/grid?qr=true`);
  console.log(`Cover app: http://localhost:${PORT}/cover`);
});

function sendExternalLinkPage(res, { title, heading, message, href, linkText }) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${escapeHtml(title)}</title>
    <style>
      @font-face {
        font-family: "BarlowCondensed";
        src: url("/fonts/BarlowCondensed-Medium.ttf") format("truetype");
      }

      @font-face {
        font-family: "Rubik";
        src: url("/fonts/Rubik-VariableFont_wght.ttf") format("truetype");
        font-weight: 100 900;
      }

      html, body {
        margin: 0;
        width: 100%;
        min-height: 100%;
        background: #0b0b0b;
        color: #d8d8d8;
        font-family: "Rubik", sans-serif;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      main {
        max-width: 760px;
        border: 1px solid #2e2e2e;
        background: #131313;
        padding: 24px;
      }

      h1 {
        margin: 0 0 12px 0;
        font-size: 28px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        font-family: "BarlowCondensed", sans-serif;
      }

      p {
        margin: 0 0 12px 0;
        line-height: 1.5;
      }

      a {
        color: #efefef;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      <p><a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(linkText)}</a></p>
    </main>
  </body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function handleMessage(socket, message) {
  const { type } = message || {};

  if (type === "hello") {
    setRole(socket, message.role);
    send(socket, {
      type: "state_update",
      ...buildStatePayload()
    });
    return;
  }

  if (type === "grid_opened") {
    if (socket.role !== "grid") {
      return;
    }

    handleGridOpened(message.scanEventId || null);
    return;
  }

  if (type === "select_track") {
    if (socket.role !== "grid") {
      return;
    }

    const index = Number(message.index);
    if (!Number.isInteger(index) || index < 0 || index >= ALBUM_SIZE) {
      return;
    }

    queueFromSelection(index);
    broadcastState();
    broadcastToRole("cover", {
      type: "play_track",
      index,
      startTime: 0,
      sessionId: state.sessionId
    });
    return;
  }

  if (type === "cover_status") {
    if (socket.role !== "cover") {
      return;
    }

    applyCoverStatus(message);
    broadcastStateToGrids();
    return;
  }

  if (type === "track_ended") {
    if (socket.role !== "cover") {
      return;
    }

    playNextFromQueue();
    return;
  }

  if (type === "sync_request") {
    send(socket, {
      type: "state_update",
      ...buildStatePayload()
    });
  }
}

function setRole(socket, role) {
  removeClient(socket);

  if (role === "grid") {
    socket.role = "grid";
    clients.grid.add(socket);
    return;
  }

  if (role === "cover") {
    socket.role = "cover";
    clients.cover.add(socket);
    return;
  }

  socket.role = "unknown";
  clients.unknown.add(socket);
}

function removeClient(socket) {
  clients.grid.delete(socket);
  clients.cover.delete(socket);
  clients.unknown.delete(socket);
}

function handleGridOpened(scanEventId) {
  state.sessionId += 1;
  state.lastScanEventId = scanEventId;
  state.queue = shuffle(indexes());
  state.queuePos = 0;
  state.activeIndex = null;
  state.isPlaying = false;
  state.currentTime = 0;
  state.duration = 0;

  broadcastState();

  broadcastToRole("cover", {
    type: "reset_session",
    sessionId: state.sessionId,
    nextIndex: getNextIndex()
  });
}

function queueFromSelection(index) {
  const remaining = indexes().filter((value) => value !== index);
  state.queue = [index, ...shuffle(remaining)];
  state.queuePos = 0;
  state.activeIndex = index;
  state.isPlaying = true;
  state.currentTime = 0;
  state.duration = 0;
}

function playNextFromQueue() {
  if (!state.queue.length) {
    state.queue = shuffle(indexes());
    state.queuePos = 0;
  } else {
    state.queuePos += 1;
    if (state.queuePos >= state.queue.length) {
      state.queue = shuffle(indexes());
      state.queuePos = 0;
    }
  }

  const index = state.queue[state.queuePos] ?? 0;
  state.activeIndex = index;
  state.isPlaying = true;
  state.currentTime = 0;
  state.duration = 0;

  broadcastState();

  broadcastToRole("cover", {
    type: "play_track",
    index,
    startTime: 0,
    sessionId: state.sessionId
  });
}

function applyCoverStatus(message) {
  if (Number.isInteger(message.activeIndex)) {
    state.activeIndex = message.activeIndex;
  } else if (message.activeIndex === null) {
    state.activeIndex = null;
  }

  if (typeof message.isPlaying === "boolean") {
    state.isPlaying = message.isPlaying;
  }

  if (Number.isFinite(message.currentTime)) {
    state.currentTime = Math.max(0, Number(message.currentTime));
  }

  if (Number.isFinite(message.duration)) {
    state.duration = Math.max(0, Number(message.duration));
  }
}

function buildStatePayload() {
  return {
    sessionId: state.sessionId,
    activeIndex: state.activeIndex,
    nextIndex: getNextIndex(),
    queueLength: state.queue.length,
    queuePos: state.queuePos,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration
  };
}

function getNextIndex() {
  if (!state.queue.length) {
    return null;
  }

  const nextPos = state.activeIndex === null ? state.queuePos : state.queuePos + 1;
  const wrapped = nextPos >= state.queue.length ? 0 : nextPos;
  return state.queue[wrapped] ?? null;
}

function broadcastState() {
  const payload = {
    type: "state_update",
    ...buildStatePayload()
  };

  broadcast(payload);
}

function broadcastStateToGrids() {
  const payload = {
    type: "state_update",
    ...buildStatePayload()
  };

  broadcastToRole("grid", payload);
}

function broadcast(payload) {
  for (const role of ["grid", "cover", "unknown"]) {
    broadcastToRole(role, payload);
  }
}

function broadcastToRole(role, payload) {
  for (const socket of clients[role]) {
    send(socket, payload);
  }
}

function send(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function indexes() {
  return Array.from({ length: ALBUM_SIZE }, (_, i) => i);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function serveSafeRelativeFile(baseDir, relativePath, res) {
  const normalized = path.normalize(relativePath).replace(/^\.+[\\/]/, "");
  const resolved = path.join(baseDir, normalized);

  if (!resolved.startsWith(baseDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  serveFile(resolved, res);
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = mimeByExt[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  });
}

function sendJson(res, body) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
