FROM node:20-alpine
RUN apk add --no-cache curl openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 3002
CMD ["node", "server.js"]
