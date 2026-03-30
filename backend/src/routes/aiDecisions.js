/**
 * /api/ai — AI 決策建議路由
 * 使用 PostgreSQL（Prisma AiSuggestion 模型）
 */
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

async function seedIfEmpty(companyId) {
  const count = await prisma.aiSuggestion.count({ where: { companyId } });
  if (count > 0) return;

  await prisma.aiSuggestion.createMany({
    data: [
      {
        companyId, type: '風險預警', title: 'API 閘道升級進度落後', scope: 'API 閘道升級',
        confidence: 78, status: 'pending', reviewedAt: null,
        detail: '根據目前任務完成率（32%）與截止日，預測有 78% 機率無法如期交付。建議重新評估里程碑或增加人力資源。',
      },
      {
        companyId, type: '自動指派', title: '監控告警任務缺少負責人', scope: 'API 閘道升級',
        confidence: 91, status: 'pending', reviewedAt: null,
        detail: '「監控告警」任務已建立 5 天但尚未指派。根據工作負載分析，建議指派給工作量最低的成員。',
      },
      {
        companyId, type: '截止日建議', title: 'React Native 架構工時不足', scope: '行動 App v2.0',
        confidence: 85, status: 'approved', reviewedAt: new Date('2026-03-26T14:00:00.000Z'),
        detail: '預估工時 40h，目前完成 25%，距截止日 4 天。建議延後 7 天至 4/7。',
      },
      {
        companyId, type: '效率洞察', title: '週三下午為高產出時段', scope: '全局',
        confidence: 67, status: 'approved', reviewedAt: new Date('2026-03-25T10:00:00.000Z'),
        detail: '過去 4 週資料顯示，任務完成率在週三 14:00-17:00 比平均高 43%。',
      },
      {
        companyId, type: '風險預警', title: '電商重構有 3 項逾期任務', scope: '電商平台重構',
        confidence: 95, status: 'rejected', reviewedAt: new Date('2026-03-24T18:00:00.000Z'),
        detail: '「資料庫遷移」「前端改版」「API 整合」均已逾期，建議立即確認阻塞原因。',
      },
    ],
  });
}

// GET /api/ai?companyId=N
router.get('/', async (req, res) => {
  try {
    const companyId = parseInt(req.query.companyId);
    if (!companyId) return err(res, 'companyId 為必填', 400);

    await seedIfEmpty(companyId);

    const decisions = await prisma.aiSuggestion.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const pending     = decisions.filter(d => d.status === 'pending').length;
    const approved    = decisions.filter(d => d.status === 'approved' && d.reviewedAt && new Date(d.reviewedAt) >= monthStart).length;
    const total       = decisions.length;
    const approvedAll = decisions.filter(d => d.status === 'approved').length;
    const approvalRate = total > 0 ? Math.round((approvedAll / total) * 100) : 0;

    return ok(res, { decisions, stats: { pending, approved, approvalRate } });
  } catch (e) {
    console.error('[ai GET]', e);
    return err(res, e.message);
  }
});

// PATCH /api/ai/:id — 更新狀態
router.patch('/:id', async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return err(res, 'status 必須是 approved / rejected / pending', 400);
    }

    const existing = await prisma.aiSuggestion.findUnique({ where: { id } });
    if (!existing) return err(res, '找不到此決策', 404);

    const updated = await prisma.aiSuggestion.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
      },
    });

    return ok(res, updated);
  } catch (e) {
    console.error('[ai PATCH]', e);
    return err(res, e.message);
  }
});

// DELETE /api/ai/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.aiSuggestion.findUnique({ where: { id } });
    if (!existing) return err(res, '找不到此決策', 404);

    await prisma.aiSuggestion.delete({ where: { id } });
    return ok(res, { id });
  } catch (e) {
    console.error('[ai DELETE]', e);
    return err(res, e.message);
  }
});

module.exports = router;
