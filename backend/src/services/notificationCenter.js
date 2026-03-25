const {
  sendOutlookEmail,
  sendTaskAssignmentNotification,
  sendTaskReminder,
  sendOverdueWarning,
} = require('./emailService');

const DEFAULT_NOTIFICATION_SETTINGS = {
  type_assign: true,
  type_mention: true,
  type_comment: true,
  type_done: true,
  type_due: true,
  email_daily: true,
  email_instant: false,
  app_desktop: true,
  app_sound: false,
};

const TYPE_TO_SETTING_KEY = {
  task_assigned: 'type_assign',
  mentioned: 'type_mention',
  comment_added: 'type_comment',
  task_completed: 'type_done',
  deadline_approaching: 'type_due',
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNotificationSettings(source) {
  const raw = isPlainObject(source?.notifications) ? source.notifications : source;
  return Object.keys(DEFAULT_NOTIFICATION_SETTINGS).reduce((acc, key) => {
    acc[key] = typeof raw?.[key] === 'boolean' ? raw[key] : DEFAULT_NOTIFICATION_SETTINGS[key];
    return acc;
  }, {});
}

function getNotificationMeta(source) {
  const raw = isPlainObject(source?.notifications) ? source.notifications : source;
  return isPlainObject(raw?.meta) ? raw.meta : {};
}

function mergeNotificationSettings(source, settings, meta = undefined) {
  const root = isPlainObject(source) ? { ...source } : {};
  const current = isPlainObject(root.notifications) ? root.notifications : {};
  root.notifications = {
    ...current,
    ...settings,
    ...(meta !== undefined ? { meta: { ...getNotificationMeta(source), ...meta } } : {}),
  };
  return root;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildTaskLink(resourceType, resourceId) {
  if (resourceType === 'task' && resourceId) {
    return `${process.env.FRONTEND_URL || 'http://localhost:3838'}/#tasks`;
  }
  if (resourceType === 'comment' && resourceId) {
    return `${process.env.FRONTEND_URL || 'http://localhost:3838'}/#tasks`;
  }
  return process.env.FRONTEND_URL || 'http://localhost:3838';
}

async function getUserNotificationProfile(prisma, userId) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId, 10) },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      settings: true,
    },
  });

  if (!user) return null;

  return {
    ...user,
    notificationSettings: normalizeNotificationSettings(user.settings),
    notificationMeta: getNotificationMeta(user.settings),
  };
}

async function getUserNotificationSettings(prisma, userId) {
  const profile = await getUserNotificationProfile(prisma, userId);
  return profile?.notificationSettings || { ...DEFAULT_NOTIFICATION_SETTINGS };
}

async function updateUserNotificationSettings(prisma, userId, patch) {
  const existing = await prisma.user.findUnique({
    where: { id: parseInt(userId, 10) },
    select: { id: true, settings: true },
  });

  if (!existing) {
    throw new Error(`找不到使用者 #${userId}`);
  }

  const nextSettings = {
    ...normalizeNotificationSettings(existing.settings),
    ...Object.keys(DEFAULT_NOTIFICATION_SETTINGS).reduce((acc, key) => {
      if (typeof patch?.[key] === 'boolean') acc[key] = patch[key];
      return acc;
    }, {}),
  };

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      settings: mergeNotificationSettings(existing.settings, nextSettings),
    },
    select: { settings: true },
  });

  return normalizeNotificationSettings(updated.settings);
}

async function saveNotificationMeta(prisma, userId, metaPatch) {
  const existing = await prisma.user.findUnique({
    where: { id: parseInt(userId, 10) },
    select: { id: true, settings: true },
  });
  if (!existing) return null;

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      settings: mergeNotificationSettings(
        existing.settings,
        normalizeNotificationSettings(existing.settings),
        metaPatch
      ),
    },
  });

  return true;
}

async function sendGenericInstantEmail(user, notification) {
  if (!user?.email) return false;

  try {
    await sendOutlookEmail({
      to: user.email,
      subject: `xCloudPMIS 通知：${notification.title}`,
      htmlBody: `
        <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:24px;background:#f8fafc;color:#111827;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="padding:16px 20px;background:#b4233c;color:#ffffff;font-size:18px;font-weight:700;">
              xCloudPMIS 通知
            </div>
            <div style="padding:24px 20px;">
              <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">${user.name || '您好'}，您有一則新的系統通知。</p>
              <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${notification.title}</h2>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.8;color:#374151;">${notification.message}</p>
              <a href="${buildTaskLink(notification.resourceType, notification.resourceId)}" style="display:inline-block;background:#b4233c;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;font-size:14px;">
                前往系統查看
              </a>
            </div>
          </div>
        </div>
      `,
      priority: notification.type === 'deadline_approaching' ? 'high' : 'normal',
    });
    return true;
  } catch (error) {
    console.warn(`[notificationCenter] 即時郵件發送失敗 user=${user.id}: ${error.message}`);
    return false;
  }
}

