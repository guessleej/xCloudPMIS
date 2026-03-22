const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_TASK_FIELDS = [
  'gid',
  'name',
  'status',
  'priority',
  'due_date',
  'assignees',
  'num_subtasks',
  'custom_fields',
];

const SUPPORTED_TOP_LEVEL_FIELDS = new Set([
  'gid',
  'id',
  'resource_type',
  'name',
  'description',
  'status',
  'priority',
  'start_date',
  'due_date',
  'completed_at',
  'created_at',
  'updated_at',
  'created_by',
  'assignees',
  'memberships',
  'projects',
  'num_subtasks',
  'custom_fields',
]);

const SUPPORTED_NESTED_FIELDS = {
  assignees: new Set(['gid', 'id', 'name', 'email', 'avatar_url', 'is_primary']),
  memberships: new Set(['gid', 'project', 'project.gid', 'project.name', 'is_primary', 'position']),
  projects: new Set(['gid', 'name']),
  custom_fields: new Set([
    'gid',
    'name',
    'type',
    'scope',
    'resource_type',
    'display_value',
    'value',
    'enabled',
    'is_value_set',
    'enum_options',
  ]),
  created_by: new Set(['gid', 'id', 'name', 'email', 'avatar_url']),
};

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

class TaskService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async listProjectTasks(params) {
    const limit = this.normalizeLimit(params.limit);
    const offset = this.normalizeOffset(params.offset);
    const { fieldTree, requestedFields, unsupportedFields } = this.parseOptFields(params.optFields);

