import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/upload": "https://notebooklm-gcqi.onrender.com",
      "/ask": "https://notebooklm-gcqi.onrender.com",
    },
  },
});