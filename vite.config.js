import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// يستخدم النشر على GitHub Pages مسار المشروع بدل جذر النطاق.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
