/**
 * notificationCenter — 通知中心服務
 * 提供通知設定的讀寫，以及建立通知的統一入口
 */

// 預設通知設定（使用者未自訂時回傳）
const DEFAULT_NOTIFICATION_SETTINGS = {
  taskAssigned:        true,
  taskDueReminder:     true,
  taskOverdue:         true,
  taskCompleted:       false,
  mentioned:           true,
  projectUpdate:       true,
  weeklyDigest:        true,
  emailNotifications:  false,
  pushNotifications:   true,
  digestFrequency:     'weekly',
};

/**
 * 建立通知（批量）
 * @param {object} opts - { prisma, recipients: number[], type, title, message, resourceType?, resourceId? }
 */
async function createNotifications(opts = {}) {
  const { prisma, recipients = [], type, title, message, resourceType, resourceId } = opts;
  if (!prisma || !recipients.length || !type || !title) return [];
  try {
    const now = new Date().toISOString();
    const data = recipients.map(recipientId => ({
      recipientId,
      type,
      title,
      message: message || '',
      isRead: false,
      resourceType: resourceType || null,
      resourceId: resourceId ? (parseInt(String(resourceId), 10) || null) : null,
      createdAt: now,
    }));
    await prisma.notification.createMany({ data });
    return data;
  } catch (e) {
    console.warn('[notificationCenter] createNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 取得使用者未讀通知數量
 */
async function getUnreadCount(userId) {
  return 0;
}

/**
 * 取得使用者通知設定
 * 儲存於 User.settings（PostgreSQL JSON 欄位）中的 notificationSettings key
 */
async function getUserNotificationSettings(prisma, userId) {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: parseInt(userId) },
      select: { settings: true },
    });
    const saved = user?.settings?.notificationSettings || {};
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };
  } catch (e) {
    console.warn('[notificationCenter] 讀取設定失敗:', e.message);
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

async function updateUserNotificationSettings(prisma, userId, updates = {}) {
  try {
    const current = await getUserNotificationSettings(prisma, userId);
    const merged  = { ...current, ...updates };

    // 讀取現有 settings JSON，僅更新 notificationSettings key
    const user = await prisma.user.findUnique({
      where:  { id: parseInt(userId) },
      select: { settings: true },
    });
    const existingSettings = (user?.settings && typeof user.settings === 'object') ? user.settings : {};
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data:  { settings: { ...existingSettings, notificationSettings: merged } },
    });
    return merged;
  } catch (e) {
    console.warn('[notificationCenter] 寫入設定失敗:', e.message);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * 任務指派通知
 * @param {object} prisma
 * @param {object} opts - { taskId, projectId, recipientId, actorId }
 */
async function createTaskAssignmentNotifications(prisma, opts = {}) {
  const { taskId, projectId, recipientId, actorId } = opts;
  if (!recipientId || recipientId === actorId) return [];
  try {
    const task = await prisma.task.findUnique({
      where:   { id: taskId },
      select:  { title: true },
    });
    return createNotifications({
      prisma,
      recipients:   [recipientId],
      type:         'task_assigned',
      title:        `已被指派任務：${task?.title || `#${taskId}`}`,
      message:      `你已被指派到任務「${task?.title || `#${taskId}`}」`,
      resourceType: 'task',
      resourceId:   taskId,
    });
  } catch (e) {
    console.warn('[notificationCenter] createTaskAssignmentNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 任務評論通知（提及 + 任務負責人）
 * @param {object} prisma
 * @param {object} opts - { taskId, authorId, content, commentId, parentId }
 */
async function createTaskCommentNotifications(prisma, opts = {}) {
  const { taskId, authorId, content, commentId, parentId } = opts;
  try {
    const task = await prisma.task.findUnique({
      where:   { id: taskId },
      select:  { title: true, assigneeId: true },
    });

    const recipientSet = new Set();

    // 通知任務負責人（非留言者）
    if (task?.assigneeId && task.assigneeId !== authorId) {
      recipientSet.add(task.assigneeId);
    }

    // 若為回覆，通知原留言者
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where:  { id: parentId },
        select: { userId: true },
      });
      if (parent?.userId && parent.userId !== authorId) {
        recipientSet.add(parent.userId);
      }
    }

    if (!recipientSet.size) return [];

    return createNotifications({
      prisma,
      recipients:   [...recipientSet],
      type:         'comment_added',
      title:        `任務「${task?.title || `#${taskId}`}」有新留言`,
      message:      content ? content.slice(0, 80) : '',
      resourceType: 'task',
      resourceId:   taskId,
    });
  } catch (e) {
    console.warn('[notificationCenter] createTaskCommentNotifications 失敗:', e.message);
    return [];
  }
}

module.exports = {
  DEFAULT_NOTIFICATION_SETTINGS,
  createNotifications,
  createTaskAssignmentNotifications,
  createTaskCommentNotifications,
  getUnreadCount,
  getUserNotificationSettings,
  updateUserNotificationSettings,
};
