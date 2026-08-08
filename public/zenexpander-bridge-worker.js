const rooms = new Map();

function roomFor(token) {
  if (!rooms.has(token)) {
    rooms.set(token, {
      config: null,
      updatedAt: 0,
      configurators: new Set(),
      runtimes: new Set(),
    });
  }
  return rooms.get(token);
}

function send(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

function broadcast(room, message) {
  for (const port of room.runtimes) {
    if (!send(port, message)) room.runtimes.delete(port);
  }
}

self.onconnect = (event) => {
  const port = event.ports[0];
  let role = "";
  let token = "";
  let room;

  port.onmessage = (messageEvent) => {
    const message = messageEvent.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "zen:register") {
      role = message.role;
      token = String(message.token ?? "");
      if (!/^[a-f0-9]{64}$/i.test(token) || !["configurator", "runtime"].includes(role)) return;
      room = roomFor(token);
      (role === "configurator" ? room.configurators : room.runtimes).add(port);
      send(port, { type: "zen:registered", role });
      return;
    }

    if (!room || message.token !== token) return;

    if (["zen:heartbeat", "zen:config-update"].includes(message.type) && role === "configurator") {
      room.config = message.config;
      room.updatedAt = Number(message.updatedAt || Date.now());
      if (message.type === "zen:config-update") {
        broadcast(room, {
          type: "zen:config-changed",
          config: room.config,
          updatedAt: room.updatedAt,
        });
      }
      return;
    }

    if (message.type === "zen:request-config" && role === "runtime") {
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
    }
  };
  port.start();
};
