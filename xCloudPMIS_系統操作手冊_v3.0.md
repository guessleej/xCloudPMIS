# [cite_start]xCloudPMIS 專案管理資訊系統 - 系統操作手冊 [cite: 1, 2, 3, 4]
[cite_start]**版本**：v3.0 [cite: 5, 6] | [cite_start]**發行日期**：2026-03-23 [cite: 6] | [cite_start]**適用系統**：xCloudPMIS 完整版（前端 21 模組） [cite: 6]
[cite_start]**初始帳號**：admin@company.com / Admin@123456（首次登入後請修改） [cite: 6]

---

## [cite_start]第 1 章 系統概覽 [cite: 8]
### [cite_start]1.1 系統簡介 [cite: 9]
[cite_start]xCloudPMIS 是專為企業設計的雲端專案管理系統，提供從任務追蹤、甘特圖、OKR 目標到 AI 智慧分析的完整管理工具鏈，幫助團隊高效協作、即時掌握專案進度 [cite: 10]。

### [cite_start]1.2 主要功能模組 [cite: 11]
| 模組 | 功能說明 | 類型 |
|---|---|---|
| 首頁 Dashboard | [cite_start]專案健康燈號、工作負載熱圖、可行動洞察、30 秒自動更新 [cite: 12] | [cite_start]核心 [cite: 12] |
| 收件匣 | [cite_start]通知管理、@提及、書籤、封存、自訂分頁 [cite: 12] | [cite_start]溝通 [cite: 12] |
| 我的任務 | [cite_start]個人跨專案任務總覽、側面板編輯、拖曳排序 [cite: 12] | [cite_start]個人 [cite: 12] |
| 專案管理 | [cite_start]建立/編輯/歸檔專案、任務分節、成員管理 [cite: 12] | [cite_start]核心 [cite: 12] |
| 任務看板 | [cite_start]Kanban 拖曳板、狀態欄管理 [cite: 12] | [cite_start]任務 [cite: 12] |
| 甘特圖 | [cite_start]時程規劃、里程碑、依賴關係 [cite: 12] | [cite_start]規劃 [cite: 12] |
| 報告 | [cite_start]專案進度 / 任務統計 / 工時 / 里程碑報表、行內編輯 [cite: 12] | [cite_start]分析 [cite: 12] |
| 專案集 | [cite_start]多專案健康監控、狀態追蹤 [cite: 12] | [cite_start]管理 [cite: 12] |
| 目標 OKR | [cite_start]季度目標 KR、列表/樹狀視圖、進度環 [cite: 12] | [cite_start]策略 [cite: 12] |
| 工作負載 | [cite_start]成員任務分配熱圖、週/月視圖 [cite: 12] | [cite_start]資源 [cite: 12] |
| 自動化規則 | [cite_start]觸發條件 → 條件判斷 → 動作設定 [cite: 12] | [cite_start]自動化 [cite: 12] |
| 表單 | [cite_start]標準化請求入口、提交即建任務 [cite: 12] | [cite_start]流程 [cite: 12] |
| 自訂欄位 | [cite_start]追蹤優先度、階段、工時等自訂資料 [cite: 12] | [cite_start]客製化 [cite: 12] |
| 工作流程圖 | [cite_start]泳道圖、視覺化流程設計、BPMN 風格 [cite: 12] | [cite_start]流程 [cite: 12] |
| 工時記錄 | [cite_start]人員工時統計、計費分析 [cite: 12] | [cite_start]財務 [cite: 12] |
| 團隊 | [cite_start]成員帳號管理、角色權限設定 [cite: 12] | [cite_start]管理 [cite: 12] |
| 設定 | [cite_start]公司資訊、個人資料、整合服務（M365）、系統狀態 [cite: 12] | [cite_start]系統 [cite: 12] |
| AI 決策中心 | [cite_start]AI 風險分析、智慧建議、多模型支援 [cite: 12] | [cite_start]AI [cite: 12] |
| MCP 控制台 | [cite_start]Claude Desktop 直接操作系統 [cite: 12] | [cite_start]進階 [cite: 12] |

