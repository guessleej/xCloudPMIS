/**
 * xCloudPMIS 後端主程式
 * Express API 伺服器
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

// ── 路由模組 ─────────────────────────────────────────────────
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 中介軟體 (Middleware) 設定 ──────────────────────────────
// CORS：允許前端（port 3001）呼叫後端 API
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
}));
// 解析 JSON 格式的 request body
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

/**
 * GET /api/projects
 * 取得所有專案（示範 API，之後會加入認證）
 */
app.get('/api/projects', async (req, res) => {
  try {
    // 先從 Redis 快取查詢
    const cached = await redisClient.get('projects:all').catch(() => null);
    if (cached) {
      return res.json({
        source: 'cache',
        data: JSON.parse(cached),
      });
    }

    // 從資料庫查詢
    const result = await pool.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );

    // 將結果存入快取（60 秒後過期）
    await redisClient.set('projects:all', JSON.stringify(result.rows), { EX: 60 })
      .catch(() => {});  // 快取失敗不影響主流程

    res.json({
      source: 'database',
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects
 * 建立新專案（示範）
 */
app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: '專案名稱為必填欄位' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || '']
    );

    // 清除快取（因為資料已更新）
    await redisClient.del('projects:all').catch(() => {});

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 儀表板路由 ──────────────────────────────────────────────
app.use('/api/dashboard', dashboardRouter);

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
  console.log('');
});
