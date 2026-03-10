#!/bin/sh
# ============================================================
# frontend/docker-entrypoint.sh
# ============================================================
# 容器啟動防護腳本
#
# 問題：docker-compose 使用 volume 掛載 node_modules 時，
#       若 Named Volume 是新建的（空的），Vite 無法找到依賴，
#       導致 "Failed to resolve import" 錯誤。
#
# 解決：每次容器啟動時檢查關鍵套件是否存在，若缺失則自動重裝。
# ============================================================

set -e

echo "[entrypoint] 🚀 xCloudPMIS Frontend 啟動中..."

# ── 檢查 node_modules 是否完整 ────────────────────────────
check_node_modules() {
  # 檢查幾個關鍵套件（確保是 Phase 1 + Collab 所有依賴）
  for pkg in \
    "vite" \
    "react" \
    "@tiptap/react" \
    "@tiptap/extension-collaboration" \
    "yjs" \
    "y-websocket" \
    "y-indexeddb"; do
    if [ ! -d "/app/node_modules/${pkg}" ]; then
      echo "[entrypoint] ⚠️  缺少套件: ${pkg}"
      return 1
    fi
  done
  return 0
}

# ── 若缺少依賴，自動重新安裝 ──────────────────────────────
if ! check_node_modules; then
  echo "[entrypoint] 📦 node_modules 不完整，開始自動安裝..."
  echo "[entrypoint]    （首次啟動或 Named Volume 已清除時正常）"
  npm install --prefer-offline 2>&1 || npm install
  echo "[entrypoint] ✅ npm install 完成"
else
  echo "[entrypoint] ✅ node_modules 已完整（跳過安裝）"
fi

# ── 顯示環境資訊 ──────────────────────────────────────────
echo "[entrypoint] 📊 Node: $(node --version) | NPM: $(npm --version)"
echo "[entrypoint] 🌐 API: ${VITE_API_URL:-未設定}"
echo "[entrypoint] 🔗 Collab WS: ${VITE_COLLAB_WS_URL:-未設定}"
echo "[entrypoint] ▶️  執行: $@"
echo ""

# 執行原始 CMD（npm run dev）
exec "$@"
