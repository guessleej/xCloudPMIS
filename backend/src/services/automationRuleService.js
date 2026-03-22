const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const RULE_TRIGGER_TYPES = new Set([
  'task_created',
  'task_completed',
  'due_date_approaching',
  'status_changed',
  'assignee_changed',
  'field_changed',
]);

const RULE_ACTION_TYPES = new Set([
  'assign_task',
  'set_status',
  'set_priority',
  'add_comment',
  'send_notification',
  'move_to_section',
  'set_due_date',
]);

const SYSTEM_RULE_KEY = 'system.task_completed_cascade';

const SYSTEM_RULE_TEMPLATE = {
  ruleKey: SYSTEM_RULE_KEY,
  name: '拖曳到已完成欄位',
  description: '當使用者把任務拖進「已完成」欄位時，自動結案、回填父任務進度並通知專案成員。',
  isSystem: true,
  isEnabled: true,
  triggerType: 'status_changed',
  triggerConfig: {
    source: 'kanban',
    from: 'any',
    to: 'done',
  },
  conditions: [
    { field: 'status', operator: 'equals', value: 'done' },
  ],
  actions: [
    { type: 'set_status', config: { status: 'Completed' } },
    { type: 'add_comment', config: { text: '同步父任務進度條' } },
    { type: 'send_notification', config: { recipient: '專案追蹤者' } },
  ],
};

const DEFAULT_CUSTOM_RULE_TEMPLATES = [
  {
    ruleKey: 'template.task_completed_notify',
    name: '任務完成自動通知',
    description: '當任務完成時，自動傳送通知給負責人',
    isEnabled: true,
    triggerType: 'task_completed',
    triggerConfig: {},
    conditions: [],
    actions: [{ type: 'send_notification', config: { recipient: '負責人' } }],
  },
  {
    ruleKey: 'template.high_priority_auto_assign',
    name: '高優先任務自動指派',
    description: '新建立的高優先度任務自動指派給專案負責人',
    isEnabled: true,
    triggerType: 'task_created',
    triggerConfig: {},
    conditions: [{ field: '優先度', operator: 'equals', value: '高' }],
    actions: [{ type: 'assign_task', config: { member: '專案負責人' } }],
  },
  {
    ruleKey: 'template.due_date_reminder',
    name: '逾期提醒',
    description: '截止日前 3 天自動傳送提醒通知',
    isEnabled: true,
    triggerType: 'due_date_approaching',
    triggerConfig: { daysBefore: 3 },
    conditions: [],
    actions: [{ type: 'send_notification', config: { recipient: '負責人' } }],
  },
  {
    ruleKey: 'template.task_created_in_progress',
    name: '新任務自動標記',
    description: '新建立的任務自動設定狀態為進行中',
    isEnabled: false,
    triggerType: 'task_created',
    triggerConfig: {},
    conditions: [],
    actions: [{ type: 'set_status', config: { status: '進行中' } }],
  },
  {
    ruleKey: 'template.task_completed_archive',
    name: '完成任務歸檔',
    description: '任務完成後自動移至「已完成」分節',
    isEnabled: true,
    triggerType: 'task_completed',
    triggerConfig: {},
    conditions: [],
    actions: [{ type: 'move_to_section', config: { section: '已完成' } }],
  },
  {
    ruleKey: 'template.status_change_comment',
    name: '狀態同步通知',
    description: '狀態變更時自動新增留言說明變更原因',
    isEnabled: true,
    triggerType: 'status_changed',
    triggerConfig: {},
    conditions: [],
    actions: [{ type: 'add_comment', config: { text: '狀態已更新，請查看最新進度。' } }],
  },
];

const RULE_INCLUDE = {
  projectScopes: {
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      projectId: 'asc',
    },
  },
};

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 403;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

class AutomationRuleService {
  constructor(prismaClient = prisma) {
    this.prisma = prismaClient;
  }

