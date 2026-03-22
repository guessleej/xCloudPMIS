/**
 * files.js — 我的任務 > 檔案 CRUD
 * GET    /api/my-files          列出當前使用者的所有檔案
 * POST   /api/my-files          上傳一個或多個檔案（multipart/form-data）
 * DELETE /api/my-files/:id      刪除指定檔案（同時刪除磁碟檔案）
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// BigInt → Number（PostgreSQL BIGINT 欄位會以 JS BigInt 回傳，JSON.stringify 不支援）
function sanitize(rows) {
  return rows.map(r => ({
    ...r,
    id:              Number(r.id),
    file_size_bytes: Number(r.file_size_bytes),
  }));
}

// ── 上傳目錄（volume-mounted，重啟後持久保存）────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer storage ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── GET /api/my-files ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 4;
    const rows = await prisma.$queryRaw`
      SELECT id, original_name, stored_name, mime_type,
             file_size_bytes, ext, created_at
      FROM my_files
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    res.json({ success: true, data: sanitize(rows) });
  } catch (err) {
    console.error('[files] GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/my-files ───────────────────────────────────────
router.post('/', upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '未收到任何檔案' });
    }
    const userId = parseInt(req.body.userId) || 4;
    const inserted = [];

    for (const file of req.files) {
      // multer 以 latin1 解碼 HTTP header，需轉回 UTF-8 才能正確儲存中文檔名
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(originalName).toLowerCase().replace('.', '');
      const rows = await prisma.$queryRaw`
        INSERT INTO my_files
          (user_id, original_name, stored_name, mime_type, file_size_bytes, file_path, ext)
        VALUES
          (${userId}, ${originalName}, ${file.filename},
           ${file.mimetype}, ${BigInt(file.size)}, ${file.path}, ${ext})
        RETURNING id, original_name, stored_name, mime_type, file_size_bytes, ext, created_at
      `;
      inserted.push(rows[0]);
    }

    res.status(201).json({ success: true, data: sanitize(inserted) });
  } catch (err) {
    console.error('[files] POST error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/my-files/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const userId = parseInt(req.query.userId) || 4;

    const rows = await prisma.$queryRaw`
      SELECT stored_name FROM my_files WHERE id=${id} AND user_id=${userId}
    `;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: '找不到此檔案' });
    }

    // 刪除磁碟檔案
    const filePath = path.join(UPLOAD_DIR, rows[0].stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // 刪除資料庫記錄
    await prisma.$executeRaw`DELETE FROM my_files WHERE id=${id} AND user_id=${userId}`;

    res.json({ success: true });
  } catch (err) {
    console.error('[files] DELETE error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
