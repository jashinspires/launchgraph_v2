import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(process.cwd(), "client"),
  cacheDir: path.resolve(process.cwd(), "node_modules/.vite"),
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "lucide-react"],
  },
  build: {
    outDir: path.resolve(process.cwd(), "dist/client"),
    emptyOutDir: true,
  },
});
