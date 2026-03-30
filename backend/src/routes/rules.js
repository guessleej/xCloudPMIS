/**
 * /api/rules — 自動化規則路由
 * 使用 Prisma AutomationRule 模型
 */
const express = require('express');
const router  = express.Router();

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

const VALID_TRIGGER_TYPES = [
  'task_created', 'task_completed', 'due_date_approaching',
  'status_changed', 'assignee_changed', 'field_changed',
];

// 取得 Prisma client（若不可用則 fallback）
function getPrisma() {
  try {
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient();
  } catch {
    return null;
  }
}

// GET /api/rules?companyId=N — 列出所有規則
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const rules = await prisma.automationRule.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ isEnabled: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        runs: {
          select: { id: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const data = rules.map(rule => ({
      ...rule,
      lastRun:  rule.runs[0]?.createdAt || rule.lastTriggeredAt || null,
      runCount: rule.triggerCount,
      runs: undefined,
    }));

    return ok(res, data, { total: data.length });
  } catch (e) {
    console.error('[rules GET]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// POST /api/rules — 建立規則
router.post('/', async (req, res) => {
  const {
    companyId, name, description,
    triggerType, triggerConfig, conditions, actions, isEnabled,
  } = req.body;

  if (!companyId || !name || !triggerType) {
    return err(res, 'companyId, name, triggerType 為必填', 400);
  }
  if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
    return err(res, `triggerType 必須是: ${VALID_TRIGGER_TYPES.join(', ')}`, 400);
  }

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const rule = await prisma.automationRule.create({
      data: {
        company:    { connect: { id: parseInt(companyId) } },  // Prisma 5：required relation 需用 connect
        name,
        description: description || '',
        triggerType,
        triggerConfig:  triggerConfig  || {},
        conditions:     conditions     || {},
        actions:        actions        || {},
        isEnabled:      isEnabled !== undefined ? isEnabled : true,
        createdBy:  req.user?.id ? { connect: { id: req.user.id } } : undefined,
      },
    });
    return ok(res, rule);
  } catch (e) {
    console.error('[rules POST]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// PATCH /api/rules/:id — 更新規則（含 isEnabled toggle）
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const { name, description, isEnabled, triggerType, triggerConfig, conditions, actions } = req.body;

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    const updateData = { updatedById: req.user?.id || null };
    if (name         !== undefined) updateData.name         = name;
    if (description  !== undefined) updateData.description  = description;
    if (isEnabled    !== undefined) updateData.isEnabled    = isEnabled;
    if (triggerType  !== undefined) {
      if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
        return err(res, `triggerType 必須是: ${VALID_TRIGGER_TYPES.join(', ')}`, 400);
      }
      updateData.triggerType = triggerType;
    }
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig;
    if (conditions    !== undefined) updateData.conditions    = conditions;
    if (actions       !== undefined) updateData.actions       = actions;

    const rule = await prisma.automationRule.update({
      where: { id },
      data:  updateData,
    });
    return ok(res, rule);
  } catch (e) {
    console.error('[rules PATCH]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

// DELETE /api/rules/:id — 軟刪除
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 id', 400);

  const prisma = getPrisma();
  if (!prisma) return err(res, 'Prisma 未設定', 503);

  try {
    await prisma.automationRule.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
    return ok(res, { id });
  } catch (e) {
    console.error('[rules DELETE]', e.message);
    return err(res, e.message);
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = router;
