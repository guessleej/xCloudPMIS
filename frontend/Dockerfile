# ============================================================
# 前端 Dockerfile — React + Vite 開發環境
# ============================================================
#
# 設計要點：
#   1. 先 COPY package.json → npm install → COPY 源碼
#      利用 Docker layer cache，只有 package.json 變動時才重新安裝
#   2. ENTRYPOINT 使用 docker-entrypoint.sh：
#      - 每次容器啟動自動檢查 node_modules 是否存在
#      - 若 Volume 新建（空的）則自動 npm install
#      - 確保不論是首次啟動或容器重啟，依賴都正常
#   3. 與 docker-compose.yml 配合使用 Named Volume：
#      frontend_node_modules:/app/node_modules
#      （Named Volume 在容器間共享，持久化跨容器重啟）
# ============================================================

FROM node:20-alpine

WORKDIR /app

# 先複製依賴清單（利用 Build Cache：package.json 不變則不重新 install）
COPY package*.json ./

# 容器 Build 時安裝依賴到 Image Layer（初始化 Named Volume 內容用）
RUN npm install

# 複製源碼（node_modules 已在 image 層，不會被覆蓋）
COPY . .

EXPOSE 3001

# 啟動腳本：每次容器啟動時檢查 node_modules 完整性
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
