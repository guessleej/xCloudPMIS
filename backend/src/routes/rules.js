const express = require('express');
const router = express.Router();

const {
  automationRuleService,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} = require('../services/automationRuleService');

const ok = (res, data, meta = {}) =>
  res.json({ success: true, data, meta, timestamp: new Date().toISOString() });

const err = (res, message, status = 500) =>
  res.status(status).json({ success: false, error: message });

function parseCompanyId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRuleId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('ruleId 必須是正整數。');
  }
  return parsed;
}

function resolveCompanyId(req) {
  return parseCompanyId(req.user?.companyId)
    || parseCompanyId(req.query.companyId)
    || parseCompanyId(req.body.companyId);
}

function resolveUserId(req) {
  return parseCompanyId(req.user?.id);
}

function handleServiceError(res, error) {
  if (error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof ValidationError) {
    return err(res, error.message, error.statusCode);
  }

  console.error('[rules]', error);
  return err(res, error.message || '規則服務發生錯誤', 500);
}

router.get('/', async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const rules = await automationRuleService.listRules({ companyId });
    const total = rules.length;
    const enabled = rules.filter((rule) => rule.enabled).length;
    const system = rules.filter((rule) => rule.isSystem).length;
    const custom = total - system;

    ok(res, rules, {
      total,
      enabled,
      disabled: total - enabled,
      system,
      custom,
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/', async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const rule = await automationRuleService.createRule({
      companyId,
      userId: resolveUserId(req),
      payload: req.body,
    });

    ok(res, rule);
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch('/:id', async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const rule = await automationRuleService.updateRule({
      companyId,
      ruleId: parseRuleId(req.params.id),
      userId: resolveUserId(req),
      payload: req.body,
    });

    ok(res, rule);
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete('/:id', async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return err(res, 'companyId 為必填', 400);

  try {
    const result = await automationRuleService.deleteRule({
      companyId,
      ruleId: parseRuleId(req.params.id),
    });

    ok(res, result, { deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;
