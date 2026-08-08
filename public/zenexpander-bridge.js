const status = document.getElementById("bridge-status");
const parameters = new URLSearchParams(location.hash.slice(1));
const token = parameters.get("token") ?? "";
const nonce = parameters.get("nonce") ?? "";
const openerOrigin = parameters.get("origin") ?? "";

function fail(message) {
  status.textContent = message;
  status.dataset.tone = "error";
}

let parsedOrigin;
try {
  parsedOrigin = new URL(openerOrigin).origin;
} catch {
  parsedOrigin = "";
}

if (
  !window.opener
  || window.opener.closed
  || !/^[a-f0-9]{64}$/i.test(token)
  || !/^[a-z0-9-]{8,100}$/i.test(nonce)
  || !/^https?:\/\//.test(parsedOrigin)
) {
  fail("This connection request is invalid. Close this tab and retry ZenExpander.");
} else if (typeof SharedWorker !== "function") {
  fail("SharedWorker is blocked in this Chrome profile.");
} else {
  try {
    const worker = new SharedWorker("./zenexpander-bridge-worker.js", {
      name: "zenexpander-config-bridge-v2",
    });
    worker.port.start();
    worker.port.postMessage({ type: "zen:register", role: "runtime", token });
    window.opener.postMessage({ type: "zen:bridge-port", nonce }, parsedOrigin, [worker.port]);
    status.textContent = "Connected. Returning to your page…";
    window.setTimeout(() => window.close(), 220);
  } catch {
    fail("Chrome could not create the private ZenExpander bridge.");
  }
}
