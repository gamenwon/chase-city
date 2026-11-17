import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      // V2.0: the art comparison sample is its own page next to the game.
      input: { main: "index.html", art: "art-sample.html" },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
