import { resolve } from "node:path"
import { atelierTheme } from "@atelier/theme/vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), atelierTheme()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
})
