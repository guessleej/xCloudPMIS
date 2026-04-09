const { EventEmitter } = require('events');
const prisma = require('../lib/prisma');
const {
  automationRuleService,
  SYSTEM_RULE_KEY,
} = require('./automationRuleService');
const { createNotifications } = require('./notificationCenter');

class TaskRuleEngine extends EventEmitter {
  constructor(prismaClient = prisma) {
    super();
    this.prisma = prismaClient;

    this.on('task.status.changed', async (payload) => {
      await this.onTaskStatusChanged(payload);
    });
  }

  async emitAsync(eventName, payload) {
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      await listener(payload);
    }
  }

  async handleTaskUpdated({ beforeTask, afterTask, actorId }) {
    const summary = {
      triggered: false,
      ruleKey: null,
      parentProgress: null,
      notificationsSent: 0,
      notifiedRecipientIds: [],
    };

    await this.emitAsync('task.status.changed', {
      beforeTask,
      afterTask,
      actorId,
      summary,
    });

    return summary;
  }

  async onTaskStatusChanged({ beforeTask, afterTask, actorId, summary }) {
    if (!beforeTask || !afterTask) return;
    if (beforeTask.status === afterTask.status) return;
    if (afterTask.status !== 'done') return;

    summary.triggered = true;
    summary.ruleKey = 'task_completed_cascade';

    await this.handleTaskCompleted({
      beforeTask,
      afterTask,
      actorId,
      summary,
    });
  }

  async handleTaskCompleted({ afterTask, actorId, summary }) {
    if (afterTask.parentTaskId) {
      summary.parentProgress = await this.updateAncestorTaskProgress(afterTask.parentTaskId);
    }

    const notificationContext = await this.buildNotificationContext(afterTask, actorId);
    if (notificationContext.recipientIds.length > 0) {
      // Fire-and-forget：通知寫入不阻塞主要業務事務
      setImmediate(() => {
        createNotifications({
          prisma: this.prisma,
          recipients: notificationContext.recipientIds,
          type: 'task_completed',
          title: `任務已完成：${afterTask.title}`,
          message: `${notificationContext.projectNames}中的任務「${afterTask.title}」已移動到已完成欄位。`,
          resourceType: 'task',
          resourceId: afterTask.id,
        }).then((notifications) => {
          summary.notificationsSent = notifications.length;
          summary.notifiedRecipientIds = notifications.map((n) => n.recipientId);
        }).catch((err) => {
          console.warn('[taskRuleEngine] 通知寫入失敗:', err.message);
        });
      });

      // 預設值，讓 summary 立即可用
      summary.notificationsSent = notificationContext.recipientIds.length;
      summary.notifiedRecipientIds = notificationContext.recipientIds;
    }

    await automationRuleService.recordRuleExecution({
      companyId: notificationContext.companyId,
      ruleKey: SYSTEM_RULE_KEY,
      taskId: afterTask.id,
      projectIds: notificationContext.projectIds,
      triggeredById: actorId || null,
      status: 'success',
      context: {
        event: 'task.status.changed',
        toStatus: afterTask.status,
      },
      result: {
        notificationsSent: summary.notificationsSent,
        parentProgress: summary.parentProgress,
        projectIds: notificationContext.projectIds,
      },
    });
  }

  async updateAncestorTaskProgress(parentTaskId) {
    const ancestorChain = [];
    let currentTaskId = parentTaskId;

    while (currentTaskId) {
      const [parentTask, subtasks] = await Promise.all([
        this.prisma.task.findUnique({
          where: { id: currentTaskId },
          select: {
            id: true,
            title: true,
            parentTaskId: true,
          },
        }),
        this.prisma.task.findMany({
          where: {
            parentTaskId: currentTaskId,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
          },
        }),
      ]);

      if (!parentTask) break;

      const totalSubtasks = subtasks.length;
      const completedSubtasks = subtasks.filter((task) => task.status === 'done').length;
      const progressPercent = totalSubtasks > 0
        ? Math.round((completedSubtasks / totalSubtasks) * 100)
        : 0;

      await this.prisma.task.update({
        where: { id: currentTaskId },
        data: { progressPercent },
      });

      ancestorChain.push({
        taskId: parentTask.id,
        title: parentTask.title,
        totalSubtasks,
        completedSubtasks,
        progressPercent,
      });

      currentTaskId = parentTask.parentTaskId;
    }

    if (ancestorChain.length === 0) {
      return null;
    }

    const [directParent] = ancestorChain;
    return {
      parentTaskId: directParent.taskId,
      title: directParent.title,
      totalSubtasks: directParent.totalSubtasks,
      completedSubtasks: directParent.completedSubtasks,
      progressPercent: directParent.progressPercent,
      ancestorChain,
    };
  }

  async buildNotificationContext(task, actorId) {
    const [linkedProjects, taskAssignees, taskOwner] = await Promise.all([
      this.prisma.taskProject.findMany({
        where: { taskId: task.id },
        select: {
          projectId: true,
          project: {
            select: {
              id: true,
              companyId: true,
              name: true,
              ownerId: true,
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.taskAssigneeLink.findMany({
        where: { taskId: task.id },
        select: { userId: true },
      }),
      this.prisma.task.findUnique({
        where: { id: task.id },
        select: { createdById: true },
      }),
    ]);

    const fallbackProject = linkedProjects.length === 0 && task.projectId
      ? await this.prisma.project.findUnique({
          where: { id: task.projectId },
          select: {
            id: true,
            companyId: true,
            name: true,
            ownerId: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        })
      : null;

    const projects = linkedProjects.length > 0
      ? linkedProjects.map((item) => item.project).filter(Boolean)
      : (fallbackProject ? [fallbackProject] : []);

    const recipientSet = new Set();
    for (const project of projects) {
      if (project.ownerId) recipientSet.add(project.ownerId);
      for (const member of project.members || []) {
        if (member.userId) recipientSet.add(member.userId);
      }
    }

    for (const assignee of taskAssignees) {
      if (assignee.userId) recipientSet.add(assignee.userId);
    }

    if (taskOwner?.createdById) {
      recipientSet.add(taskOwner.createdById);
    }

    if (recipientSet.size === 0 && task.assigneeId) {
      recipientSet.add(task.assigneeId);
    }

    if (actorId) {
      recipientSet.delete(actorId);
    }

    return {
      companyId: projects[0]?.companyId || null,
      projectIds: projects.map((project) => project.id).filter(Boolean),
      recipientIds: [...recipientSet],
      projectNames: projects.length > 0
        ? projects.map((project) => project.name).join('、')
        : '專案',
    };
  }
}

module.exports = {
  TaskRuleEngine,
  taskRuleEngine: new TaskRuleEngine(),
};
