import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tiptap/core", "@tiptap/react", "@tiptap/starter-kit"],
    holdUntilCrawlEnd: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/documents": "http://localhost:3001",
    },
  },
});
