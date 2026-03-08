import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // 允許容器外部訪問
    port: 3001,
    strictPort: true,   // 如果 port 被占用就報錯，而不是自動換 port
  },
})
