#!/bin/bash
# ============================================================
# scripts/npm-install.sh
# xCloudPMIS — 一鍵重新安裝前端依賴腳本
# ============================================================
#
# 使用情境：
#   1. 容器啟動後出現 "Failed to resolve import" 錯誤
#   2. 新增套件後需要重建 node_modules Volume
#   3. 切換電腦後首次啟動
#   4. 依賴版本衝突需要乾淨安裝
#
# 使用方式：
#   chmod +x scripts/npm-install.sh
#   ./scripts/npm-install.sh           # 只重建前端
#   ./scripts/npm-install.sh --all     # 同時重建前後端
#   ./scripts/npm-install.sh --clean   # 刪除 Volume 後重建（最乾淨）
#
# ============================================================

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${BLUE}[pmis]${NC} $1"; }
success(){ echo -e "${GREEN}[pmis] ✅ $1${NC}"; }
warn()   { echo -e "${YELLOW}[pmis] ⚠️  $1${NC}"; }
error()  { echo -e "${RED}[pmis] ❌ $1${NC}"; exit 1; }

# ── 解析參數 ──────────────────────────────────────────────
REBUILD_ALL=false
CLEAN_VOLUMES=false

for arg in "$@"; do
  case $arg in
    --all)   REBUILD_ALL=true ;;
    --clean) CLEAN_VOLUMES=true ;;
    --help)
      echo "用法: $0 [--all] [--clean]"
      echo "  --all    同時重建前端 + 後端 node_modules"
      echo "  --clean  先刪除 Named Volume，完全重新安裝（最乾淨）"
      exit 0
      ;;
  esac
done

# ── 確認 Docker 環境 ───────────────────────────────────────
if ! command -v docker &> /dev/null; then
  error "Docker 未安裝或不在 PATH 中"
fi

if ! docker compose version &> /dev/null; then
  error "docker compose (v2) 未安裝"
fi

log "🔍 當前環境檢查..."
docker compose version | head -1

# ── 顯示目前 node_modules Volume 狀態 ─────────────────────
log "📦 目前 Volume 狀態："
docker volume ls --filter name=pmis | grep -E "node.modules" || warn "尚無 node_modules Volume（首次安裝）"

echo ""

# ── 若 --clean，先刪除 Volume ──────────────────────────────
if [ "$CLEAN_VOLUMES" = true ]; then
  warn "準備刪除 node_modules Volume（資料庫 Volume 保留不動）..."
  read -p "確認刪除？(y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker volume rm pmis-frontend-node-modules 2>/dev/null || true
    if [ "$REBUILD_ALL" = true ]; then
      docker volume rm pmis-backend-node-modules 2>/dev/null || true
    fi
    success "Volume 已刪除"
  else
    warn "已取消，保留現有 Volume"
    CLEAN_VOLUMES=false
  fi
fi

echo ""

# ── 重建前端容器（核心操作）──────────────────────────────
log "🔨 重建前端容器（frontend）..."
log "   這會重新執行 npm install 並建立新的 image layer"

docker compose stop frontend 2>/dev/null || true
docker compose rm -f frontend 2>/dev/null || true
docker compose build --no-cache frontend
docker compose up -d frontend

success "前端容器已重啟"

# ── 可選：重建後端容器 ────────────────────────────────────
if [ "$REBUILD_ALL" = true ]; then
  echo ""
  log "🔨 重建後端容器（backend + collaboration + monitor）..."

  docker compose stop backend collaboration monitor 2>/dev/null || true
  docker compose rm -f backend collaboration monitor 2>/dev/null || true
  docker compose build --no-cache backend
  docker compose up -d backend collaboration monitor

  success "後端容器群已重啟"
fi

# ── 等待前端就緒 ──────────────────────────────────────────
echo ""
log "⏳ 等待前端服務就緒（最多 60 秒）..."

for i in $(seq 1 12); do
  if curl -s -f http://localhost:3001 > /dev/null 2>&1; then
    success "前端服務正常運行！🎉"
    break
  fi
  sleep 5
  echo -n "."
  if [ $i -eq 12 ]; then
    echo ""
    warn "60 秒內未偵測到前端服務，請手動確認："
    warn "  docker compose logs frontend"
  fi
done

# ── 顯示最終狀態 ──────────────────────────────────────────
echo ""
log "📊 容器狀態："
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
  docker compose ps

echo ""
log "📦 node_modules Volume 狀態："
docker volume ls --filter name=pmis

echo ""
success "完成！如仍有問題，執行以下指令查看日誌："
echo "  docker compose logs -f frontend"
echo ""
echo "  若需完全重建（依賴版本衝突）："
echo "  $0 --clean"
