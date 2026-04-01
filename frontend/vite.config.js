import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 明確指定專案根目錄（index.html 所在位置）
  // 解決 Docker 容器內 Vite 找不到入口點的警告
  root: '.',

  plugins: [
    react({
      jsxRuntime: 'automatic', // 自動引入 React，JSX 不需要手動 import React
    }),
  ],

  // 明確告訴 Vite 要預先打包哪些依賴
  // 避免 "Could not auto-determine entry point" 警告導致 React 未被打包
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client'],
  },

  server: {
    host: '0.0.0.0',   // 允許容器外部訪問
    port: 3838,
    strictPort: true,   // 如果 port 被占用就報錯，而不是自動換 port
    allowedHosts: ['localhost', '127.0.0.1', 'host.docker.internal'],

    // ── API Proxy ────────────────────────────────────────────────
    // 前端程式碼一律使用相對路徑 /api/...，不再硬編碼 localhost
    // 本機開發預設走 localhost:3000；Docker 環境透過 VITE_PROXY_TARGET 覆寫
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // /auth 路由（OAuth 相關：Microsoft/Google/GitHub 帳號連結）
      '/auth': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
