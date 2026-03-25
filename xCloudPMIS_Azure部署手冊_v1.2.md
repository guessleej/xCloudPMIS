# [cite_start]xCloudPMIS Azure 雲端部署手冊 [cite: 400, 401]
[cite_start]**版本**：v1.2 [cite: 403] | [cite_start]**更新日期**：2026-03-23 [cite: 403] | [cite_start]**適用環境**：Microsoft Azure 公有雲 [cite: 403]

---

## [cite_start]1. Azure 架構設計 [cite: 405]
[cite_start]系統透過 Front Door / App Gateway 進入，分配至 Container Apps（前端 Nginx+React，後端 Node.js），並連接 PostgreSQL、Redis 與 Key Vault [cite: 411, 416, 417, 418, 424, 429]。

### [cite_start]Azure 服務清單 [cite: 432]
| 服務 | Azure 產品 | 用途 |
|---|---|---|
| 前端/後端容器 | Container Apps | [cite_start]React SPA / Express API [cite: 433] |
| 容器映像庫 | Container Registry | [cite_start]Docker 映像存放 [cite: 433] |
| 資料庫 | PostgreSQL Flexible Server | [cite_start]主資料庫 [cite: 433] |
| 快取 | Cache for Redis | [cite_start]快取 / Session [cite: 433] |
| 機密管理 | Key Vault | [cite_start]API Keys / 密碼 [cite: 433] |

## [cite_start]2. 部署前準備 [cite: 436]
需安裝 Azure CLI 並登入：
```bash
az login
az account set --subscription "your-subscription-id"