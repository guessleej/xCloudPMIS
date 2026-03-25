# [cite_start]xCloudPMIS API 使用說明 [cite: 1279, 1281]
[cite_start]**版本**：v1.0 [cite: 1282] | [cite_start]**適用對象**：開發人員 / 系統整合商 [cite: 1282]

---

## [cite_start]1. 快速開始 [cite: 1284]
* [cite_start]**Base URL (生產)**：`https://pmis.yourcompany.com/api` [cite: 1286]
* [cite_start]**資料格式**：JSON [cite: 1286]
* [cite_start]**認證方式**：JWT Bearer Token [cite: 1286]

## [cite_start]2. 認證機制 [cite: 1296]
[cite_start]呼叫 `/api/auth/login` 取得 Token [cite: 1300]：
```json
{
  "email": "user@company.com",
  "password": "your_password"
}