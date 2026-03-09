# ============================================================
# 後端 Dockerfile — Node.js 開發環境
# ============================================================

# 使用官方 Node.js 20 LTS（Alpine = 輕量版 Linux，體積小）
FROM node:20-alpine

# 安裝必要的系統套件
# curl：用於 healthcheck
# openssl：Prisma 在 Alpine Linux 上需要這個才能運作
RUN apk add --no-cache curl openssl

# 設定工作目錄（所有後續指令都在這個目錄執行）
WORKDIR /app

# 先複製 package.json，利用 Docker Layer Cache 加速建構
# 只有 package.json 改變時才重新執行 npm install
COPY package*.json ./

# 安裝所有套件（包含開發用的 nodemon 和 prisma）
RUN npm install

# 複製原始碼（包含 prisma/ 目錄）
COPY . .

# 產生 Prisma Client（根據 schema.prisma 產生 TypeScript 類型定義）
# 這樣 src/index.js 才能使用 @prisma/client
RUN npx prisma generate

# 對外開放 3000 port（文件用途，實際映射在 docker-compose.yml）
EXPOSE 3000

# 啟動開發伺服器（nodemon 監控檔案變更，自動重啟）
CMD ["npm", "run", "dev"]
