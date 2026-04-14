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

// GET /api/custom-fields?companyId=N
router.get('/', async (req, res) => {
  const companyId = parseInt(req.query.companyId);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
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
    const isSelect = fieldType === 'single_select' || fieldType === 'multi_select';
    const optionsInput = isSelect && Array.isArray(req.body.options) ? req.body.options : [];

    const field = await prisma.customFieldDefinition.create({
      data: {
        companyId:   parseInt(companyId),
        name,
        fieldType,
        entityType:  entityType  || 'task',
        isRequired:  isRequired  || false,
        description: description || '',
        isArchived:  false,
        ...(optionsInput.length > 0 ? {
          options: {
            create: optionsInput.map((o, i) => ({
              name:      o.name,
              color:     o.color || null,
              sortOrder: i,
            })),
          },
        } : {}),
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
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

    // 同步選項（如果有傳入 options 且欄位類型為 select）
    if (Array.isArray(req.body.options)) {
      const incoming = req.body.options.filter(o => o.name && o.name.trim());
      const existing = await prisma.customFieldOption.findMany({ where: { definitionId: id }, orderBy: { sortOrder: 'asc' } });
      const incomingIds = incoming.filter(o => o.id).map(o => o.id);
      // 刪除不在新列表中的舊選項
      const toDelete = existing.filter(e => !incomingIds.includes(e.id));
      for (const d of toDelete) {
        await prisma.customFieldOption.delete({ where: { id: d.id } }).catch(() => {});
      }
      // 更新已有的 + 建立新的
      for (let i = 0; i < incoming.length; i++) {
        const o = incoming[i];
        if (o.id && existing.find(e => e.id === o.id)) {
          await prisma.customFieldOption.update({
            where: { id: o.id },
            data:  { name: o.name.trim(), color: o.color || null, sortOrder: i },
          });
        } else {
          await prisma.customFieldOption.create({
            data: { definitionId: id, name: o.name.trim(), color: o.color || null, sortOrder: i },
          });
        }
      }
    }

    const field = await prisma.customFieldDefinition.update({
      where:   { id },
      data,
      include: { options: { orderBy: { sortOrder: 'asc' } } },
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
