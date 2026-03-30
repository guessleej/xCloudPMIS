/**
 * xCloudPMIS 後端主程式
 * 基於 Express 框架的 API 伺服器
 */

// ── 環境變數載入（非 Docker 本機開發用）───────────────────────
// Docker 環境已透過 docker-compose.yml environment 注入，不需要 dotenv
// 但本機直接執行 `node src/index.js` 或 `nodemon` 時，需從 .env 載入
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') }); // worktree 根目錄
require('dotenv').config({ path: path.join(__dirname, '../.env') });    // backend/ 目錄（備用）

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
const { Pool } = require('pg');
const redis = require('redis');

// ── 路由模組 ─────────────────────────────────────────────────
const dashboardRouter     = require('./routes/dashboard');
const workloadRouter      = require('./routes/workload');
const projectsRouter      = require('./routes/projects');
const ganttRouter         = require('./routes/gantt');
const timeTrackingRouter  = require('./routes/time-tracking');
const reportsRouter       = require('./routes/reports');
const teamRouter          = require('./routes/team');
const settingsRouter      = require('./routes/settings');
const aiDecisionsRouter   = require('./routes/aiDecisions');
const healthRouter        = require('./routes/health');
const microsoftAuthRouter = require('./routes/auth/microsoft');
const adminMcpRouter      = require('./routes/adminMcp');
const tasksRouter         = require('./routes/tasks');
const myTasksRouter       = require('./routes/myTasks');
const usersRouter         = require('./routes/users');
const notificationsRouter = require('./routes/notifications');
const rulesRouter         = require('./routes/rules');
const goalsRouter         = require('./routes/goals');
const portfoliosRouter    = require('./routes/portfolios');
const authRouter          = require('./routes/auth/login');
const customFieldsRouter  = require('./routes/custom-fields');
const workflowRouter      = require('./routes/workflow');
const formsRouter         = require('./routes/forms');
const adminUsersRouter    = require('./routes/admin/users');
const myFilesRouter       = require('./routes/files');
const optionalAuth        = require('./middleware/optionalAuth');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── Socket.io WebSocket 伺服器 ───────────────────────────────
// 取代前端 polling，提供即時推播（通知、儀表板更新）
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ['http://localhost:3838', 'http://127.0.0.1:3838',
             'http://host.docker.internal:3838'],
    credentials: true,
  },
  path: '/ws',
});

io.on('connection', (socket) => {
  const { companyId, userId } = socket.handshake.query;

  // 每個公司一個房間，同公司用戶共享即時事件
  if (companyId) {
    socket.join(`company:${companyId}`);
  }
  // 個人房間，用於個人通知推播
  if (userId) {
    socket.join(`user:${userId}`);
  }

  socket.on('disconnect', () => {});
});

// 掛載到 app，供其他模組使用
app.set('io', io);

// ── 中介軟體設定 ─────────────────────────────────────────────
// 跨來源資源共用（CORS）：允許前端（埠 3838）呼叫後端 API
app.use(cors({
  origin: ['http://localhost:3838', 'http://127.0.0.1:3838',
           'http://host.docker.internal:3838'],
  credentials: true,
}));
// 解析 JSON 格式的請求主體
app.use(express.json());
// Optional JWT 解析：有 Token 時注入 req.user，無 Token 繼續執行
// 讓所有路由都可用 req.user?.companyId 取得登入者的公司 ID
app.use(optionalAuth);

// ── PostgreSQL 連線池設定 ───────────────────────────────────
// 使用「連線池」而不是單一連線，可以同時處理多個請求
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'pmis_db',
  user:     process.env.DB_USER     || 'pmis_user',
  password: process.env.DB_PASSWORD || 'pmis_password',
  max: 25,              // 最多同時 25 個連線（支援 50+ 併發用戶）
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Redis 客戶端設定 ────────────────────────────────────────
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

// Redis 連線錯誤處理
redisClient.on('error', (err) => {
  console.error('❌ Redis 連線錯誤:', err.message);
});

