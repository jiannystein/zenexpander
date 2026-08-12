import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageMetadata from "./package.json" with { type: "json" };

export default defineConfig({
  base: "./",
  define: {
    __ZENEXPANDER_VERSION__: JSON.stringify(packageMetadata.version),
  },
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
