let worker;
let latestWorkspace;

export function connectConfigurator(workspace, onStatus = () => {}) {
  latestWorkspace = workspace;
  if (typeof SharedWorker !== "function") {
    onStatus({ connected: false, message: "SharedWorker is blocked in this Chrome profile." });
    return () => {};
  }
  try {
    const workerUrl = new URL(`${import.meta.env.BASE_URL}zenexpander-bridge-worker.js`, window.location.href);
    worker = new SharedWorker(workerUrl, {
      name: "zenexpander-config-bridge-v2",
    });
    worker.port.start();
    worker.port.onmessage = (event) => {
      if (event.data?.type === "zen:registered") onStatus({ connected: true, message: "Widget bridge ready" });
    };
    const send = () => {
      if (!latestWorkspace) return;
      worker.port.postMessage({
        type: "zen:config-update",
        token: latestWorkspace.pairingToken,
        config: latestWorkspace.config,
        updatedAt: latestWorkspace.updatedAt,
      });
    };
    worker.port.postMessage({
      type: "zen:register",
      role: "configurator",
      token: workspace.pairingToken,
    });
    send();
    return () => {
      worker?.port.close();
      worker = undefined;
    };
  } catch {
    onStatus({ connected: false, message: "Chrome could not start the private widget bridge." });
    return () => {};
  }
}

export function updateConfiguratorWorkspace(workspace) {
  latestWorkspace = workspace;
  worker?.port.postMessage({
    type: "zen:config-update",
    token: workspace.pairingToken,
    config: workspace.config,
    updatedAt: workspace.updatedAt,
  });
}