// 非同步啟動 Redis 連線
redisClient.connect()
  .then(() => console.log('✅ Redis 連線成功'))
  .catch((err) => console.error('❌ Redis 無法連線:', err.message));

// ═══════════════════════════════════════════════════════════
// API 路由定義
// ═══════════════════════════════════════════════════════════

/**
 * GET /health
 * 健康檢查端點 — Docker healthcheck 會呼叫這個
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pmis-backend',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + ' 秒',
  });
});

/**
 * GET /api/status
 * 系統狀態 — 顯示所有服務的連線狀況
 */
app.get('/api/status', async (req, res) => {
  const result = {
    backend: { status: 'ok', version: '1.0.0' },
    database: { status: 'unknown' },
    cache: { status: 'unknown' },
  };

  // 測試資料庫連線
  try {
    const dbResult = await pool.query('SELECT NOW() as time, version() as version');
    result.database = {
      status: 'ok',
      time: dbResult.rows[0].time,
      version: dbResult.rows[0].version.split(' ').slice(0, 2).join(' '),
    };
  } catch (err) {
    result.database = { status: 'error', message: err.message };
  }

  // 測試 Redis 連線
  try {
    await redisClient.set('healthcheck', 'ok', { EX: 10 });
    const value = await redisClient.get('healthcheck');
    result.cache = {
      status: value === 'ok' ? 'ok' : 'error',
      message: 'Redis 讀寫正常',
    };
  } catch (err) {
    result.cache = { status: 'error', message: err.message };
  }

  const allOk = Object.values(result).every(s => s.status === 'ok');
  res.status(allOk ? 200 : 503).json(result);
});

// ── 儀表板路由 ──────────────────────────────────────────────
app.use('/api/dashboard', dashboardRouter);

// ── 資源分配矩陣路由 ─────────────────────────────────────────
// GET /api/workload/matrix?companyId=N  → 指派對象 × 任務狀態矩陣
app.use('/api/workload', workloadRouter);

// ── 專案路由（含任務） ──────────────────────────────────────
app.use('/api/projects', projectsRouter);

// ── 甘特圖路由 ──────────────────────────────────────────────
app.use('/api/gantt', ganttRouter);

// ── 工時記錄路由 ─────────────────────────────────────────────
app.use('/api/time-tracking', timeTrackingRouter);

// ── 報表匯出路由 ─────────────────────────────────────────────
app.use('/api/reports', reportsRouter);

// ── 團隊管理路由 ─────────────────────────────────────────────
app.use('/api/team', teamRouter);

// ── 系統設定路由 ─────────────────────────────────────────────
app.use('/api/settings', settingsRouter);

// ── AI 決策中心路由（Human-in-the-Loop 控制台）───────────────
app.use('/api/ai', aiDecisionsRouter);

// ── 健康檢查路由（Email / Graph API 連線狀態）────────────────
app.use('/api/health', healthRouter);

// ── MCP 統一控制台 Admin API ─────────────────────────────────
// status / sessions / tools / logs / api-keys
app.use('/api/admin/mcp', adminMcpRouter);

// ── Microsoft OAuth 2.0 Delegated 授權路由 ───────────────────
// GET    /auth/microsoft            → 發起 OAuth 流程
// GET    /auth/microsoft/callback   → OAuth 回呼（交換 Token）
// GET    /auth/microsoft/status     → 查詢連線狀態
// DELETE /auth/microsoft/revoke     → 撤銷授權
app.use('/auth/microsoft', microsoftAuthRouter);

// ── 任務列表路由（MyTasksPage 專用，純陣列格式）─────────────
// GET /api/tasks?companyId=2 → 回傳任務純陣列（含 section 分區欄位）
app.use('/api/tasks', tasksRouter);

// ── 我的任務路由（清單/看板/檔案/附件）──────────────────────
app.use('/api/my-tasks', myTasksRouter);

// ── 使用者列表路由（ProjectsPage 指派人選單用）───────────────
// GET /api/users?companyId=2 → 回傳 {success, data, meta} 格式
app.use('/api/users', usersRouter);

