# [cite_start]xCloudPMIS 專案架構說明 [cite: 1008, 1010]
[cite_start]**版本**：v7.0 [cite: 1011] | [cite_start]**適用對象**：資深工程師 / 架構師 / 維運人員 [cite: 1011]

---

## [cite_start]1. 系統概述與設計原則 [cite: 1013, 1015]
* [cite_start]**容器優先**：全服務 Docker 容器化 [cite: 1016]。
* [cite_start]**API 優先**：前後端完全分離（RESTful API） [cite: 1017]。
* [cite_start]**AI 人機協同**：AI 決策分級管控 [cite: 1018]。
* [cite_start]**安全設計**：JWT 認證、AES-256-GCM 加密、非 root 容器 [cite: 1020]。

## [cite_start]2. 技術堆疊 [cite: 1023]
| 層級 | 技術 | 說明 |
|---|---|---|
| 前端 | React 18 + Vite 5 | [cite_start]SPA，Yjs 即時協作 [cite: 1024] |
| 後端 | Node.js 20 + Express 4.18 | [cite_start]REST API, Prisma 5.8 ORM [cite: 1024] |
| 資料庫/快取 | PostgreSQL 15 + Redis 7 | [cite_start]主資料庫與 API 快取 [cite: 1024] |
| AI / MCP | OpenAI 相容 API + MCP SDK | [cite_start]ReAct 代理與 Claude 整合 [cite: 1024] |

## [cite_start]3. 全系統容器架構 [cite: 1026]
系統由 7 個 Docker 容器組成，由 Nginx 反向代理分配請求：
* [cite_start]`pmis-frontend`: React SPA (:80) [cite: 1028, 1034]
* [cite_start]`pmis-backend`: REST API (:3010) [cite: 1028, 1035]
* [cite_start]`pmis-db`: PostgreSQL (:5432) [cite: 1028]
* [cite_start]`pmis-redis`: Redis 快取 (:6379) [cite: 1028]
* [cite_start]`pmis-collab`: Yjs WebSocket (:1234) [cite: 1028, 1037]
* [cite_start]`pmis-monitor`: AI 風險掃描 [cite: 1028]
* [cite_start]`pgadmin`: 開發用 GUI [cite: 1028]

## [cite_start]4. AI 代理架構 (ReAct) [cite: 1043, 1143]
採用 ReAct (Reason + Act) 框架，依風險分級執行：
* [cite_start]**Level 1 低風險**：自動執行 [cite: 1145]。
* [cite_start]**Level 2 中風險**：Staging 審核 [cite: 1145]。
* [cite_start]**Level 3 高風險**：人工審查與修改 [cite: 1145]。
* [cite_start]**Level 4 嚴重風險**：強制人工介入 [cite: 1145]。

## [cite_start]5. 資料庫與安全設計 [cite: 1163, 1242]
* [cite_start]**17 個資料表與 6 個 VIEW**：優化 Dashboard 查詢效能 [cite: 1165, 1167]。
* [cite_start]**認證與加密**：JWT (HS256) 24小時有效；OAuth Token 使用 AES-256-GCM 加密 [cite: 1244, 1246]。
* [cite_start]**API 安全**：Speed Limit (登入 5次/分，一般 100次/分)、Helmet.js、Prisma 防 SQL 注入 [cite: 1254, 1255, 1257]。