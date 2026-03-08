# ============================================================
# 前端 Dockerfile — React + Vite 開發環境
# ============================================================

FROM node:20-alpine

WORKDIR /app

# 先複製 package.json，利用快取加速
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

# Vite 開發伺服器，--host 讓容器外部可以訪問
CMD ["npm", "run", "dev"]
