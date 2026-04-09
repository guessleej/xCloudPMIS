/**
 * /api/custom-fields — 自訂欄位路由
 * 使用 Prisma + PostgreSQL 持久化儲存（CustomFieldDefinition 模型）
 */
const express = require('express');
const router  = express.Router();
const prisma = require('../lib/prisma');

const ok  = (res, data, meta = {}) => res.json({ success: true, data, meta, timestamp: new Date().toISOString() });
const err = (res, msg, s = 500)   => res.status(s).json({ success: false, error: msg });

const VALID_FIELD_TYPES = [
  'text', 'number', 'currency', 'percent', 'checkbox',
  'date', 'datetime', 'single_select', 'multi_select', 'people',
];

function formatField(f) {
  return {
    id:         f.id,
    companyId:  f.companyId,
    name:       f.name,
    fieldType:  f.fieldType,
    entityType: f.entityType,
    isRequired: f.isRequired,
    isArchived: f.isArchived,
    options:    (f.options || []).map(o => ({ id: o.id, name: o.name, color: o.color || null })),
    createdAt:  f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
  };
}

async function seedIfEmpty(companyId) {
  const count = await prisma.customFieldDefinition.count({ where: { companyId } });
  if (count > 0) return;

  const seedData = [
    { companyId, name: '客戶名稱',     fieldType: 'text',          entityType: 'task',    isRequired: true,  createdAt: new Date('2026-01-15T00:00:00.000Z') },
    { companyId, name: '預算金額',     fieldType: 'currency',      entityType: 'project', isRequired: false, createdAt: new Date('2026-01-20T00:00:00.000Z') },
    { companyId, name: '合約截止日',   fieldType: 'date',          entityType: 'project', isRequired: true,  createdAt: new Date('2026-01-25T00:00:00.000Z') },
    { companyId, name: '任務分類',     fieldType: 'single_select', entityType: 'task',    isRequired: false, createdAt: new Date('2026-02-01T00:00:00.000Z') },
    { companyId, name: '需要上線通知', fieldType: 'checkbox',      entityType: 'task',    isRequired: false, createdAt: new Date('2026-02-10T00:00:00.000Z') },
    { companyId, name: '外部審核人',   fieldType: 'people',        entityType: 'project', isRequired: false, createdAt: new Date('2026-02-18T00:00:00.000Z') },
    { companyId, name: '風險等級',     fieldType: 'single_select', entityType: 'task',    isRequired: true,  createdAt: new Date('2026-03-01T00:00:00.000Z') },
    { companyId, name: '驗收日期',     fieldType: 'date',          entityType: 'task',    isRequired: false, createdAt: new Date('2026-03-10T00:00:00.000Z') },
  ];

  await prisma.customFieldDefinition.createMany({ data: seedData });
}

// GET /api/custom-fields?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    await seedIfEmpty(companyId);
    const fields = await prisma.customFieldDefinition.findMany({
      where:   { companyId, isArchived: false },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const formatted = fields.map(formatField);
    return ok(res, formatted, { total: formatted.length });
  } catch (e) {
    console.error('[custom-fields GET]', e);
    return err(res, '伺服器錯誤');
  }
});

// POST /api/custom-fields
router.post('/', async (req, res) => {
  const { companyId, name, fieldType, entityType, isRequired, description } = req.body;
  if (!companyId || !name || !fieldType) return err(res, 'companyId, name, fieldType 為必填', 400);
  if (!VALID_FIELD_TYPES.includes(fieldType)) {
    return err(res, `fieldType 必須是: ${VALID_FIELD_TYPES.join(', ')}`, 400);
  }

  try {
    const field = await prisma.customFieldDefinition.create({
      data: {
        companyId:   parseInt(companyId),
        name,
        fieldType,
        entityType:  entityType  || 'task',
        isRequired:  isRequired  || false,
        description: description || '',
        isArchived:  false,
      },
      include: { options: true },
    });
    return ok(res, formatField(field));
  } catch (e) {
    console.error('[custom-fields POST]', e);
    return err(res, '伺服器錯誤');
  }
});

// PATCH /api/custom-fields/:id
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    const data = {};
    if (req.body.name        !== undefined) data.name        = req.body.name;
    if (req.body.fieldType   !== undefined) data.fieldType   = req.body.fieldType;
    if (req.body.entityType  !== undefined) data.entityType  = req.body.entityType;
    if (req.body.isRequired  !== undefined) data.isRequired  = req.body.isRequired;
    if (req.body.description !== undefined) data.description = req.body.description;

    const field = await prisma.customFieldDefinition.update({
      where:   { id },
      data,
      include: { options: true },
    });
    return ok(res, formatField(field));
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此欄位', 404);
    console.error('[custom-fields PATCH]', e);
    return err(res, '伺服器錯誤');
  }
});

// DELETE /api/custom-fields/:id — 封存（軟刪除）
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return err(res, '無效的 ID', 400);

  try {
    await prisma.customFieldDefinition.update({
      where: { id },
      data:  { isArchived: true },
    });
    return ok(res, { id });
  } catch (e) {
    if (e.code === 'P2025') return err(res, '找不到此欄位', 404);
    console.error('[custom-fields DELETE]', e);
    return err(res, '伺服器錯誤');
  }
});

module.exports = router;
