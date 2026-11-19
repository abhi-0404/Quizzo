import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Debug leftovers never ship; console.error stays for real failures.
    drop: ["debugger" as const],
    pure: ["console.log", "console.debug"],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Stable vendor chunks cache across deploys; the heavy, rarely-needed
        // libraries (3D landing hero, charts, math) stay out of the entry.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          charts: ["recharts"],
          katex: ["katex"],
        },
      },
    },
  },
}));
