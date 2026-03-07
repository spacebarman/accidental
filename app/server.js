const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const HEARTBEAT_INTERVAL_MS = 15000;
const GRID_RESUME_WINDOW_MS = 120000;
const CONTROLLER_COOKIE_NAME = "acc_grid_owner";
const CONTROLLER_COOKIE_MAX_AGE_SECONDS = 86400;
const GRID_ACCESS_DEBUG = process.env.GRID_ACCESS_DEBUG === "1";

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
  lastScanEventId: null,
  lastCoverOpenEventId: null,
  gridClientCount: 0,
  lastGridConnectedAt: null,
  lastGridDisconnectedAt: null,
  lastGridDisconnectReason: null,
  controllerToken: null,
  controllerTokenIssuedAt: null
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
    const now = Date.now();
    const isQrRequest = requestUrl.searchParams.get("qr") === "true";
    const hasActiveGridClient = state.gridClientCount > 0;
    const lastDisconnectAt = state.lastGridDisconnectedAt;
    const requestControllerToken = getControllerTokenFromRequest(req);
    const hasControllerToken =
      Boolean(state.controllerToken) && requestControllerToken === state.controllerToken;
    const isWithinResumeWindow =
      Number.isFinite(lastDisconnectAt) && now - lastDisconnectAt <= GRID_RESUME_WINDOW_MS;
    const elapsedSinceDisconnectMs = Number.isFinite(lastDisconnectAt)
      ? now - lastDisconnectAt
      : null;

    if (hasActiveGridClient) {
      const decision = isQrRequest ? "qr_blocked_in_use" : "resume_blocked_in_use";

      logGridAccessDecision(decision, {
        isQrRequest,
        hasActiveGridClient,
        isWithinResumeWindow,
        elapsedSinceDisconnectMs,
        hasControllerToken
      });
      sendExternalLinkPage(res, {
        title: "'Accidental' En Ús",
        heading: "'Accidental' En Ús",
        message: "La instal·lació està en ús en aquest moment. Mentrestant, segueix Spacebarman a Instagram:.",
        href: "https://www.instagram.com/spacebarman",
        linkText: "@spacebarman"
      });
      return;
    }

    if (isQrRequest) {
      const nextControllerToken = createControllerToken();
      state.controllerToken = nextControllerToken;
      state.controllerTokenIssuedAt = now;
      res.setHeader("Set-Cookie", buildControllerCookie(nextControllerToken));

      logGridAccessDecision("qr_allowed", {
        isQrRequest,
        hasActiveGridClient,
        isWithinResumeWindow,
        elapsedSinceDisconnectMs,
        hasControllerToken
      });

      serveFile(path.join(publicRoot, "grid.html"), res);
      return;
    }

    if (hasControllerToken && isWithinResumeWindow) {
      res.setHeader("Set-Cookie", buildControllerCookie(state.controllerToken));

      logGridAccessDecision("resume_allowed_grace_owner", {
        isQrRequest,
        hasActiveGridClient,
        isWithinResumeWindow,
        elapsedSinceDisconnectMs,
        hasControllerToken
      });

      serveFile(path.join(publicRoot, "grid.html"), res);
      return;
    }

    logGridAccessDecision("expired_blocked", {
      isQrRequest,
      hasActiveGridClient,
      isWithinResumeWindow,
      elapsedSinceDisconnectMs,
      hasControllerToken
    });

    sendExternalLinkPage(res, {
        title: "ACCIDENTAL",
        heading: "ACCIDENTAL",
        message: "Aquesta sessió de 'Accidental' ha caducat. Si us plau, escaneja de nou el codi QR d'instal·lació. Per a la pàgina de l'àlbum públic, utilitza:",
        href: "https://www.spacebarman.com/accidental",
        linkText: "www.spacebarman.com/accidental"
    });
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

  if (pathname === "/api/grid-access-debug") {
    sendJson(res, buildGridAccessDebugPayload(req));
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

wss.on("connection", (socket, req) => {
  socket.role = "unknown";
  socket.isAlive = true;
  socket.removed = false;
  socket.controllerToken = getControllerTokenFromRequest(req);
  clients.unknown.add(socket);

  socket.on("pong", () => {
    socket.isAlive = true;
  });

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
    removeClient(socket, "socket_closed");
  });

  socket.on("error", () => {
    removeClient(socket, "socket_error");
  });
});

const heartbeatInterval = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      removeClient(socket, "heartbeat_timeout");
      socket.terminate();
      continue;
    }

    socket.isAlive = false;

    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
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

    handleGridOpened(message.scanEventId || null, message.source || "unknown");
    return;
  }

  if (type === "cover_opened") {
    if (socket.role !== "cover") {
      return;
    }

    handleCoverOpened(message.openEventId || null);
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
  removeClient(socket, "role_change");

  if (role === "grid") {
    const existingGridSocket = getAnyOtherGridSocket(socket);
    if (existingGridSocket) {
      send(socket, {
        type: "access_denied",
        reason: "grid_in_use"
      });

      // Keep one active controller at a time.
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1008, "grid_in_use");
        }
      }, 30);
      return;
    }

    socket.role = "grid";
    clients.grid.add(socket);
    socket.removed = false;
    updateGridPresence("grid_connected");
    return;
  }

  if (role === "cover") {
    socket.role = "cover";
    clients.cover.add(socket);
    socket.removed = false;
    return;
  }

  socket.role = "unknown";
  clients.unknown.add(socket);
  socket.removed = false;
}