    const project = await this.prisma.project.findFirst({
      where: {
        id: params.projectId,
        deletedAt: null,
        ...(params.companyId ? { companyId: params.companyId } : {}),
        ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      },
      select: {
        id: true,
        name: true,
        customFieldLinks: {
          where: {
            definition: {
              entityType: 'task',
              isArchived: false,
            },
          },
          orderBy: [
            { sortOrder: 'asc' },
            { definition: { sortOrder: 'asc' } },
          ],
          select: {
            sortOrder: true,
            definition: {
              select: {
                id: true,
                name: true,
                description: true,
                fieldType: true,
                scope: true,
                isRequired: true,
                settings: true,
                currencyCode: true,
                options: {
                  where: { isArchived: false },
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    sortOrder: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundError(`Project ${params.projectId} was not found.`);
    }

    const customFieldDefinitions = project.customFieldLinks.map((link) => link.definition);
    const customFieldDefinitionIds = customFieldDefinitions.map((definition) => definition.id);

    const where = {
      deletedAt: null,
      OR: [
        { projectId: params.projectId },
        { taskProjects: { some: { projectId: params.projectId } } },
      ],
    };

    const total = await this.prisma.task.count({ where });

    const tasks = await this.prisma.task.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: [
        { position: 'asc' },
        { createdAt: 'asc' },
      ],
      select: this.buildTaskSelect(fieldTree, params.projectId, customFieldDefinitionIds),
    });

    const data = tasks.map((task) =>
      this.formatTaskRecord(task, fieldTree, customFieldDefinitions)
    );

    return {
      data,
      total,
      limit,
      offset,
      nextOffset: offset + data.length < total ? offset + data.length : null,
      hasMore: offset + data.length < total,
      optFields: requestedFields,
      unsupportedFields,
    };
  }

  normalizeLimit(limit) {
    if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.min(Math.max(Number(limit), 1), MAX_LIMIT);
  }

  normalizeOffset(offset) {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Number(offset), 0);
  }

  parseOptFields(optFields) {
    const tokens = this.normalizeOptFieldTokens(optFields);
    const requestedFields = tokens.length > 0 ? tokens : DEFAULT_TASK_FIELDS;
    const fieldTree = { topLevel: new Set(), nested: new Map() };
    const unsupportedFields = [];

    for (const rawToken of requestedFields) {
      const token = rawToken.trim();
      if (!token) continue;

      if (token === '*') {
        for (const field of SUPPORTED_TOP_LEVEL_FIELDS) {
          fieldTree.topLevel.add(field);
        }
        continue;
      }

      const [head, ...rest] = token.split('.');
      if (!SUPPORTED_TOP_LEVEL_FIELDS.has(head)) {
        unsupportedFields.push(token);
        continue;
      }

      fieldTree.topLevel.add(head);

      if (rest.length === 0) continue;

      const nestedToken = rest.join('.');
      const supportedNested = SUPPORTED_NESTED_FIELDS[head];
      if (!supportedNested || !supportedNested.has(nestedToken)) {
        unsupportedFields.push(token);
        continue;
      }

      const nestedSet = fieldTree.nested.get(head) ?? new Set();
      nestedSet.add(nestedToken);
      fieldTree.nested.set(head, nestedSet);
    }

    return { fieldTree, requestedFields, unsupportedFields };
  }

  normalizeOptFieldTokens(optFields) {
    if (!optFields) return [];

    if (Array.isArray(optFields)) {
      return optFields
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return String(optFields)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  buildTaskSelect(fieldTree, projectId, customFieldDefinitionIds) {
    const select = {
      id: true,
      title: true,
      projectId: true,
      position: true,
    };

    if (this.needsField(fieldTree, ['description'])) select.description = true;
    if (this.needsField(fieldTree, ['status'])) select.status = true;
    if (this.needsField(fieldTree, ['priority'])) select.priority = true;
    if (this.needsField(fieldTree, ['start_date'])) select.startedAt = true;
    if (this.needsField(fieldTree, ['due_date'])) select.dueDate = true;
    if (this.needsField(fieldTree, ['completed_at'])) select.completedAt = true;
    if (this.needsField(fieldTree, ['created_at'])) select.createdAt = true;
    if (this.needsField(fieldTree, ['updated_at'])) select.updatedAt = true;

    if (this.needsField(fieldTree, ['num_subtasks'])) {
      select._count = { select: { subtasks: true } };
    }

    if (this.needsField(fieldTree, ['created_by'])) {
      select.createdBy = {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      };
    }

    if (this.needsField(fieldTree, ['assignees'])) {
      select.assignee = {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      };
      select.taskAssigneeLinks = {
        orderBy: [
          { isPrimary: 'desc' },
          { assignedAt: 'asc' },
        ],
        select: {
          isPrimary: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      };
    }

    if (this.needsField(fieldTree, ['memberships', 'projects'])) {
      select.project = {
        select: {
          id: true,
          name: true,
        },
      };
      select.taskProjects = {
        where: { projectId },
        orderBy: [
          { isPrimary: 'desc' },
          { position: 'asc' },
        ],
        select: {
          isPrimary: true,
          position: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      };
    }

    if (this.needsField(fieldTree, ['custom_fields']) && customFieldDefinitionIds.length > 0) {
      select.customFieldValues = {
        where: {
          definitionId: {
            in: customFieldDefinitionIds,
          },
        },
        select: {
          id: true,
          definitionId: true,
          textValue: true,
          numberValue: true,
          booleanValue: true,
          dateValue: true,
          dateTimeValue: true,
          jsonValue: true,
          userValue: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          optionValue: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          multiSelectOptions: {
            select: {
              option: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
        },
      };
    }

    return select;
  }

  formatTaskRecord(task, fieldTree, customFieldDefinitions) {
    const response = {};

    if (this.needsField(fieldTree, ['gid'])) response.gid = String(task.id);
    if (this.needsField(fieldTree, ['id'])) response.id = task.id;
    if (this.needsField(fieldTree, ['resource_type'])) response.resource_type = 'task';
    if (this.needsField(fieldTree, ['name'])) response.name = task.title;
    if (this.needsField(fieldTree, ['description'])) response.description = task.description;
    if (this.needsField(fieldTree, ['status'])) response.status = task.status;
    if (this.needsField(fieldTree, ['priority'])) response.priority = task.priority;
    if (this.needsField(fieldTree, ['start_date'])) response.start_date = this.toDateOnly(task.startedAt);
    if (this.needsField(fieldTree, ['due_date'])) response.due_date = this.toDateOnly(task.dueDate);
    if (this.needsField(fieldTree, ['completed_at'])) response.completed_at = this.toIso(task.completedAt);
    if (this.needsField(fieldTree, ['created_at'])) response.created_at = this.toIso(task.createdAt);
    if (this.needsField(fieldTree, ['updated_at'])) response.updated_at = this.toIso(task.updatedAt);

    if (this.needsField(fieldTree, ['num_subtasks'])) {
      response.num_subtasks = task._count?.subtasks ?? 0;
    }

    if (this.needsField(fieldTree, ['created_by'])) {
      response.created_by = this.pickFields(
        {
          gid: task.createdBy ? String(task.createdBy.id) : null,
          id: task.createdBy?.id ?? null,
          name: task.createdBy?.name ?? null,
          email: task.createdBy?.email ?? null,
          avatar_url: task.createdBy?.avatarUrl ?? null,
        },
        this.getNestedFields(fieldTree, 'created_by')
      );
    }

    if (this.needsField(fieldTree, ['assignees'])) {
      const linkedAssignees = (task.taskAssigneeLinks ?? []).map((assignment) =>
        this.pickFields(
          {
            gid: String(assignment.user.id),
            id: assignment.user.id,
            name: assignment.user.name,
            email: assignment.user.email,
            avatar_url: assignment.user.avatarUrl,
            is_primary: assignment.isPrimary,
          },
          this.getNestedFields(fieldTree, 'assignees')
        )
      );

      const fallbackAssignee = task.assignee
        ? [
            this.pickFields(
              {
                gid: String(task.assignee.id),
                id: task.assignee.id,
                name: task.assignee.name,
                email: task.assignee.email,
                avatar_url: task.assignee.avatarUrl,
                is_primary: true,
              },
              this.getNestedFields(fieldTree, 'assignees')
            ),
          ]
        : [];

      response.assignees = linkedAssignees.length > 0 ? linkedAssignees : fallbackAssignee;
    }

    if (this.needsField(fieldTree, ['projects'])) {
      const linkedProjects = (task.taskProjects ?? []).map((membership) =>
        this.pickFields(
          {
            gid: String(membership.project.id),
            name: membership.project.name,
          },
          this.getNestedFields(fieldTree, 'projects')
        )
      );

      const fallbackProject = task.project
        ? [
            this.pickFields(
              {
                gid: String(task.project.id),
                name: task.project.name,
              },
              this.getNestedFields(fieldTree, 'projects')
            ),
          ]
        : [];

      response.projects = linkedProjects.length > 0 ? linkedProjects : fallbackProject;
    }

    if (this.needsField(fieldTree, ['memberships'])) {
      const linkedMemberships = (task.taskProjects ?? []).map((membership) =>
        this.pickFields(
          {
            gid: `${task.id}:${membership.project.id}`,
            project: {
              gid: String(membership.project.id),
              name: membership.project.name,
            },
            is_primary: membership.isPrimary,
            position: membership.position,
          },
          this.getNestedFields(fieldTree, 'memberships')
        )
      );

      const fallbackMembership = task.project
        ? [
            this.pickFields(
              {
                gid: `${task.id}:${task.project.id}`,
                project: {
                  gid: String(task.project.id),
                  name: task.project.name,
                },
                is_primary: true,
                position: task.position ?? 0,
              },
              this.getNestedFields(fieldTree, 'memberships')
            ),
          ]
        : [];

      response.memberships = linkedMemberships.length > 0 ? linkedMemberships : fallbackMembership;
    }

    if (this.needsField(fieldTree, ['custom_fields'])) {
      const valueMap = new Map(
        (task.customFieldValues ?? []).map((value) => [value.definitionId, value])
      );

      response.custom_fields = customFieldDefinitions.map((definition) => {
        const value = valueMap.get(definition.id);

        return this.pickFields(
          {
            gid: String(definition.id),
            name: definition.name,
            type: definition.fieldType,
            scope: definition.scope,
            resource_type: 'custom_field',
            enabled: true,
            is_value_set: Boolean(value),
            display_value: this.formatCustomFieldDisplayValue(definition, value),
            value: this.extractCustomFieldValue(definition, value),
            enum_options: definition.options.map((option) => ({
              gid: String(option.id),
              name: option.name,
              color: option.color,
            })),
          },
          this.getNestedFields(fieldTree, 'custom_fields')
        );
      });
    }

    return response;
  }

  formatCustomFieldDisplayValue(definition, value) {
    if (!value) return null;

    switch (definition.fieldType) {
      case 'text':
        return value.textValue ?? null;
      case 'number':
      case 'currency':
      case 'percent':
        return value.numberValue != null ? String(value.numberValue) : null;
      case 'checkbox':
        return value.booleanValue == null ? null : value.booleanValue ? 'true' : 'false';
      case 'date':
        return this.toDateOnly(value.dateValue);
      case 'datetime':
        return this.toIso(value.dateTimeValue);
      case 'single_select':
        return value.optionValue?.name ?? null;
      case 'multi_select':
        return (value.multiSelectOptions ?? [])
          .map((item) => item.option?.name)
          .filter(Boolean)
          .join(', ') || null;
      case 'people':
        return value.userValue?.name ?? null;
      default:
        return value.jsonValue != null ? JSON.stringify(value.jsonValue) : null;
    }
  }

  extractCustomFieldValue(definition, value) {
    if (!value) return null;

    switch (definition.fieldType) {
      case 'text':
        return value.textValue ?? null;
      case 'number':
      case 'currency':
      case 'percent':
        return value.numberValue != null ? Number(value.numberValue) : null;
      case 'checkbox':
        return value.booleanValue ?? null;
      case 'date':
        return this.toDateOnly(value.dateValue);
      case 'datetime':
        return this.toIso(value.dateTimeValue);
      case 'single_select':
        return value.optionValue
          ? {
              gid: String(value.optionValue.id),
              name: value.optionValue.name,
              color: value.optionValue.color ?? null,
            }
          : null;
      case 'multi_select':
        return (value.multiSelectOptions ?? []).map((item) => ({
          gid: String(item.option.id),
          name: item.option.name,
          color: item.option.color ?? null,
        }));
      case 'people':
        return value.userValue
          ? {
              gid: String(value.userValue.id),
              name: value.userValue.name,
              email: value.userValue.email,
              avatar_url: value.userValue.avatarUrl ?? null,
            }
          : null;
      default:
        return value.jsonValue ?? null;
    }
  }

  toDateOnly(value) {
    if (!value) return null;
    return new Date(value).toISOString().slice(0, 10);
  }

  toIso(value) {
    if (!value) return null;
    return new Date(value).toISOString();
  }

  needsField(fieldTree, fields) {
    if (fieldTree.topLevel.size === 0) {
      return fields.some((field) => DEFAULT_TASK_FIELDS.includes(field));
    }
    return fields.some((field) => fieldTree.topLevel.has(field));
  }

  getNestedFields(fieldTree, group) {
    return fieldTree.nested.get(group) ?? new Set();
  }

  pickFields(source, nestedFields) {
    if (nestedFields.size === 0) return source;

    const result = {};
    const groupings = new Map();

    for (const field of nestedFields) {
      const [head, ...rest] = field.split('.');
      if (rest.length === 0) {
        result[head] = source[head];
        continue;
      }

      const nestedSet = groupings.get(head) ?? new Set();
      nestedSet.add(rest.join('.'));
      groupings.set(head, nestedSet);
    }

    for (const [head, restFields] of groupings.entries()) {
      const nestedSource = source[head];
      if (nestedSource && typeof nestedSource === 'object' && !Array.isArray(nestedSource)) {
        result[head] = this.pickFields(nestedSource, restFields);
      }
    }

    return result;
  }
}

module.exports = {
  NotFoundError,
  TaskService,
};
