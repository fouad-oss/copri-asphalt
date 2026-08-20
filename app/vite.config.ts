import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
// Production serves the app under /app/ next to the legacy static site
// (see ../vercel.json + ../scripts/vercel-build.sh); dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/app/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // PORT override lets parallel tooling sessions run their own dev server
  server: { port: Number(process.env.PORT) || 8124 },
  build: {
    rolldownOptions: {
      output: {
        // Keep heavyweight vendors out of the entry chunk — the office
        // guard's landing (login) should not pay for all of them.
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)/ },
            { name: "supabase", test: /node_modules[\\/]@supabase/ },
          ],
        },
      },
    },
  },
}))
