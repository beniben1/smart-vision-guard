import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir:       "dist",
    sourcemap:    true,
    chunkSizeWarningLimit: 2000, // TF.js bundles are large
  },
  optimizeDeps: {
    // Pre-bundle TF.js for faster dev startup
    include: ["@tensorflow/tfjs", "@tensorflow-models/coco-ssd"],
  },
});
