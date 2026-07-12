import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // deployed as a static folder at copri.com/map (see scripts/publish.mjs)
  base: '/map/',
  plugins: [react(), tailwindcss()],
  // .geojson files are served/bundled as static assets (imported with ?url)
  assetsInclude: ['**/*.geojson'],
})
