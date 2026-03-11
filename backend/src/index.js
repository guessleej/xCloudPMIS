/**
 * xCloudPMIS 後端主程式
 * 基於 Express 框架的 API 伺服器
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

// ── 路由模組 ─────────────────────────────────────────────────
const dashboardRouter     = require('./routes/dashboard');
const projectsRouter      = require('./routes/projects');
const ganttRouter         = require('./routes/gantt');
const timeTrackingRouter  = require('./routes/time-tracking');
const reportsRouter       = require('./routes/reports');
const teamRouter          = require('./routes/team');
const settingsRouter      = require('./routes/settings');
const aiDecisionsRouter   = require('./routes/aiDecisions');
const healthRouter        = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 中介軟體設定 ─────────────────────────────────────────────
// 跨來源資源共用（CORS）：允許前端（埠 3001）呼叫後端 API
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
}));
// 解析 JSON 格式的請求主體
app.use(express.json());

// ── PostgreSQL 連線池設定 ───────────────────────────────────
// 使用「連線池」而不是單一連線，可以同時處理多個請求
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'pmis_db',
  user:     process.env.DB_USER     || 'pmis_user',
  password: process.env.DB_PASSWORD || 'pmis_password',
  max: 10,              // 最多同時 10 個連線
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

// ── 任務看板 & 使用者 API（跨專案，獨立路徑） ─────────────
// projectsRouter 的 GET /tasks 和 GET /users 因為掛在 /api/projects 下
// 實際路徑是 /api/projects/tasks 與 /api/projects/users
// 前端直接用這個路徑呼叫即可

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
app.listen(PORT, () => {
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
  console.log('');
});
