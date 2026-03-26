'use strict';
/**
 * pmis-file-service
 * ─────────────────────────────────────────────────────────────
 * 獨立檔案處理服務 — 將大檔案 I/O 從主後端抽離
 *
 * 職責：
 *   - 接受 multipart/form-data 上傳，使用 multer 處理磁碟 I/O
 *   - 大型工程圖檔（PDF/DWG）傳輸不再佔用主 Express event loop
 *   - 共享 uploads_data volume，主後端仍可讀取已存在的檔案
 *   - 未來可獨立擴展（加入 MinIO、S3 等物件儲存）
 *
 * 端點：
 *   POST /upload           - 上傳檔案（multipart/form-data，欄位名 "files"）
 *   GET  /download/:stored - 下載指定存檔名稱的檔案
 *   DELETE /:stored        - 刪除指定存檔名稱的檔案
 *   GET  /health           - 服務健康檢查
 *
 * 認證：
 *   x-internal-secret 標頭（服務間共享秘鑰）
 */

require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── 服務間認證 ───────────────────────────────────────────────
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'pmis-internal-secret-dev';

// ── 上傳目錄設定（與主後端共享 Volume）──────────────────────
const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/uploads';
const SUBDIRS     = ['my-files', 'task-attachments', 'general'];

// 確保所有子目錄存在
for (const sub of SUBDIRS) {
  const dir = path.join(UPLOAD_ROOT, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Multer 設定 ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = req.query.subdir || 'general';
    const validSubdir = SUBDIRS.includes(subdir) ? subdir : 'general';
    cb(null, path.join(UPLOAD_ROOT, validSubdir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB（工程圖檔較大）
    files: 20,
  },
  fileFilter: (req, file, cb) => {
    // 允許常見工程/辦公文件格式
    const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/', 'text/'];
    const allowed = ALLOWED_MIME_PREFIXES.some(p => file.mimetype.startsWith(p));
    cb(null, allowed);
  },
});

// ── 中介軟體 ─────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: '未授權' });
  }
  next();
});

// ════════════════════════════════════════════════════════════
// POST /upload  — 上傳檔案（支援批次上傳）
// ════════════════════════════════════════════════════════════

app.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '未收到任何檔案' });
    }

    const subdir = req.query.subdir || 'general';
    const results = req.files.map(file => {
      // multer 以 latin1 解碼 HTTP header → 轉回 UTF-8（中文檔名）
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(originalName).toLowerCase().replace('.', '');

      return {
        storedName:    file.filename,
        originalName,
        mimetype:      file.mimetype,
        size:          file.size,
        ext,
        subdir,
        storedPath:    file.path,
        downloadUrl:   `/download/${file.filename}?subdir=${subdir}`,
      };
    });

    res.status(201).json({ success: true, data: results });
  } catch (err) {
    console.error('[FILE-SVC] upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /download/:storedName  — 下載 / 串流檔案
// ════════════════════════════════════════════════════════════

app.get('/download/:storedName', (req, res) => {
  try {
    const { storedName } = req.params;
    const subdir = req.query.subdir || 'general';

    // 防範 path traversal 攻擊
    if (storedName.includes('..') || storedName.includes('/')) {
      return res.status(400).json({ error: '無效的檔名' });
    }

    const validSubdir = SUBDIRS.includes(subdir) ? subdir : 'general';
    const filePath = path.join(UPLOAD_ROOT, validSubdir, storedName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '找不到檔案' });
    }

    // 透過 Express sendFile 串流（不會一次載入全部到記憶體）
    const originalName = req.query.originalName || storedName;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('[FILE-SVC] download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /:storedName  — 刪除檔案
// ════════════════════════════════════════════════════════════

app.delete('/:storedName', (req, res) => {
  try {
    const { storedName } = req.params;
    const subdir = req.query.subdir || 'general';

    if (storedName.includes('..') || storedName.includes('/')) {
      return res.status(400).json({ error: '無效的檔名' });
    }

    const validSubdir = SUBDIRS.includes(subdir) ? subdir : 'general';
    const filePath = path.join(UPLOAD_ROOT, validSubdir, storedName);

    if (!fs.existsSync(filePath)) {
      return res.json({ success: true, message: '檔案不存在（已刪除）' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error('[FILE-SVC] delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 健康檢查
// ════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  const uploadDirOk = fs.existsSync(UPLOAD_ROOT);
  res.json({
    status:    uploadDirOk ? 'ok' : 'degraded',
    service:   'pmis-file-service',
    uploadDir: UPLOAD_ROOT,
    uptime:    Math.floor(process.uptime()) + ' 秒',
  });
});

// ════════════════════════════════════════════════════════════
// 啟動
// ════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   xCloudPMIS 檔案服務已啟動           ║');
  console.log(`║   http://localhost:${PORT}                ║`);
  console.log(`║   上傳目錄：${UPLOAD_ROOT}         ║`);
  console.log('╚══════════════════════════════════════╝');
});
