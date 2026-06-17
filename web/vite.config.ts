import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          graph: ["react-force-graph-2d"],
          uplot: ["uplot"],
        },
      },
    },
  },
});