### [cite_start]1.3 系統架構 [cite: 13]
| 層級 | 技術棧 | 說明 |
|---|---|---|
| 前端 | [cite_start]React 18 + Vite [cite: 14] | [cite_start]21 個頁面模組，CSS Variables 主題 [cite: 14] |
| 後端 | [cite_start]Node.js 20 + Express [cite: 14] | [cite_start]REST API，Prisma ORM [cite: 14] |
| 資料庫 | [cite_start]PostgreSQL 15 [cite: 14] | [cite_start]主資料儲存，6 個健康 VIEW [cite: 14] |
| 快取 | [cite_start]Redis 7 [cite: 14] | [cite_start]Session、即時計數 [cite: 14] |
| 認證 | [cite_start]JWT（8 小時有效） [cite: 14] [cite_start]| bcrypt 密碼驗證 [cite: 14] |
| 容器 | [cite_start]Docker + Docker Compose [cite: 14] | [cite_start]Nginx 反向代理 [cite: 14] |

## [cite_start]第 2 章 登入與帳號 [cite: 15]
* [cite_start]**登入**：輸入電子郵件與密碼（初始帳號 `admin@company.com` / `Admin@123456`），可勾選「記住我」延長至 7 天狀態 [cite: 19, 20, 21, 24]。
* [cite_start]**修改密碼**：至「設定 → 個人資料」輸入新舊密碼並儲存 [cite: 26, 27, 28, 29]。

## [cite_start]第 3 章 首頁 Dashboard [cite: 37]
[cite_start]首頁每 30 秒自動更新 [cite: 39]。包含：
* [cite_start]**摘要統計卡片**：顯示進行中、逾期、本週完成任務數及工作負載 [cite: 42]。
* [cite_start]**我的任務 Widget**：最多 5 筆待辦清單 [cite: 44]。
* [cite_start]**專案進度 Widget**：顯示完成率進度條及逾期警告 [cite: 49, 51, 53]。
* [cite_start]**健康狀態圓餅圖**：專案健康分佈（綠/黃/紅） [cite: 56]。
* [cite_start]**工作負載熱圖**：以顏色區分負載量（綠：1-3，橙：4-6，紅：7+） [cite: 58, 59, 60, 61]。
* [cite_start]**AI 可行動洞察**：分析風險並給出建議 [cite: 63, 64]。

## 第 4-21 章 核心模組操作簡介
*(以下節錄各模組重點)*
* [cite_start]**收件匣**：集中管理通知（指派、提及、留言等），可設定書籤與封存 [cite: 71, 73, 75]。
* [cite_start]**我的任務**：個人工作檢視中心，支援側面板快速編輯與完成 [cite: 93, 100, 101]。
* [cite_start]**專案管理**：建立專案、分節管理（Sprint）、歸檔與刪除（刪除無法復原） [cite: 122, 139, 145]。
* [cite_start]**看板與甘特圖**： Kanban 拖曳狀態 [cite: 150, 153][cite_start]；甘特圖視覺化時間軸與里程碑 [cite: 162, 169]。
* [cite_start]**報表與專案集**：多維度進度與工時分析 [cite: 176][cite_start]，並以專案集監控多專案健康狀態（On Track, At Risk, Off Track） [cite: 192, 196]。
* [cite_start]**AI 與自動化**：自動化規則設定觸發條件 [cite: 234, 237][cite_start]；AI 決策中心提供風險掃描（支援 GPT-4o, Claude 等） [cite: 347, 349, 352]。
* [cite_start]**MCP 控制台**：讓 Claude Desktop 直接操作系統 [cite: 356]。

## [cite_start]第 22 章 鍵盤快捷鍵 [cite: 367]
| 快捷鍵 | 功能 |
|---|---|
| `/` 或 `Ctrl+K` | [cite_start]開啟全域搜尋 [cite: 369] |
| `Esc` | [cite_start]關閉彈窗 / 側面板 [cite: 369] |
| `G + H` | [cite_start]前往首頁 [cite: 373] |
| `Enter` | [cite_start]開啟選中任務詳情 [cite: 371] |

[cite_start]*(詳細問題與術語表請參閱原文件附錄 A 與 FAQ)* [cite: 374, 394]