async function maybeSendInstantEmail(prisma, profile, notification, emailContext = {}) {
  if (!profile?.notificationSettings?.email_instant) return false;

  try {
    if (notification.type === 'task_assigned' && emailContext.taskDetails) {
      await sendTaskAssignmentNotification(
        profile.email,
        profile.name,
        emailContext.taskDetails
      );
      return true;
    }

    if (notification.type === 'deadline_approaching' && emailContext.taskDetails) {
      const daysLeft = Math.ceil(
        (new Date(emailContext.taskDetails.dueDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft < 0) {
        await sendOverdueWarning(profile.email, profile.name, emailContext.taskDetails);
      } else {
        await sendTaskReminder(profile.email, profile.name, emailContext.taskDetails);
      }
      return true;
    }

    return await sendGenericInstantEmail(profile, notification);
  } catch (error) {
    console.warn(`[notificationCenter] 郵件通知失敗 user=${profile?.id}: ${error.message}`);
    return false;
  }
}

async function createNotification(prisma, payload) {
  const {
    recipientId,
    type,
    title,
    message,
    resourceType = null,
    resourceId = null,
    dedupeHours = 0,
    emailContext = null,
  } = payload;

  if (!recipientId || !type || !title || !message) {
    return null;
  }

  const profile = await getUserNotificationProfile(prisma, recipientId);
  if (!profile?.isActive) return null;

  const settingKey = TYPE_TO_SETTING_KEY[type];
  if (settingKey && !profile.notificationSettings[settingKey]) {
    return null;
  }

  if (dedupeHours > 0 && resourceType && resourceId) {
    const existing = await prisma.notification.findFirst({
      where: {
        recipientId: profile.id,
        type,
        resourceType,
        resourceId: parseInt(resourceId, 10),
        createdAt: {
          gte: new Date(Date.now() - dedupeHours * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
  }

  const notification = await prisma.notification.create({
    data: {
      recipientId: profile.id,
      type,
      title,
      message,
      resourceType,
      resourceId: resourceId ? parseInt(resourceId, 10) : null,
    },
  });

  await maybeSendInstantEmail(prisma, profile, notification, emailContext);
  return notification;
}

async function createNotifications(prisma, items) {
  const created = [];
  for (const item of items) {
    const notification = await createNotification(prisma, item);
    if (notification) created.push(notification);
  }
  return created;
}

function extractMentionedUsers(content, companyUsers) {
  if (!content?.includes('@')) return [];
  const normalizedContent = String(content);
  const orderedUsers = [...companyUsers].sort((left, right) => right.name.length - left.name.length);
  const matches = [];

  for (const user of orderedUsers) {
    const token = `@${user.name}`;
    if (normalizedContent.includes(token)) {
      matches.push(user);
    }
  }

  return matches;
}

async function createTaskAssignmentNotifications(prisma, { taskId, projectId, recipientId, actorId }) {
  if (!recipientId || recipientId === actorId) return [];

  const task = await prisma.task.findUnique({
    where: { id: parseInt(taskId, 10) },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });

  if (!task) return [];

  const actor = actorId
    ? await prisma.user.findUnique({
        where: { id: parseInt(actorId, 10) },
        select: { id: true, name: true },
      })
    : null;

  const title = `任務已指派給您：${task.title}`;
  const message = `${task.project?.name || '專案'}中的任務「${task.title}」已指派給您。`;

  const notification = await createNotification(prisma, {
    recipientId,
    type: 'task_assigned',
    title,
    message,
    resourceType: 'task',
    resourceId: task.id,
    dedupeHours: 2,
    emailContext: {
      taskDetails: {
        id: task.id,
        title: task.title,
        projectName: task.project?.name || '未指定專案',
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        description: task.description,
        assignerName: actor?.name || '系統',
      },
    },
  });

  return notification ? [notification] : [];
}

async function createTaskCommentNotifications(prisma, { taskId, authorId, content, commentId, parentId = null }) {
  const task = await prisma.task.findUnique({
    where: { id: parseInt(taskId, 10) },
    include: {
      project: {
        select: {
          id: true,
          companyId: true,
          name: true,
        },
      },
      assignee: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  });

  if (!task?.project?.companyId) {
    return { mentions: [], comments: [] };
  }

  const companyUsers = await prisma.user.findMany({
    where: {
      companyId: task.project.companyId,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  const mentionedUsers = extractMentionedUsers(content, companyUsers)
    .filter((user) => user.id !== authorId);

  const mentionNotifications = await createNotifications(
    prisma,
    mentionedUsers.map((user) => ({
      recipientId: user.id,
      type: 'mentioned',
      title: `${task.title} 中有人提及您`,
      message: `在任務「${task.title}」的留言中提及了您：${content}`,
      resourceType: 'comment',
      resourceId: commentId,
      dedupeHours: 1,
    }))
  );

  const recipientIds = new Set();
  if (task.assigneeId) recipientIds.add(task.assigneeId);
  if (task.createdById) recipientIds.add(task.createdById);

  if (parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parseInt(parentId, 10) },
      select: { userId: true },
    });
    if (parentComment?.userId) recipientIds.add(parentComment.userId);
  }

  recipientIds.delete(authorId);
  mentionedUsers.forEach((user) => recipientIds.delete(user.id));

  const commentNotifications = await createNotifications(
    prisma,
    [...recipientIds].map((recipientId) => ({
      recipientId,
      type: 'comment_added',
      title: `任務有新留言：${task.title}`,
      message: `${task.project.name}中的任務「${task.title}」有新的留言。`,
      resourceType: 'comment',
      resourceId: commentId,
      dedupeHours: 1,
    }))
  );

  return {
    mentions: mentionNotifications,
    comments: commentNotifications,
  };
}

async function ensureDeadlineNotificationsForUser(prisma, { userId, companyId }) {
  if (!userId || !companyId) return { created: 0, summarySent: false };

  const profile = await getUserNotificationProfile(prisma, userId);
  if (!profile?.isActive || !profile.notificationSettings.type_due) {
    return { created: 0, summarySent: false };
  }

  const now = new Date();
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const since = startOfToday();

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: parseInt(userId, 10),
      deletedAt: null,
      status: { not: 'done' },
      dueDate: { not: null, lte: nextDay },
      project: {
        companyId: parseInt(companyId, 10),
        deletedAt: null,
      },
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  let created = 0;
  for (const task of tasks) {
    const existing = await prisma.notification.findFirst({
      where: {
        recipientId: parseInt(userId, 10),
        type: 'deadline_approaching',
        resourceType: 'task',
        resourceId: task.id,
        createdAt: { gte: since },
      },
    });

    if (existing) continue;

    const isOverdue = new Date(task.dueDate) < now;
    const notification = await createNotification(prisma, {
      recipientId: parseInt(userId, 10),
      type: 'deadline_approaching',
      title: isOverdue ? `任務已逾期：${task.title}` : `任務即將到期：${task.title}`,
      message: `${task.project?.name || '專案'}中的任務「${task.title}」將於 ${new Date(task.dueDate).toLocaleDateString('zh-TW')} 截止。`,
      resourceType: 'task',
      resourceId: task.id,
      dedupeHours: 24,
      emailContext: {
        taskDetails: {
          id: task.id,
          title: task.title,
          projectName: task.project?.name || '未指定專案',
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          description: task.description,
        },
      },
    });

    if (notification) created += 1;
  }

  const summarySent = await maybeSendDailySummary(prisma, profile, tasks);
  return { created, summarySent };
}

async function maybeSendDailySummary(prisma, profile, dueTasks) {
  if (!profile?.notificationSettings?.email_daily || !profile.email) {
    return false;
  }

  const key = todayKey();
  if (profile.notificationMeta?.dailySummaryDate === key) {
    return false;
  }

  const activeTasks = await prisma.task.count({
    where: {
      assigneeId: profile.id,
      deletedAt: null,
      status: { not: 'done' },
    },
  });

  const overdueCount = dueTasks.filter((task) => new Date(task.dueDate) < new Date()).length;
  const upcomingCount = dueTasks.filter((task) => new Date(task.dueDate) >= new Date()).length;

  if (activeTasks === 0 && overdueCount === 0 && upcomingCount === 0) {
    await saveNotificationMeta(prisma, profile.id, { dailySummaryDate: key });
    return false;
  }

  try {
    await sendOutlookEmail({
      to: profile.email,
      subject: `xCloudPMIS 每日摘要 ${key}`,
      htmlBody: `
        <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:24px;background:#f8fafc;color:#111827;">
          <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="padding:16px 20px;background:#111827;color:#ffffff;font-size:18px;font-weight:700;">
              xCloudPMIS 每日摘要
            </div>
            <div style="padding:24px 20px;">
              <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">${profile.name || '您好'}，以下是今天的任務摘要。</p>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                ${[
                  { label: '進行中任務', value: activeTasks, color: '#2563eb' },
                  { label: '逾期任務', value: overdueCount, color: '#dc2626' },
                  { label: '24 小時內到期', value: upcomingCount, color: '#d97706' },
                ].map((item) => `
                  <div style="flex:1 1 160px;border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#f8fafc;">
                    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">${item.label}</div>
                    <div style="font-size:28px;font-weight:800;color:${item.color};">${item.value}</div>
                  </div>
                `).join('')}
              </div>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3838'}/#inbox" style="display:inline-block;background:#b4233c;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;font-size:14px;">
                前往收件匣查看
              </a>
            </div>
          </div>
        </div>
      `,
      priority: overdueCount > 0 ? 'high' : 'normal',
    });
    await saveNotificationMeta(prisma, profile.id, { dailySummaryDate: key });
    return true;
  } catch (error) {
    console.warn(`[notificationCenter] 每日摘要寄送失敗 user=${profile.id}: ${error.message}`);
    return false;
  }
}

module.exports = {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  getUserNotificationSettings,
  updateUserNotificationSettings,
  createNotification,
  createNotifications,
  createTaskAssignmentNotifications,
  createTaskCommentNotifications,
  ensureDeadlineNotificationsForUser,
};