function removeClient(socket, reason = "disconnect") {
  if (socket.removed) {
    return;
  }

  const wasGrid = clients.grid.delete(socket);
  clients.cover.delete(socket);
  clients.unknown.delete(socket);
  socket.removed = true;

  if (wasGrid) {
    updateGridPresence(reason);
  }
}

function updateGridPresence(reason) {
  const nextCount = clients.grid.size;
  const previousCount = state.gridClientCount;

  if (nextCount === previousCount) {
    return;
  }

  state.gridClientCount = nextCount;

  if (nextCount > previousCount) {
    state.lastGridConnectedAt = Date.now();
    console.log(`[presence] Grid connected. Active grid clients: ${nextCount}`);
  } else {
    state.lastGridDisconnectedAt = Date.now();
    state.lastGridDisconnectReason = reason;
    console.log(`[presence] Grid disconnected (${reason}). Active grid clients: ${nextCount}`);

    if (nextCount === 0) {
      stopPlaybackAfterGridDisconnect();
    }
  }

  const payload = {
    type: "grid_presence",
    connected: nextCount > 0,
    gridClientCount: nextCount,
    lastGridConnectedAt: state.lastGridConnectedAt,
    lastGridDisconnectedAt: state.lastGridDisconnectedAt,
    lastGridDisconnectReason: state.lastGridDisconnectReason
  };

  broadcastToRole("cover", payload);
  broadcastToRole("unknown", payload);
}

function stopPlaybackAfterGridDisconnect() {
  if (!state.isPlaying) {
    return;
  }

  state.isPlaying = false;
  state.currentTime = 0;
  state.duration = 0;
  state.activeIndex = null;

  broadcastState();

  broadcastToRole("cover", {
    type: "stop_playback",
    reason: "grid_disconnected",
    sessionId: state.sessionId
  });
}

function getAnyOtherGridSocket(currentSocket) {
  for (const gridSocket of clients.grid) {
    if (gridSocket !== currentSocket) {
      return gridSocket;
    }
  }

  return null;
}

function handleGridOpened(scanEventId, source) {
  if (source !== "qr_scan") {
    return;
  }

  if (scanEventId && scanEventId === state.lastScanEventId) {
    return;
  }

  state.lastScanEventId = scanEventId;
  resetSession();
}

function handleCoverOpened(openEventId) {
  if (openEventId && openEventId === state.lastCoverOpenEventId) {
    return;
  }

  state.lastCoverOpenEventId = openEventId;
  resetSession();
}

function resetSession() {
  state.sessionId += 1;
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
    duration: state.duration,
    gridConnected: state.gridClientCount > 0,
    gridClientCount: state.gridClientCount,
    lastGridConnectedAt: state.lastGridConnectedAt,
    lastGridDisconnectedAt: state.lastGridDisconnectedAt,
    lastGridDisconnectReason: state.lastGridDisconnectReason
  };
}

function buildGridAccessDebugPayload(req) {
  const now = Date.now();
  const requestControllerToken = getControllerTokenFromRequest(req);
  const hasServerControllerToken = Boolean(state.controllerToken);
  const requestHasControllerToken =
    hasServerControllerToken && requestControllerToken === state.controllerToken;
  const elapsedSinceDisconnectMs = Number.isFinite(state.lastGridDisconnectedAt)
    ? now - state.lastGridDisconnectedAt
    : null;
  const isWithinResumeWindow =
    Number.isFinite(elapsedSinceDisconnectMs) && elapsedSinceDisconnectMs <= GRID_RESUME_WINDOW_MS;

  return {
    serverTime: now,
    config: {
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      resumeWindowMs: GRID_RESUME_WINDOW_MS
    },
    presence: {
      gridConnected: state.gridClientCount > 0,
      gridClientCount: state.gridClientCount,
      lastGridConnectedAt: state.lastGridConnectedAt,
      lastGridDisconnectedAt: state.lastGridDisconnectedAt,
      lastGridDisconnectReason: state.lastGridDisconnectReason
    },
    owner: {
      serverControllerTokenPresent: hasServerControllerToken,
      controllerTokenIssuedAt: state.controllerTokenIssuedAt,
      requestControllerTokenPresent: Boolean(requestControllerToken),
      requestHasControllerToken
    },
    window: {
      elapsedSinceDisconnectMs,
      isWithinResumeWindow
    },
    playback: {
      sessionId: state.sessionId,
      activeIndex: state.activeIndex,
      isPlaying: state.isPlaying
    }
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

function createControllerToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildControllerCookie(token) {
  return `${CONTROLLER_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${CONTROLLER_COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`;
}

function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) {
    return result;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    result[key] = decodeURIComponent(value);
  }

  return result;
}

function getControllerTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[CONTROLLER_COOKIE_NAME] || null;
}

function logGridAccessDecision(decision, details) {
  if (!GRID_ACCESS_DEBUG) {
    return;
  }

  const elapsedSeconds = Number.isFinite(details.elapsedSinceDisconnectMs)
    ? (details.elapsedSinceDisconnectMs / 1000).toFixed(1)
    : "n/a";

  console.log(
    `[grid-access] ${decision} | qr=${details.isQrRequest} active=${details.hasActiveGridClient} ` +
      `within120s=${details.isWithinResumeWindow} owner=${details.hasControllerToken} ` +
      `elapsedSinceDisconnect=${elapsedSeconds}s gridClients=${state.gridClientCount}`
  );
}
