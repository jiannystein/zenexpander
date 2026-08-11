const rooms = new Map();

function roomFor(token) {
  if (!rooms.has(token)) {
    rooms.set(token, {
      config: null,
      updatedAt: 0,
      configurators: new Set(),
      runtimes: new Map(),
      armedOrigins: new Set(),
      consentedOrigins: new Set(),
    });
  }
  return rooms.get(token);
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value ?? ""));
    return /^https?:$/.test(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}

function send(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

function forgetRuntime(room, port) {
  room?.runtimes.delete(port);
}

function sendOriginState(room, port, origin) {
  send(port, {
    type: "zen:origin-state",
    origin,
    armed: room.armedOrigins.has(origin),
    consented: room.consentedOrigins.has(origin),
  });
}

function broadcastConfig(room) {
  for (const [port, runtime] of room.runtimes) {
    if (!runtime.hydrated) continue;
    if (!send(port, {
      type: "zen:config-changed",
      config: room.config,
      updatedAt: room.updatedAt,
    })) forgetRuntime(room, port);
  }
}

function broadcastOriginState(room, origin) {
  for (const [port, runtime] of room.runtimes) {
    if (runtime.origin !== origin) continue;
    if (!send(port, {
      type: "zen:origin-state",
      origin,
      armed: room.armedOrigins.has(origin),
      consented: room.consentedOrigins.has(origin),
    })) forgetRuntime(room, port);
  }
}

function attachPort(port, initial = {}) {
  let role = initial.role ?? "";
  let token = initial.token ?? "";
  let room = initial.room;
  let origin = initial.origin ?? "";

  if (room && role === "runtime") {
    room.runtimes.set(port, { origin, hydrated: false });
    send(port, { type: "zen:registered", role, child: true });
    sendOriginState(room, port, origin);
  }

  port.onmessage = (messageEvent) => {
    const message = messageEvent.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "zen:register") {
      role = message.role;
      token = String(message.token ?? "");
      if (!/^[a-f0-9]{64}$/i.test(token) || !["configurator", "runtime"].includes(role)) return;
      origin = role === "runtime" ? normalizedOrigin(message.origin) : "";
      if (role === "runtime" && !origin) return;
      room = roomFor(token);
      if (role === "configurator") room.configurators.add(port);
      else room.runtimes.set(port, { origin, hydrated: false });
      send(port, { type: "zen:registered", role });
      if (role === "runtime") sendOriginState(room, port, origin);
      return;
    }

    if (!room || message.token !== token) return;

    if (["zen:heartbeat", "zen:config-update"].includes(message.type) && role === "configurator") {
      room.config = message.config;
      room.updatedAt = Number(message.updatedAt || Date.now());
      if (message.type === "zen:config-update") broadcastConfig(room);
      return;
    }

    if (role !== "runtime") return;

    if (message.type === "zen:request-config") {
      const runtime = room.runtimes.get(port);
      if (runtime) runtime.hydrated = true;
      if (!room.config) {
        send(port, {
          type: "zen:error",
          nonce: message.nonce,
          code: "config-unavailable",
          message: "Waiting for the ZenExpander configurator to share your expansions…",
        });
        return;
      }
      send(port, {
        type: "zen:config",
        nonce: message.nonce,
        config: room.config,
        updatedAt: room.updatedAt,
      });
      return;
    }

    if (message.type === "zen:request-origin-state") {
      sendOriginState(room, port, origin);
      return;
    }

    if (message.type === "zen:arm-origin") {
      if (normalizedOrigin(message.origin) !== origin) return;
      room.consentedOrigins.add(origin);
      room.armedOrigins.add(origin);
      broadcastOriginState(room, origin);
      return;
    }

    if (message.type === "zen:disarm-origin") {
      if (normalizedOrigin(message.origin) !== origin) return;
      room.armedOrigins.delete(origin);
      broadcastOriginState(room, origin);
      return;
    }

    if (message.type === "zen:create-child-port") {
      const childPort = messageEvent.ports?.[0];
      const childOrigin = normalizedOrigin(message.origin);
      if (!childPort || childOrigin !== origin || !room.armedOrigins.has(origin)) return;
      attachPort(childPort, { role: "runtime", token, room, origin });
    }
  };

  port.onmessageerror = () => forgetRuntime(room, port);
  port.start();
}

self.onconnect = (event) => attachPort(event.ports[0]);
