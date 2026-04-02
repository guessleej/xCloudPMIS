/**
 * 系統設定路由
 *
 * 端點列表：
 *   GET    /api/settings/company           → 取得公司資訊
 *   PATCH  /api/settings/company/:id       → 更新公司名稱
 *   GET    /api/settings/profile           → 取得個人資料（?userId=）
 *   PATCH  /api/settings/profile/:id       → 更新個人資料（姓名、Email、密碼）
 *   GET    /api/settings/system            → 系統健康狀態 + 資料統計
 */

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt  = require('bcryptjs');
const OpenAI  = require('openai');
const prisma  = new PrismaClient();
const {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} = require('../services/notificationCenter');

// AI 客戶端（透過 ai-service，含熔斷降級）
const getAiAgent = () => require('../services/aiClient');

// ════════════════════════════════════════════════════════════
// GET /api/settings/company?companyId=2
// 取得公司資訊
// ════════════════════════════════════════════════════════════
router.get('/company', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    if (!companyId) return res.status(400).json({ success: false, error: 'companyId 為必填' });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id:        true,
        name:      true,
        slug:      true,
        logoUrl:   true,
        isActive:  true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: `找不到公司 #${companyId}` });
    }

    res.json({
      company: {
        ...company,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ 取得公司資訊失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/settings/company/:id
// 更新公司名稱與識別代碼
// Body: { name?, slug? }
// ════════════════════════════════════════════════════════════
router.patch('/company/:id', async (req, res) => {
  try {
    const id         = parseInt(req.params.id);
    const { name, slug } = req.body;

    if (!name?.trim() && !slug?.trim()) {
      return res.status(400).json({ error: '請至少提供 name 或 slug' });
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: `找不到公司 #${id}` });
    }

    // Slug 格式驗證：只允許英數字與連字號，3~50 字元
    if (slug !== undefined) {
      const slugTrimmed = slug.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slugTrimmed)) {
        return res.status(400).json({ error: 'Slug 格式錯誤：只允許英文小寫、數字與連字號（-），長度 3~50 字元，且不可以連字號開頭或結尾' });
      }
      // 唯一性檢查
      const conflict = await prisma.company.findFirst({
        where: { slug: slugTrimmed, NOT: { id } },
      });
      if (conflict) {
        return res.status(409).json({ error: `識別代碼「${slugTrimmed}」已被使用，請選擇其他名稱` });
      }
    }

    const data = {};
    if (name?.trim())  data.name = name.trim();
    if (slug !== undefined) data.slug = slug.trim().toLowerCase();

    const updated = await prisma.company.update({
      where: { id },
      data,
      select: { id: true, name: true, slug: true, updatedAt: true },
    });

    const parts = [];
    if (data.name) parts.push(`公司名稱「${data.name}」`);
    if (data.slug) parts.push(`識別代碼「${data.slug}」`);

    res.json({
      company: { ...updated, updatedAt: updated.updatedAt.toISOString() },
      message: `已更新：${parts.join('、')}`,
    });
  } catch (err) {
    console.error('❌ 更新公司設定失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/profile?userId=4
// 取得個人資料
// ════════════════════════════════════════════════════════════
router.get('/profile', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 4;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:          true,
        name:        true,
        email:       true,
        role:        true,
        isActive:    true,
        avatarUrl:   true,
        department:  true,
        phone:       true,
        jobTitle:    true,
        joinedAt:    true,
        lastLoginAt: true,
        createdAt:   true,
        updatedAt:   true,
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: `找不到使用者 #${userId}` });
    }

    const ROLE_LABEL = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };

    res.json({
      profile: {
        ...user,
        roleLabel:   ROLE_LABEL[user.role] || user.role,
        joinedAt:    user.joinedAt    ? user.joinedAt.toISOString().split('T')[0] : null,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt:   user.createdAt.toISOString(),
        updatedAt:   user.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ 取得個人資料失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PATCH /api/settings/profile/:id
// 更新個人資料
// Body: { name?, email?, currentPassword?, newPassword? }
// ════════════════════════════════════════════════════════════
router.patch('/profile/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, currentPassword, newPassword, department, phone, jobTitle, joinedAt } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: `找不到使用者 #${id}` });
    }

    const updates = {};

    // ── 更新姓名 ────────────────────────────────────────────
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: '姓名不能為空' });
      updates.name = name.trim();
    }

    // ── 更新 Email ──────────────────────────────────────────
    if (email !== undefined) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        return res.status(400).json({ error: 'Email 格式不正確' });
      }
      // 檢查 email 是否被其他人使用
      const existing = await prisma.user.findFirst({
        where: { email: email.trim().toLowerCase(), NOT: { id } },
      });
      if (existing) {
        return res.status(409).json({ error: '此 Email 已被其他帳號使用' });
      }
      updates.email = email.trim().toLowerCase();
    }

    // ── 更新密碼 ────────────────────────────────────────────
    if (newPassword !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({ error: '請輸入目前密碼以驗證身分' });
      }
      // 驗證目前密碼
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: '目前密碼輸入有誤' });
      }
      // 新密碼長度限制
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密碼至少需要 6 個字元' });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // ── 更新個人資料欄位 ─────────────────────────────────────
    if (department !== undefined) updates.department = department?.trim() || null;
    if (phone      !== undefined) updates.phone      = phone?.trim() || null;
    if (jobTitle   !== undefined) updates.jobTitle   = jobTitle?.trim() || null;
    if (joinedAt   !== undefined) {
      updates.joinedAt = joinedAt ? new Date(joinedAt) : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '沒有要更新的資料' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data:  updates,
      select: {
        id: true, name: true, email: true, role: true,
        department: true, phone: true, jobTitle: true, joinedAt: true,
        updatedAt: true,
      },
    });

    res.json({
      profile: {
        ...updated,
        joinedAt:  updated.joinedAt  ? updated.joinedAt.toISOString().split('T')[0] : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
      message: '個人資料已成功更新',
      passwordChanged: !!updates.passwordHash,
    });
  } catch (err) {
    console.error('❌ 更新個人資料失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/system?companyId=2
// 系統健康狀態 + 完整資料統計
// ════════════════════════════════════════════════════════════
router.get('/notifications', async (req, res) => {
  try {
    // JWT payload 使用 `id`；相容舊版 userId 欄位，也接受 query param 備用
    const userId = parseInt(req.user?.id || req.user?.userId || req.query.userId || '0', 10);
    if (!userId) {
      return res.status(401).json({ error: '需要有效登入 Token' });
    }

    const settings = await getUserNotificationSettings(prisma, userId);
    res.json({
      userId,
      settings,
      defaults: DEFAULT_NOTIFICATION_SETTINGS,
    });
  } catch (err) {
    console.error('❌ 取得通知設定失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

router.patch('/notifications/:id', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const actorUserId = parseInt(req.user?.id || req.user?.userId || '0', 10);

    if (!targetUserId) {
      return res.status(400).json({ error: '無效的使用者 ID' });
    }

    if (!actorUserId) {
      return res.status(401).json({ error: '需要有效登入 Token' });
    }

    if (actorUserId !== targetUserId) {
      return res.status(403).json({ error: '只能修改自己的通知設定' });
    }

    const settings = await updateUserNotificationSettings(prisma, targetUserId, req.body || {});
    res.json({
      success: true,
      userId: targetUserId,
      settings,
      message: '通知設定已更新',
    });
  } catch (err) {
    console.error('❌ 更新通知設定失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/system?companyId=2
// 系統健康狀態 + 完整資料統計
// ════════════════════════════════════════════════════════════
router.get('/system', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    if (!companyId) return res.status(400).json({ success: false, error: 'companyId 為必填' });
    const startTime = Date.now();

    // ── 資料庫健康檢查 ────────────────────────────────────
    let dbStatus = 'ok';
    let dbVersion = '';
    let dbLatencyMs = 0;
    try {
      const t0 = Date.now();
      const result = await prisma.$queryRaw`SELECT version() as ver, NOW() as now`;
      dbLatencyMs = Date.now() - t0;
      dbVersion = String(result[0].ver).split(' ').slice(0, 2).join(' ');
    } catch (e) {
      dbStatus  = 'error';
      dbVersion = e.message;
    }

    // ── 資料統計（當前公司） ───────────────────────────────
    const [
      userCount,
      activeUserCount,
      projectCount,
      taskCount,
      taskDoneCount,
      milestoneCount,
      milestoneAchievedCount,
      timeEntryCount,
      completedTimeEntryCount,
      tagCount,
      commentCount,
      activityLogCount,
    ] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId, isActive: true } }),
      prisma.project.count({ where: { companyId, deletedAt: null } }),
      prisma.task.count({
        where: { deletedAt: null, project: { companyId, deletedAt: null } },
      }),
      prisma.task.count({
        where: { status: 'done', deletedAt: null, project: { companyId, deletedAt: null } },
      }),
      prisma.milestone.count({
        where: { project: { companyId, deletedAt: null } },
      }),
      prisma.milestone.count({
        where: { isAchieved: true, project: { companyId, deletedAt: null } },
      }),
      prisma.timeEntry.count({
        where: { task: { project: { companyId } } },
      }),
      prisma.timeEntry.count({
        where: { endedAt: { not: null }, task: { project: { companyId } } },
      }),
      prisma.tag.count({ where: { companyId } }),
      prisma.comment.count({
        where: { deletedAt: null, task: { project: { companyId } } },
      }),
      prisma.activityLog.count({
        where: { task: { project: { companyId } } },
      }),
    ]);

    // ── 最後操作時間 ──────────────────────────────────────
    const [lastTask, lastTimeEntry, lastProject] = await Promise.all([
      prisma.task.findFirst({
        where:   { deletedAt: null, project: { companyId } },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
      prisma.timeEntry.findFirst({
        where:   { task: { project: { companyId } } },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
      prisma.project.findFirst({
        where:   { companyId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select:  { updatedAt: true },
      }),
    ]);

    const totalApiMs = Date.now() - startTime;

    res.json({
      health: {
        backend: {
          status:    'ok',
          version:   '2.0.0',
          uptime:    `${Math.floor(process.uptime())} 秒`,
          nodeVersion: process.version,
          latencyMs: totalApiMs,
        },
        database: {
          status:    dbStatus,
          version:   dbVersion,
          latencyMs: dbLatencyMs,
        },
      },
      stats: {
        users: {
          total:  userCount,
          active: activeUserCount,
        },
        projects: {
          total: projectCount,
        },
        tasks: {
          total:    taskCount,
          done:     taskDoneCount,
          doneRate: taskCount > 0 ? Math.round(taskDoneCount / taskCount * 100) : 0,
        },
        milestones: {
          total:    milestoneCount,
          achieved: milestoneAchievedCount,
        },
        timeEntries: {
          total:     timeEntryCount,
          completed: completedTimeEntryCount,
          active:    timeEntryCount - completedTimeEntryCount,
        },
        tags:         tagCount,
        comments:     commentCount,
        activityLogs: activityLogCount,
      },
      lastActivity: {
        taskUpdatedAt:      lastTask?.updatedAt?.toISOString()      || null,
        timeEntryUpdatedAt: lastTimeEntry?.updatedAt?.toISOString() || null,
        projectUpdatedAt:   lastProject?.updatedAt?.toISOString()   || null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ 系統資訊查詢失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/settings/ai?companyId=2
// 取得 AI 模型設定（API Key 遮罩，只顯示末 4 碼）
// ════════════════════════════════════════════════════════════
router.get('/ai', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    if (!companyId) return res.status(400).json({ success: false, error: 'companyId 為必填' });

    const record = await prisma.aiModelConfig.findFirst({
      where:   { companyId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    // ENV 預設值（當 DB 無紀錄時使用）
    const defaults = {
      provider:    'openai',
      baseUrl:     'https://api.openai.com/v1',
      apiKey:      '',
      modelHeavy:  process.env.AI_MODEL_HEAVY  || 'gpt-4o',
      modelLight:  process.env.AI_MODEL_LIGHT  || 'gpt-4o-mini',
      maxTokens:   parseInt(process.env.AI_MAX_TOKENS) || 2000,
      temperature: 0.3,
    };

    if (!record) {
      // 沒有 DB 設定，回傳 ENV 預設值（Key 只顯示有無，不洩漏內容）
      const envKey = process.env.OPENAI_API_KEY || '';
      return res.json({
        config: {
          ...defaults,
          apiKey:       envKey ? '•••••••••••' + envKey.slice(-4) : '',
          apiKeyIsSet:  !!envKey,
          source:       'env',
          id:           null,
          lastTestedAt: null,
          testResult:   null,
        },
      });
    }

    // 遮罩 API Key
    const rawKey    = record.apiKey || process.env.OPENAI_API_KEY || '';
    const maskedKey = rawKey ? '•••••••••••' + rawKey.slice(-4) : '';

    res.json({
      config: {
        id:          record.id,
        provider:    record.provider,
        baseUrl:     record.baseUrl,
        apiKey:      maskedKey,
        apiKeyIsSet: !!rawKey,
        modelHeavy:  record.modelHeavy,
        modelLight:  record.modelLight,
        maxTokens:   record.maxTokens,
        temperature: record.temperature,
        lastTestedAt: record.lastTestedAt ? record.lastTestedAt.toISOString() : null,
        testResult:   record.testResult,
        source:       'db',
        updatedAt:    record.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ 取得 AI 模型設定失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/settings/ai
// 儲存 AI 模型設定（upsert）
// Body: { companyId, provider, baseUrl, apiKey?, modelHeavy, modelLight, maxTokens, temperature }
// 注意：apiKey 若為遮罩格式（含 •），視為「不變更」
// ════════════════════════════════════════════════════════════
router.put('/ai', async (req, res) => {
  try {
    const {
      companyId   = 2,
      provider    = 'openai',
      baseUrl     = 'https://api.openai.com/v1',
      apiKey,
      modelHeavy  = 'gpt-4o',
      modelLight  = 'gpt-4o-mini',
      maxTokens   = 2000,
      temperature = 0.3,
    } = req.body;

    // 驗證必填欄位
    if (!modelHeavy || !modelLight) {
      return res.status(400).json({ error: '模型名稱（modelHeavy / modelLight）不能為空' });
    }
    if (maxTokens < 256 || maxTokens > 32000) {
      return res.status(400).json({ error: 'maxTokens 需在 256 ~ 32000 之間' });
    }
    if (temperature < 0 || temperature > 2) {
      return res.status(400).json({ error: 'temperature 需在 0 ~ 2 之間' });
    }

    // 驗證 companyId 存在
    const company = await prisma.company.findUnique({ where: { id: parseInt(companyId) } });
    if (!company) {
      return res.status(404).json({ error: `找不到公司 #${companyId}` });
    }

    // 取得現有設定（判斷 API Key 是否需要更新）
    const existing = await prisma.aiModelConfig.findFirst({
      where:   { companyId: parseInt(companyId), isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 若 apiKey 含遮罩符號（•），視為「不變更 Key」，保留舊值
    const isKeyMasked = typeof apiKey === 'string' && apiKey.includes('•');
    const newApiKey   = isKeyMasked ? (existing?.apiKey ?? null) : (apiKey ?? null);

    // Upsert：有現有設定則更新，否則建立新紀錄
    let record;
    if (existing) {
      record = await prisma.aiModelConfig.update({
        where: { id: existing.id },
        data: {
          provider:    provider.trim(),
          baseUrl:     baseUrl.trim(),
          apiKey:      newApiKey,
          modelHeavy:  modelHeavy.trim(),
          modelLight:  modelLight.trim(),
          maxTokens:   parseInt(maxTokens),
          temperature: parseFloat(temperature),
        },
      });
    } else {
      record = await prisma.aiModelConfig.create({
        data: {
          companyId:   parseInt(companyId),
          provider:    provider.trim(),
          baseUrl:     baseUrl.trim(),
          apiKey:      newApiKey,
          modelHeavy:  modelHeavy.trim(),
          modelLight:  modelLight.trim(),
          maxTokens:   parseInt(maxTokens),
          temperature: parseFloat(temperature),
          isActive:    true,
        },
      });
    }

    // 清除 aiAgent 快取，讓下次 AI 呼叫立即使用新設定
    try {
      getAiAgent().invalidateConfigCache();
    } catch (cacheErr) {
      console.warn('⚠️  清除 AI 快取失敗（不影響儲存）:', cacheErr.message);
    }

    const rawKey    = record.apiKey || '';
    const maskedKey = rawKey ? '•••••••••••' + rawKey.slice(-4) : '';

    res.json({
      config: {
        id:          record.id,
        provider:    record.provider,
        baseUrl:     record.baseUrl,
        apiKey:      maskedKey,
        apiKeyIsSet: !!rawKey,
        modelHeavy:  record.modelHeavy,
        modelLight:  record.modelLight,
        maxTokens:   record.maxTokens,
        temperature: record.temperature,
        updatedAt:   record.updatedAt.toISOString(),
      },
      message: 'AI 模型設定已儲存，快取已清除',
    });
  } catch (err) {
    console.error('❌ 儲存 AI 模型設定失敗:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});

// ── 輔助：判斷是否為本地端 URL（Ollama / LM Studio 等不需要 Key）
function isLocalUrl(url) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/i.test(url || '');
}

// ════════════════════════════════════════════════════════════
// GET /api/settings/ai/ollama-models?baseUrl=http://host.docker.internal:11434
// 查詢 Ollama 可用模型清單（從後端呼叫 Ollama API）
// ════════════════════════════════════════════════════════════
router.get('/ai/ollama-models', async (req, res) => {
  const baseUrl = (req.query.baseUrl || 'http://host.docker.internal:11434').replace(/\/v1\/?$/, '');
  try {
    const tagsUrl = `${baseUrl}/api/tags`;
    const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return res.status(502).json({ error: `Ollama 回應 HTTP ${response.status}`, models: [] });
    }
    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name:   m.name,
      size:   m.details?.parameter_size || '',
      family: m.details?.family || '',
    }));
    res.json({ models, count: models.length, baseUrl });
  } catch (err) {
    const hint = isLocalUrl(baseUrl)
      ? '請確認 Ollama 已啟動（OLLAMA_HOST=0.0.0.0 ollama serve）'
      : '請確認 Ollama 服務位址正確';
    res.status(502).json({ error: `無法連到 Ollama：${err.message}`, models: [], hint });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/settings/ai/test
// 測試 AI 模型連線（不儲存設定，純測試）
// Body: { companyId?, baseUrl, apiKey, modelHeavy }
// ════════════════════════════════════════════════════════════
router.post('/ai/test', async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      companyId  = 2,
      baseUrl    = null,
      apiKey,
      modelHeavy = 'gpt-4o',
    } = req.body;

    // 若 apiKey 是遮罩，從 DB 取實際值
    let actualKey = apiKey;
    if (!apiKey || apiKey.includes('•')) {
      const existing = await prisma.aiModelConfig.findFirst({
        where:   { companyId: parseInt(companyId), isActive: true },
        orderBy: { updatedAt: 'desc' },
        select:  { apiKey: true },
      });
      actualKey = existing?.apiKey || process.env.OPENAI_API_KEY || '';
    }

    // 本地端（Ollama / LM Studio）不需要真正的 API Key
    // OpenAI 客戶端要求 apiKey 非空，用 "ollama" 作為佔位符
    if (!actualKey) {
      if (isLocalUrl(baseUrl)) {
        actualKey = 'ollama';   // Ollama / LM Studio 接受任意非空字串
      } else {
        return res.status(400).json({
          success: false,
          error:   'API 金鑰未設定，請先輸入 API Key',
          hint:    '本地端 Ollama / LM Studio 可填入任意字元（如 "ollama"）',
        });
      }
    }

    // 建立臨時 OpenAI 客戶端進行測試
    const opts = { apiKey: actualKey, timeout: 15_000, maxRetries: 0 };
    if (baseUrl && !baseUrl.includes('•')) opts.baseURL = baseUrl.trim();

    const client = new OpenAI(opts);

    // 以最小 token 進行測試呼叫
    const testResponse = await client.chat.completions.create({
      model:      modelHeavy,
      max_tokens: 5,
      messages:   [{ role: 'user', content: 'hi' }],
    });

    const latencyMs  = Date.now() - startTime;
    const testResult = `✅ 連線成功 | ${modelHeavy} | ${latencyMs}ms`;

    // 更新 DB 測試紀錄（若有設定）
    const existing = await prisma.aiModelConfig.findFirst({
      where:   { companyId: parseInt(companyId), isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      await prisma.aiModelConfig.update({
        where: { id: existing.id },
        data:  {
          lastTestedAt: new Date(),
          testResult:   testResult.slice(0, 200),
        },
      });
    }

    res.json({
      success:    true,
      latencyMs,
      model:      testResponse.model,
      testResult,
      message:    `模型 ${modelHeavy} 連線測試成功（${latencyMs}ms）`,
    });

  } catch (err) {
    const latencyMs  = Date.now() - startTime;
    const isAuthErr  = err.status === 401 || err.code === 'authentication_error';
    const isNotFound = err.status === 404;
    const testResult = `❌ ${isAuthErr ? 'API Key 無效' : isNotFound ? '模型不存在' : err.message}`;

    // 更新 DB 測試紀錄
    try {
      const { companyId = 2, modelHeavy = 'gpt-4o' } = req.body;
      const existing = await prisma.aiModelConfig.findFirst({
        where:   { companyId: parseInt(companyId), isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) {
        await prisma.aiModelConfig.update({
          where: { id: existing.id },
          data:  { lastTestedAt: new Date(), testResult: testResult.slice(0, 200) },
        });
      }
    } catch (_) { /* 測試失敗時更新 DB 的錯誤不向上傳 */ }

    console.error('❌ AI 連線測試失敗:', err.message);
    res.status(200).json({   // 回傳 200 讓前端能解析錯誤內容
      success:    false,
      latencyMs,
      testResult,
      error:      isAuthErr ? 'API Key 無效或已過期' : isNotFound ? `模型 "${req.body.modelHeavy}" 不存在` : err.message,
      hint:       isAuthErr ? '請確認 API Key 正確且有效'
                : isNotFound ? '請確認模型名稱正確（例如 gpt-4o、llama3.1）'
                : '請確認 API Base URL 和網路連線',
    });
  }
});

module.exports = router;
