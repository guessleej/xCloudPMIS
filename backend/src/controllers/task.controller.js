const { PrismaClient } = require('@prisma/client');
const { NotFoundError, TaskService } = require('../services/task.service');

const prisma = new PrismaClient();

class TaskController {
  constructor(taskService = new TaskService(prisma)) {
    this.taskService = taskService;
  }

  async getProjectTasks(req, res, next) {
    try {
      const projectId = this.parseRequiredInt(req.params.projectId ?? req.params.id, 'projectId');
      const limit = this.parseOptionalInt(req.query.limit);
      const offset = this.parseOptionalInt(req.query.offset);
      const companyId = this.parseOptionalInt(req.query.companyId) ?? req.user?.companyId;
      const workspaceId = this.parseOptionalInt(req.query.workspaceId) ?? req.user?.workspaceId;

      const result = await this.taskService.listProjectTasks({
        projectId,
        companyId,
        workspaceId,
        limit,
        offset,
        optFields: req.query.opt_fields,
      });

      res.status(200).json({
        data: result.data,
        meta: {
          limit: result.limit,
          offset: result.offset,
          next_offset: result.nextOffset,
          has_more: result.hasMore,
          total: result.total,
          opt_fields: result.optFields,
          unsupported_fields: result.unsupportedFields,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: 'project_not_found',
          message: error.message,
        });
        return;
      }

      if (error instanceof Error && error.message.startsWith('Invalid')) {
        res.status(400).json({
          error: 'invalid_request',
          message: error.message,
        });
        return;
      }

      next(error);
    }
  }

  parseRequiredInt(value, fieldName) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${fieldName}. A positive integer is required.`);
    }
    return parsed;
  }

  parseOptionalInt(value) {
    if (value == null) return undefined;

    const raw = Array.isArray(value) ? value[0] : value;
    if (raw == null || raw === '') return undefined;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid numeric query parameter: ${raw}`);
    }

    return parsed;
  }
}

module.exports = {
  TaskController,
  taskController: new TaskController(),
};