// ── 通知路由 ──────────────────────────────────────────────────
// GET    /api/notifications              → 通知列表（含篩選、分頁）
// GET    /api/notifications/unread-count → 未讀數量
// PATCH  /api/notifications/:id/read    → 標記已讀
// PATCH  /api/notifications/read-all   → 全部已讀
// POST   /api/notifications             → 建立通知（系統/測試用）
// DELETE /api/notifications/:id         → 刪除通知
app.use('/api/notifications', notificationsRouter);

// ── 自動化規則路由 ────────────────────────────────────────────
// GET    /api/rules              → 規則列表（含系統內建規則）
// POST   /api/rules              → 建立規則
// PATCH  /api/rules/:id          → 更新規則
// DELETE /api/rules/:id          → 刪除規則
app.use('/api/rules', rulesRouter);

// ── OKR 目標路由 ──────────────────────────────────────────────
// GET    /api/goals?companyId=N  → OKR 列表
// POST   /api/goals              → 建立 Objective
// PATCH  /api/goals/:id          → 更新 Objective
// DELETE /api/goals/:id          → 刪除 Objective
// POST   /api/goals/:id/key-results            → 新增 KR
// PATCH  /api/goals/:id/key-results/:krId      → 更新 KR
// DELETE /api/goals/:id/key-results/:krId      → 刪除 KR
app.use('/api/goals', goalsRouter);

// ── 專案集路由 ────────────────────────────────────────────────
// GET /api/portfolios?companyId=N → 多專案健康監控
app.use('/api/portfolios', portfoliosRouter);

// ── 身分驗證路由 ─────────────────────────────────────────────
// POST /api/auth/login  → Email/密碼登入，回傳 JWT
// GET  /api/auth/me     → 驗證 token 並回傳當前使用者資訊
// POST /api/auth/logout → 登出（前端清除 token）
app.use('/api/auth', authRouter);

// ── 自訂欄位路由 ──────────────────────────────────────────────
// GET    /api/custom-fields?companyId=N  → 欄位列表
// POST   /api/custom-fields              → 新增欄位
// PATCH  /api/custom-fields/:id          → 更新欄位
// DELETE /api/custom-fields/:id          → 封存欄位
app.use('/api/custom-fields', customFieldsRouter);

// ── 工作流程路由 ──────────────────────────────────────────────
// GET    /api/workflow?companyId=N  → 流程列表
// POST   /api/workflow              → 建立流程
// PATCH  /api/workflow/:id          → 更新流程
// DELETE /api/workflow/:id          → 刪除流程
app.use('/api/workflow', workflowRouter);

// ── 表單管理路由 ──────────────────────────────────────────────
// GET    /api/forms?companyId=N  → 表單列表
// POST   /api/forms              → 建立表單
// PATCH  /api/forms/:id          → 更新表單
// DELETE /api/forms/:id          → 刪除表單
app.use('/api/forms', formsRouter);

// ── 管理員使用者管理路由（Admin 專用）──────────────────────────
// GET    /api/admin/users              → 使用者列表（搜尋/篩選/分頁）
// GET    /api/admin/users/stats        → 統計數字
// POST   /api/admin/users              → 建立使用者
// GET    /api/admin/users/:id          → 使用者詳情
// PUT    /api/admin/users/:id          → 更新使用者
// PATCH  /api/admin/users/:id/toggle   → 停用/啟用使用者
// POST   /api/admin/users/:id/reset-password → 重設密碼
// DELETE /api/admin/users/:id/oauth/:provider → 取消 OAuth 連結
app.use('/api/admin/users', adminUsersRouter);

// ── 我的任務 > 檔案管理路由 ──────────────────────────────────
// GET    /api/my-files           → 列出當前使用者的所有檔案
// POST   /api/my-files           → 上傳檔案（multipart/form-data）
// DELETE /api/my-files/:id       → 刪除指定檔案
app.use('/api/my-files', myFilesRouter);