  async listRules({ companyId }) {
    this.assertCompanyId(companyId);
    await this.ensureBootstrapRules({ companyId });

    const rows = await this.prisma.automationRule.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      include: RULE_INCLUDE,
      orderBy: [
        { isSystem: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return rows.map((rule) => this.formatRule(rule));
  }

  async createRule({ companyId, userId, payload }) {
    this.assertCompanyId(companyId);
    const normalized = this.normalizePayload(payload, { partial: false });
    await this.validateProjectIds(companyId, normalized.projectIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.automationRule.create({
        data: {
          companyId,
          createdById: userId || null,
          updatedById: userId || null,
          name: normalized.name,
          description: normalized.description,
          isEnabled: normalized.enabled,
          isSystem: false,
          triggerType: normalized.trigger.type,
          triggerConfig: normalized.trigger.config,
          conditions: normalized.conditions,
          actions: normalized.actions,
          projectScopes: normalized.projectIds.length > 0
            ? {
                create: normalized.projectIds.map((projectId) => ({
                  projectId,
                })),
              }
            : undefined,
        },
        include: RULE_INCLUDE,
      });

      return rule;
    });

    return this.formatRule(created);
  }

  async updateRule({ companyId, ruleId, userId, payload }) {
    this.assertCompanyId(companyId);
    const existing = await this.getRuleRecord({ companyId, ruleId });

    if (existing.isSystem) {
      throw new ForbiddenError('系統內建規則不可直接編輯。');
    }

    const normalized = this.normalizePayload(payload, { partial: true, existingRule: existing });
    if (normalized.projectIds !== undefined) {
      await this.validateProjectIds(companyId, normalized.projectIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (normalized.projectIds !== undefined) {
        await tx.automationRuleProject.deleteMany({
          where: { ruleId },
        });
      }

      await tx.automationRule.update({
        where: { id: ruleId },
        data: {
          ...(normalized.name !== undefined ? { name: normalized.name } : {}),
          ...(normalized.description !== undefined ? { description: normalized.description } : {}),
          ...(normalized.enabled !== undefined ? { isEnabled: normalized.enabled } : {}),
          ...(normalized.trigger !== undefined ? {
            triggerType: normalized.trigger.type,
            triggerConfig: normalized.trigger.config,
          } : {}),
          ...(normalized.conditions !== undefined ? { conditions: normalized.conditions } : {}),
          ...(normalized.actions !== undefined ? { actions: normalized.actions } : {}),
          updatedById: userId || null,
        },
      });

      if (normalized.projectIds !== undefined && normalized.projectIds.length > 0) {
        await tx.automationRuleProject.createMany({
          data: normalized.projectIds.map((projectId) => ({
            ruleId,
            projectId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.automationRule.findUnique({
        where: { id: ruleId },
        include: RULE_INCLUDE,
      });
    });

    return this.formatRule(updated);
  }

  async deleteRule({ companyId, ruleId }) {
    this.assertCompanyId(companyId);
    const existing = await this.getRuleRecord({ companyId, ruleId });

    if (existing.isSystem) {
      throw new ForbiddenError('系統內建規則不可刪除。');
    }

    await this.prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        deletedAt: new Date(),
      },
    });

    return { id: ruleId };
  }

  async recordRuleExecution({
    companyId,
    ruleKey,
    taskId = null,
    projectIds = [],
    triggeredById = null,
    status = 'success',
    context = null,
    result = null,
  }) {
    if (!companyId || !ruleKey) {
      return null;
    }

    if (ruleKey === SYSTEM_RULE_KEY) {
      await this.ensureSystemRule({ companyId });
    }

    const rule = await this.prisma.automationRule.findFirst({
      where: {
        companyId,
        ruleKey,
        deletedAt: null,
        isEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (!rule) {
      return null;
    }

    const primaryProjectId = projectIds.find(Boolean) || null;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.automationRule.update({
        where: { id: rule.id },
        data: {
          triggerCount: {
            increment: 1,
          },
          lastTriggeredAt: now,
        },
      }),
      this.prisma.automationRuleRun.create({
        data: {
          ruleId: rule.id,
          companyId,
          projectId: primaryProjectId,
          taskId,
          triggeredById,
          status,
          context,
          result,
          createdAt: now,
        },
      }),
    ]);

    return { ruleId: rule.id, triggeredAt: now.toISOString() };
  }

  async ensureBootstrapRules({ companyId }) {
    this.assertCompanyId(companyId);
    await this.ensureSystemRule({ companyId });

    const hasEverCreatedCustomRules = await this.prisma.automationRule.findFirst({
      where: {
        companyId,
        isSystem: false,
      },
      select: { id: true },
    });

    if (hasEverCreatedCustomRules) {
      return;
    }

    for (const template of DEFAULT_CUSTOM_RULE_TEMPLATES) {
      await this.prisma.automationRule.upsert({
        where: {
          companyId_ruleKey: {
            companyId,
            ruleKey: template.ruleKey,
          },
        },
        update: {
          deletedAt: null,
        },
        create: {
          companyId,
          ruleKey: template.ruleKey,
          name: template.name,
          description: template.description,
          isEnabled: template.isEnabled,
          isSystem: false,
          triggerType: template.triggerType,
          triggerConfig: template.triggerConfig,
          conditions: template.conditions,
          actions: template.actions,
        },
      });
    }
  }

  async ensureSystemRule({ companyId }) {
    await this.prisma.automationRule.upsert({
      where: {
        companyId_ruleKey: {
          companyId,
          ruleKey: SYSTEM_RULE_KEY,
        },
      },
      update: {
        name: SYSTEM_RULE_TEMPLATE.name,
        description: SYSTEM_RULE_TEMPLATE.description,
        isEnabled: true,
        isSystem: true,
        triggerType: SYSTEM_RULE_TEMPLATE.triggerType,
        triggerConfig: SYSTEM_RULE_TEMPLATE.triggerConfig,
        conditions: SYSTEM_RULE_TEMPLATE.conditions,
        actions: SYSTEM_RULE_TEMPLATE.actions,
        deletedAt: null,
      },
      create: {
        companyId,
        ruleKey: SYSTEM_RULE_TEMPLATE.ruleKey,
        name: SYSTEM_RULE_TEMPLATE.name,
        description: SYSTEM_RULE_TEMPLATE.description,
        isEnabled: true,
        isSystem: true,
        triggerType: SYSTEM_RULE_TEMPLATE.triggerType,
        triggerConfig: SYSTEM_RULE_TEMPLATE.triggerConfig,
        conditions: SYSTEM_RULE_TEMPLATE.conditions,
        actions: SYSTEM_RULE_TEMPLATE.actions,
      },
    });
  }

  async getRuleRecord({ companyId, ruleId }) {
    const row = await this.prisma.automationRule.findFirst({
      where: {
        id: ruleId,
        companyId,
        deletedAt: null,
      },
      include: RULE_INCLUDE,
    });

    if (!row) {
      throw new NotFoundError(`找不到規則 #${ruleId}`);
    }

    return row;
  }

  normalizePayload(payload, { partial, existingRule } = {}) {
    const normalized = {};

    if (!partial || payload.name !== undefined) {
      const value = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!partial && !value) {
        throw new ValidationError('規則名稱為必填。');
      }
      if (payload.name !== undefined || !partial) {
        normalized.name = value;
      }
    }

    if (!partial || payload.description !== undefined) {
      normalized.description = typeof payload.description === 'string'
        ? payload.description.trim()
        : (partial ? existingRule.description : '');
    }

    if (!partial || payload.enabled !== undefined) {
      if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') {
        throw new ValidationError('enabled 必須為布林值。');
      }
      normalized.enabled = payload.enabled !== undefined
        ? payload.enabled
        : (partial ? existingRule.isEnabled : true);
    }

    if (!partial || payload.trigger !== undefined) {
      const trigger = payload.trigger || {};
      const triggerType = trigger.type;
      if (!RULE_TRIGGER_TYPES.has(triggerType)) {
        throw new ValidationError(`trigger.type 不合法：${triggerType || 'undefined'}`);
      }
      normalized.trigger = {
        type: triggerType,
        config: this.normalizeObject(trigger.config),
      };
    }

    if (!partial || payload.conditions !== undefined) {
      const conditions = payload.conditions ?? [];
      if (!Array.isArray(conditions)) {
        throw new ValidationError('conditions 必須為陣列。');
      }
      normalized.conditions = conditions;
    }

    if (!partial || payload.actions !== undefined) {
      const actions = payload.actions ?? [];
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new ValidationError('actions 至少要有一個動作。');
      }
      actions.forEach((action) => {
        if (!RULE_ACTION_TYPES.has(action?.type)) {
          throw new ValidationError(`actions.type 不合法：${action?.type || 'undefined'}`);
        }
      });
      normalized.actions = actions.map((action) => ({
        type: action.type,
        config: this.normalizeObject(action.config),
      }));
    }

    if (!partial || payload.projectIds !== undefined) {
      normalized.projectIds = this.normalizeProjectIds(payload.projectIds ?? []);
    }

    return normalized;
  }

  normalizeProjectIds(rawProjectIds) {
    if (!Array.isArray(rawProjectIds)) {
      throw new ValidationError('projectIds 必須為陣列。');
    }

    return [...new Set(
      rawProjectIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
  }

  async validateProjectIds(companyId, projectIds) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return;
    }

    const count = await this.prisma.project.count({
      where: {
        companyId,
        deletedAt: null,
        id: {
          in: projectIds,
        },
      },
    });

    if (count !== projectIds.length) {
      throw new ValidationError('projectIds 包含不存在或無權限的專案。');
    }
  }

  normalizeObject(input) {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input;
  }

  formatRule(rule) {
    return {
      id: rule.id,
      ruleKey: rule.ruleKey,
      name: rule.name,
      description: rule.description,
      enabled: rule.isEnabled,
      isSystem: rule.isSystem,
      projectIds: rule.projectScopes.map((scope) => scope.projectId),
      projects: rule.projectScopes
        .map((scope) => scope.project)
        .filter(Boolean)
        .map((project) => ({
          id: project.id,
          name: project.name,
        })),
      trigger: {
        type: rule.triggerType,
        config: rule.triggerConfig || {},
      },
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      actions: Array.isArray(rule.actions) ? rule.actions : [],
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      lastTriggered: rule.lastTriggeredAt?.toISOString() || null,
      triggerCount: rule.triggerCount,
    };
  }

  assertCompanyId(companyId) {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new ValidationError('companyId 為必填且必須是正整數。');
    }
  }
}

module.exports = {
  AutomationRuleService,
  automationRuleService: new AutomationRuleService(),
  SYSTEM_RULE_KEY,
  NotFoundError,
  ForbiddenError,
  ValidationError,
};
