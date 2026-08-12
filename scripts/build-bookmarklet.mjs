import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "public");
const cacheDirectory = path.join(root, "node_modules", ".cache", "zenexpander");
const runtimePath = path.join(cacheDirectory, "zenexpander-bookmarklet.min.js");
const bookmarkletPath = path.join(outputDirectory, "zenexpander-bookmarklet.txt");
const budget = 32 * 1024;
const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await mkdir(outputDirectory, { recursive: true });
await mkdir(cacheDirectory, { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "bookmarklet", "runtime.js")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120", "edge120"],
  define: { __ZENEXPANDER_VERSION__: JSON.stringify(packageMetadata.version) },
  outfile: runtimePath,
  loader: { ".png": "dataurl" },
  legalComments: "none",
});

const bundled = (await readFile(runtimePath, "utf8")).trim();
const optimized = await minify(bundled, {
  compress: { passes: 5, toplevel: true, unsafe_arrows: true, unsafe_methods: true },
  mangle: {
    toplevel: true,
    properties: {
      regex: /^(?:win|doc|host|shadow|bridgeWindow|bridgePort|isChild|configRequested|originArmed|originConsented|consentOpen|nativeOpen|openWrapper|trackedWindows|poll|activeTarget|savedRange|prefixMode|query|anchorRect|results|activeIndex|choice|confirmChoice|documents|frames|observers|inserting|pendingInputTarget|lastInsertEnd|notice|node|create|build|watchFrameContent|watchFrame|watchDocument|setStatus|renderOriginControl|cancelOriginConsent|armOrigin|disarmOrigin|attachPort|handleWindowMessage|handleBridge|requestConfig|connect|installOpenInterceptor|removeOpenInterceptor|propagationFallback|trackOpenedWindow|bootstrapChild|showDisconnected|restoreSearchBody|handleFocus|captureTarget|open|close|toggle|shortcutMatches|handleKeydown|handleInput|positionNear|renderResults|paintActive|choose|showChoice|insert|boot)$/,
    },
  },
  ecma: 2022,
  format: { comments: false, ascii_only: true },
});
if (!optimized.code) throw new Error("ZenExpander bookmarklet could not be optimized.");
const runtime = optimized.code.trim();
await writeFile(runtimePath, `${runtime}\n`, "utf8");
const bookmarklet = `javascript:${encodeURI(runtime).replaceAll("#", "%23")}`;
const measured = bookmarklet
  .replace("__ZENEXPANDER_PAIRING_TOKEN__", "a".repeat(64))
  .replace("__ZENEXPANDER_BRIDGE_URL__", encodeURIComponent("https://example.github.io/ZenExpander/zenexpander-bridge.html"));
const bytes = Buffer.byteLength(measured, "utf8");
if (bytes > budget) throw new Error(`ZenExpander bookmarklet is ${bytes} bytes; budget is ${budget}.`);
await writeFile(bookmarkletPath, `${bookmarklet}\n`, "utf8");
console.log(`ZenExpander bookmarklet: ${bytes} / ${budget} bytes`);