// ── 404 處理 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: '找不到此 API 路由',
    path: req.path,
    hint: '請參考 API 文件',
  });
});

// ── 全域錯誤處理 ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ 未預期的錯誤:', err);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

// ── 啟動伺服器 ──────────────────────────────────────────────
httpServer.listen(PORT, () => {
  // 服務啟動後，恢復被中斷的 AI 決策執行（防止 nodemon/崩潰導致卡在 approved/executing 狀態）
  try {
    const SafetyGuard = require('./services/autonomous-agent/decisionEngine/safetyGuard');
    SafetyGuard.recoverInterruptedDecisions().catch(err =>
      console.error('[Startup] SafetyGuard 恢復任務失敗:', err.message)
    );
  } catch (err) {
    console.error('[Startup] 無法載入 SafetyGuard:', err.message);
  }

  console.log('');
  console.log('╔════════════════════════════════════╗');
  console.log('║   xCloudPMIS 後端服務已啟動         ║');
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log('╚════════════════════════════════════╝');
  console.log('');
  console.log('📋 可用的 API 端點：');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  GET  http://localhost:${PORT}/api/status`);
  console.log(`  GET  http://localhost:${PORT}/api/projects`);
  console.log(`  POST http://localhost:${PORT}/api/projects`);
  console.log(`  GET  http://localhost:${PORT}/api/dashboard/executive-summary`);
  console.log(`  GET  http://localhost:${PORT}/api/dashboard/projects-health`);
  console.log(`  GET  http://localhost:${PORT}/api/dashboard/workload`);
  console.log(`  GET  http://localhost:${PORT}/api/dashboard/actionable-insights`);
  console.log(`  GET  http://localhost:${PORT}/api/gantt`);
  console.log(`  GET  http://localhost:${PORT}/api/time-tracking`);
  console.log(`  GET  http://localhost:${PORT}/api/time-tracking/tasks`);
  console.log(`  POST http://localhost:${PORT}/api/time-tracking/start`);
  console.log(`  POST http://localhost:${PORT}/api/time-tracking`);
  console.log(`  GET  http://localhost:${PORT}/api/reports/projects`);
  console.log(`  GET  http://localhost:${PORT}/api/reports/tasks`);
  console.log(`  GET  http://localhost:${PORT}/api/reports/timelog`);
  console.log(`  GET  http://localhost:${PORT}/api/reports/milestones`);
  console.log(`  GET  http://localhost:${PORT}/api/team`);
  console.log(`  GET  http://localhost:${PORT}/api/team/:id`);
  console.log(`  POST http://localhost:${PORT}/api/team`);
  console.log(`  GET  http://localhost:${PORT}/api/settings/company`);
  console.log(`  GET  http://localhost:${PORT}/api/settings/profile`);
  console.log(`  GET  http://localhost:${PORT}/api/settings/system`);
  console.log(`  GET  http://localhost:${PORT}/api/tasks`);
  console.log(`  GET  http://localhost:${PORT}/api/users`);
  console.log(`  GET  http://localhost:${PORT}/api/notifications`);
  console.log(`  GET  http://localhost:${PORT}/api/notifications/unread-count`);
  console.log('');
  console.log('🔑 身分驗證端點：');
  console.log(`  POST http://localhost:${PORT}/api/auth/login   (Email/密碼登入)`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/me      (驗證 Token)`);
  console.log(`  POST http://localhost:${PORT}/api/auth/logout  (登出)`);
  console.log('');
  console.log('🔐 Microsoft OAuth 端點：');
  console.log(`  GET    http://localhost:${PORT}/auth/microsoft         (發起授權)`);
  console.log(`  GET    http://localhost:${PORT}/auth/microsoft/callback (OAuth 回呼)`);
  console.log(`  GET    http://localhost:${PORT}/auth/microsoft/status   (連線狀態)`);
  console.log(`  DELETE http://localhost:${PORT}/auth/microsoft/revoke   (撤銷授權)`);
  console.log('');
});
