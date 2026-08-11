import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const token = "a".repeat(64);
const origin = "https://tickets.example.test";

class FakePort {
  constructor() {
    this.messages = [];
    this.started = false;
    this.onmessage = null;
    this.onmessageerror = null;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  start() {
    this.started = true;
  }

  send(data, ports = []) {
    this.onmessage?.({ data, ports });
  }

  take(type) {
    const index = this.messages.findIndex((message) => message.type === type);
    return index < 0 ? undefined : this.messages.splice(index, 1)[0];
  }
}

async function createWorker() {
  const source = await readFile(path.join(root, "public", "zenexpander-bridge-worker.js"), "utf8");
  const context = vm.createContext({
    self: {},
    URL,
    Map,
    Set,
    Date,
    Number,
    String,
    RegExp,
  });
  vm.runInContext(source, context);
  return {
    connect(port) {
      context.self.onconnect({ ports: [port] });
    },
  };
}

test("worker keeps exact-origin consent session-only and child config lazy", async () => {
  const worker = await createWorker();
  const configurator = new FakePort();
  worker.connect(configurator);
  configurator.send({ type: "zen:register", role: "configurator", token });
  assert.equal(configurator.take("zen:registered")?.role, "configurator");
  configurator.send({
    type: "zen:config-update",
    token,
    config: { prefix: ";", expansions: [{ shortcut: "hello" }] },
    updatedAt: 1,
  });

  const source = new FakePort();
  worker.connect(source);
  source.send({ type: "zen:register", role: "runtime", token, origin });
  assert.equal(source.take("zen:registered")?.role, "runtime");
  assert.deepEqual({ ...source.take("zen:origin-state") }, {
    type: "zen:origin-state",
    origin,
    armed: false,
    consented: false,
  });

  source.send({ type: "zen:arm-origin", token, origin });
  assert.deepEqual({ ...source.take("zen:origin-state") }, {
    type: "zen:origin-state",
    origin,
    armed: true,
    consented: true,
  });

  const child = new FakePort();
  source.send({ type: "zen:create-child-port", token, origin }, [child]);
  assert.equal(child.started, true);
  assert.equal(child.take("zen:registered")?.child, true);
  assert.equal(child.take("zen:origin-state")?.armed, true);

  configurator.send({
    type: "zen:config-update",
    token,
    config: { prefix: ";", expansions: [{ shortcut: "updated" }] },
    updatedAt: 2,
  });
  assert.equal(child.take("zen:config-changed"), undefined, "unopened child must not receive the catalog");

  child.send({ type: "zen:request-config", token, nonce: "child" });
  assert.equal(child.take("zen:config")?.config.expansions[0].shortcut, "updated");

  configurator.send({
    type: "zen:config-update",
    token,
    config: { prefix: ";", expansions: [{ shortcut: "latest" }] },
    updatedAt: 3,
  });
  assert.equal(child.take("zen:config-changed")?.config.expansions[0].shortcut, "latest");

  source.send({ type: "zen:disarm-origin", token, origin });
  assert.equal(source.take("zen:origin-state")?.armed, false);
  assert.equal(child.take("zen:origin-state")?.armed, false);
  child.send({ type: "zen:request-config", token, nonce: "after-disarm" });
  assert.equal(child.take("zen:config")?.config.expansions[0].shortcut, "latest");
});

test("worker rejects child ports outside the registered exact origin", async () => {
  const worker = await createWorker();
  const source = new FakePort();
  worker.connect(source);
  source.send({ type: "zen:register", role: "runtime", token, origin });
  source.take("zen:registered");
  source.take("zen:origin-state");
  source.send({ type: "zen:arm-origin", token, origin });
  source.take("zen:origin-state");

  const child = new FakePort();
  source.send({
    type: "zen:create-child-port",
    token,
    origin: "https://subdomain.tickets.example.test",
  }, [child]);
  assert.equal(child.started, false);
  assert.equal(child.messages.length, 0);
});
