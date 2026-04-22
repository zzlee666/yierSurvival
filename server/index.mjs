import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const PROTOCOL_VERSION = 1;
const TICK_RATE = 30;
const WORLD_COORD_SCALE = 2;
const scaleWorldCoord = (value) => Math.round(value * WORLD_COORD_SCALE);
const WORLD_BOUNDS = {
  minX: scaleWorldCoord(80),
  maxX: scaleWorldCoord(2480),
  minY: scaleWorldCoord(80),
  maxY: scaleWorldCoord(1360),
};
const BEARS = {
  yier: {
    id: "yier",
    x: scaleWorldCoord(1210),
    y: scaleWorldCoord(700),
    facing: 1,
    hp: 100,
    maxHp: 100,
    hunger: 86,
    maxHunger: 100,
    speed: 190,
  },
  bubu: {
    id: "bubu",
    x: scaleWorldCoord(1320),
    y: scaleWorldCoord(700),
    facing: 1,
    hp: 140,
    maxHp: 140,
    hunger: 120,
    maxHunger: 140,
    speed: 170,
  },
};
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

const clients = new Map();
let nextClientNumber = 1;
let lastTickAt = performance.now();

const distRoot = resolve(process.cwd(), "dist");
const publicRoot = resolve(process.cwd(), "public");

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  if (existsSync(distRoot)) {
    serveStatic(request.url ?? "/", response);
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Dual Bear online server is running. Use Vite for local frontend development.\n");
});

server.on("upgrade", (request, socket) => {
  const upgrade = request.headers.upgrade?.toLowerCase();
  const key = request.headers["sec-websocket-key"];

  if (upgrade !== "websocket" || typeof key !== "string") {
    socket.destroy();
    return;
  }

  const acceptKey = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n"),
  );

  const client = {
    id: `player-${nextClientNumber++}`,
    socket,
    bearId: assignBearId(),
    input: { moveX: 0, moveY: 0 },
    buffer: Buffer.alloc(0),
  };

  clients.set(client.id, client);
  sendJson(client.socket, {
    type: "welcome",
    protocol: PROTOCOL_VERSION,
    clientId: client.id,
    bearId: client.bearId,
    serverTime: Date.now(),
  });
  broadcastState();

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    readFrames(client);
  });
  socket.on("close", () => {
    clients.delete(client.id);
    broadcastState();
  });
  socket.on("error", () => {
    clients.delete(client.id);
    socket.destroy();
    broadcastState();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Dual Bear online server listening on ws://${HOST}:${PORT}`);
});

setInterval(() => {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastTickAt) / 1000, 0.1);
  lastTickAt = now;
  stepWorld(deltaSeconds);
  broadcastState();
}, 1000 / TICK_RATE);

function assignBearId() {
  const taken = new Set([...clients.values()].map((client) => client.bearId).filter(Boolean));

  if (!taken.has("yier")) {
    return "yier";
  }

  if (!taken.has("bubu")) {
    return "bubu";
  }

  return undefined;
}

function stepWorld(deltaSeconds) {
  for (const client of clients.values()) {
    if (!client.bearId) {
      continue;
    }

    const bear = BEARS[client.bearId];
    const move = normalizeInput(client.input.moveX, client.input.moveY);

    bear.x = clamp(bear.x + move.x * bear.speed * deltaSeconds, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    bear.y = clamp(bear.y + move.y * bear.speed * deltaSeconds, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY);

    if (move.x < -0.1) {
      bear.facing = -1;
    } else if (move.x > 0.1) {
      bear.facing = 1;
    }
  }
}

function normalizeInput(moveX, moveY) {
  const x = clamp(Number(moveX) || 0, -1, 1);
  const y = clamp(Number(moveY) || 0, -1, 1);
  const length = Math.hypot(x, y);

  if (length <= 1) {
    return { x, y };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function broadcastState() {
  const message = {
    type: "state",
    protocol: PROTOCOL_VERSION,
    serverTime: Date.now(),
    connectedCount: clients.size,
    bears: {
      yier: toBearSnapshot(BEARS.yier),
      bubu: toBearSnapshot(BEARS.bubu),
    },
  };

  for (const client of clients.values()) {
    sendJson(client.socket, message);
  }
}

function toBearSnapshot(bear) {
  return {
    id: bear.id,
    x: Math.round(bear.x * 100) / 100,
    y: Math.round(bear.y * 100) / 100,
    facing: bear.facing,
    hp: bear.hp,
    maxHp: bear.maxHp,
    hunger: bear.hunger,
    maxHunger: bear.maxHunger,
  };
}

function readFrames(client) {
  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (client.buffer.length < offset + 2) {
        return;
      }

      payloadLength = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (client.buffer.length < offset + 8) {
        return;
      }

      const largeLength = client.buffer.readBigUInt64BE(offset);
      if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        closeSocket(client.socket);
        return;
      }

      payloadLength = Number(largeLength);
      offset += 8;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + payloadLength;

    if (client.buffer.length < frameLength) {
      return;
    }

    const mask = masked ? client.buffer.subarray(offset, offset + 4) : undefined;
    offset += maskLength;
    const payload = Buffer.from(client.buffer.subarray(offset, offset + payloadLength));
    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 0x8) {
      closeSocket(client.socket);
      return;
    }

    if (opcode !== 0x1) {
      continue;
    }

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    handleClientMessage(client, payload.toString("utf8"));
  }
}

function handleClientMessage(client, rawMessage) {
  let message;

  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendJson(client.socket, {
      type: "error",
      protocol: PROTOCOL_VERSION,
      message: "Invalid JSON message.",
    });
    return;
  }

  if (message.protocol !== PROTOCOL_VERSION || message.type !== "input") {
    return;
  }

  client.input.moveX = clamp(Number(message.moveX) || 0, -1, 1);
  client.input.moveY = clamp(Number(message.moveY) || 0, -1, 1);
}

function sendJson(socket, message) {
  if (socket.destroyed) {
    return;
  }

  socket.write(encodeTextFrame(JSON.stringify(message)));
}

function encodeTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const header =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : payload.length < 65536
        ? Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
        : createLargeFrameHeader(payload.length);

  return Buffer.concat([header, payload]);
}

function createLargeFrameHeader(payloadLength) {
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return header;
}

function closeSocket(socket) {
  if (!socket.destroyed) {
    socket.end(Buffer.from([0x88, 0x00]));
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function serveStatic(url, response) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(distRoot, normalize(relativePath));
  const fallback = resolve(distRoot, "index.html");

  if (!candidate.startsWith(distRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : fallback;
  const contentType = MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream";

  response.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(response);
}
