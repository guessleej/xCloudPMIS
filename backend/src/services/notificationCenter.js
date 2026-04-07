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
 * 通知 type → 使用者偏好設定 key 的映射
 * 與 Prisma NotificationType enum 一致：
 *   task_assigned, deadline_approaching, mentioned, comment_added,
 *   task_completed, milestone_achieved
 * 若 type 不在映射表中，預設允許送出
 */
const TYPE_TO_SETTING_KEY = {
  task_assigned:        'taskAssigned',
  deadline_approaching: 'taskDueReminder',   // DB enum: deadline_approaching
  task_overdue:         'taskOverdue',       // DB enum: task_overdue
  task_completed:       'taskCompleted',
  mentioned:            'mentioned',
  comment_added:        'mentioned',          // 留言通知歸類到「被提及」
  milestone_achieved:   'projectUpdate',      // 里程碑歸類到「專案更新」
};

/**
 * 建立通知（批量）— 會依據每位收件者的通知偏好過濾
 * @param {object} opts - { prisma, recipients: number[], type, title, message, resourceType?, resourceId? }
 */
async function createNotifications(opts = {}) {
  const { prisma, recipients = [], type, title, message, resourceType, resourceId } = opts;
  if (!prisma || !recipients.length || !type || !title) return [];
  try {
    // ── 依據每位收件者的偏好過濾 ────────────────────────────
    const settingKey = TYPE_TO_SETTING_KEY[type];
    let filteredRecipients = recipients;

    if (settingKey) {
      const checks = await Promise.all(
        recipients.map(async (rid) => {
          const prefs = await getUserNotificationSettings(prisma, rid);
          return { rid, allowed: !!prefs[settingKey] && !!prefs.pushNotifications };
        }),
      );
      filteredRecipients = checks.filter(c => c.allowed).map(c => c.rid);
    }

    if (!filteredRecipients.length) return [];

    const now = new Date().toISOString();
    const data = filteredRecipients.map(recipientId => ({
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

/**
 * @提及通知 — 評論中被 @ 的使用者
 * @param {object} prisma
 * @param {object} opts - { taskId, authorId, mentionIds, content, commentId }
 */
async function createMentionNotifications(prisma, opts = {}) {
  const { taskId, authorId, mentionIds = [], content, commentId } = opts;
  // 排除留言作者本人
  const recipients = mentionIds.filter(id => id !== authorId);
  if (!recipients.length) return [];
  try {
    const task = await prisma.task.findUnique({
      where:  { id: taskId },
      select: { title: true },
    });
    return createNotifications({
      prisma,
      recipients,
      type:         'mentioned',
      title:        `你在「${task?.title || `#${taskId}`}」被提及`,
      message:      content ? content.slice(0, 80) : '',
      resourceType: 'task',
      resourceId:   taskId,
    });
  } catch (e) {
    console.warn('[notificationCenter] createMentionNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 里程碑達成通知 — 通知專案所有成員
 * @param {object} prisma
 * @param {object} opts - { milestoneId, projectId, actorId }
 */
async function createMilestoneAchievedNotifications(prisma, opts = {}) {
  const { milestoneId, projectId, actorId } = opts;
  if (!milestoneId || !projectId) return [];
  try {
    const milestone = await prisma.milestone.findUnique({
      where:  { id: milestoneId },
      select: { name: true },
    });
    // 取得專案全體成員（排除操作者）
    const members = await prisma.projectMember.findMany({
      where:  { projectId },
      select: { userId: true },
    });
    const recipients = members
      .map(m => m.userId)
      .filter(uid => uid !== actorId);
    if (!recipients.length) return [];

    return createNotifications({
      prisma,
      recipients,
      type:         'milestone_achieved',
      title:        `里程碑「${milestone?.name || `#${milestoneId}`}」已達成 🎉`,
      message:      `專案里程碑已完成`,
      resourceType: 'milestone',
      resourceId:   milestoneId,
    });
  } catch (e) {
    console.warn('[notificationCenter] createMilestoneAchievedNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 掃描即將到期任務 — deadline_approaching
 * 條件：dueDate 在 1~2 天內、狀態不是 done/cancelled、未刪除
 *       且 24 小時內未對同一任務+收件人送過相同通知
 */
async function scanDeadlineApproaching(prisma) {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(0,0,0,0);
  const dayAfterTomorrow = new Date(now); dayAfterTomorrow.setDate(now.getDate() + 2); dayAfterTomorrow.setHours(23,59,59,999);

  try {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate:   { gte: tomorrow, lte: dayAfterTomorrow },
        status:    { not: 'done' },
        deletedAt: null,
        assigneeId: { not: null },
      },
      select: { id: true, title: true, assigneeId: true, dueDate: true },
    });

    let created = 0;
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const task of tasks) {
      // 去重：24h 內已通知則跳過
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  task.assigneeId,
          type:         'deadline_approaching',
          resourceType: 'task',
          resourceId:   task.id,
          createdAt:    { gte: cutoff },
        },
      });
      if (existing) continue;

      const dueStr = task.dueDate.toLocaleDateString('zh-TW');
      await createNotifications({
        prisma,
        recipients:   [task.assigneeId],
        type:         'deadline_approaching',
        title:        `任務即將到期：${task.title || `#${task.id}`}`,
        message:      `截止日期 ${dueStr}，請儘快處理`,
        resourceType: 'task',
        resourceId:   task.id,
      });
      created++;
    }
    return created;
  } catch (e) {
    console.warn('[notificationCenter] scanDeadlineApproaching 失敗:', e.message);
    return 0;
  }
}

/**
 * 產生定期摘要通知 — system_digest
 *
 * 依據每位使用者的 digestFrequency（daily / weekly / monthly）設定，
 * 在足夠時間間隔後產生一份摘要通知，內容包含：
 *   1. 未讀通知數
 *   2. 待辦 / 進行中任務數
 *   3. 逾期任務數
 *   4. 即將到期任務（7 天內）
 *   5. 期間內已完成任務數
 *   6. 所屬專案進度概覽
 */
async function generateDigestNotifications(prisma) {
  const FREQ_MS = {
    daily:   24 * 60 * 60 * 1000,        // 1 天
    weekly:  7 * 24 * 60 * 60 * 1000,     // 7 天
    monthly: 30 * 24 * 60 * 60 * 1000,    // 30 天
  };
  const FREQ_LABEL = { daily: '每日', weekly: '每週', monthly: '每月' };

  const now = new Date();
  let created = 0;

  try {
    // 取得所有使用者（含 settings）
    const users = await prisma.user.findMany({
      where:  { isActive: true },
      select: { id: true, name: true, settings: true },
    });

    for (const user of users) {
      const settings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...((user.settings && typeof user.settings === 'object')
          ? (user.settings.notificationSettings || {})
          : {}),
      };

      // 使用者關閉了摘要
      if (!settings.weeklyDigest) continue;

      const freq = settings.digestFrequency || 'weekly';
      const interval = FREQ_MS[freq] || FREQ_MS.weekly;

      // 去重：上次摘要通知是否已在間隔內
      const lastDigest = await prisma.notification.findFirst({
        where: {
          recipientId: user.id,
          type:        'system_digest',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastDigest && (now - new Date(lastDigest.createdAt)) < interval) {
        continue; // 尚未到發送時間
      }

      // ── 收集統計資料 ───────────────────────────────────
      const periodStart = new Date(now.getTime() - interval);

      // 1) 未讀通知數
      const unreadCount = await prisma.notification.count({
        where: { recipientId: user.id, isRead: false },
      });

      // 2) 待辦 & 進行中任務數
      const pendingTasks = await prisma.task.count({
        where: {
          assigneeId: user.id,
          status:     { in: ['todo', 'in_progress'] },
          deletedAt:  null,
        },
      });

      // 3) 逾期任務數
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const overdueTasks = await prisma.task.count({
        where: {
          assigneeId: user.id,
          status:     { not: 'done' },
          dueDate:    { lt: todayStart },
          deletedAt:  null,
        },
      });

      // 4) 即將到期任務（7 天內）
      const weekLater = new Date(now); weekLater.setDate(weekLater.getDate() + 7);
      const upcomingDeadlines = await prisma.task.count({
        where: {
          assigneeId: user.id,
          status:     { not: 'done' },
          dueDate:    { gte: todayStart, lte: weekLater },
          deletedAt:  null,
        },
      });

      // 5) 期間內已完成任務數
      const completedTasks = await prisma.task.count({
        where: {
          assigneeId: user.id,
          status:     'done',
          updatedAt:  { gte: periodStart },
          deletedAt:  null,
        },
      });

      // 6) 專案進度概覽
      const myProjects = await prisma.projectMember.findMany({
        where:  { userId: user.id },
        select: { projectId: true },
      });
      const projIds = myProjects.map(p => p.projectId);

      let projectSummaryLines = [];
      if (projIds.length > 0) {
        for (const pid of projIds.slice(0, 5)) { // 最多列出 5 個專案
          const proj = await prisma.project.findUnique({
            where:  { id: pid },
            select: { name: true },
          });
          const total = await prisma.task.count({
            where: { projectId: pid, deletedAt: null },
          });
          const done = await prisma.task.count({
            where: { projectId: pid, status: 'done', deletedAt: null },
          });
          if (total > 0) {
            const pct = Math.round((done / total) * 100);
            projectSummaryLines.push(`  • ${proj?.name || `專案 #${pid}`}：${done}/${total}（${pct}%）`);
          }
        }
      }

      // ── 組合摘要內容 ──────────────────────────────────
      const lines = [
        `📊 ${FREQ_LABEL[freq]}工作摘要`,
        ``,
        `📬 未讀通知：${unreadCount} 則`,
        `📋 待辦 / 進行中：${pendingTasks} 項`,
        `⚠️ 逾期任務：${overdueTasks} 項`,
        `⏰ 7 天內到期：${upcomingDeadlines} 項`,
        `✅ 期間完成：${completedTasks} 項`,
      ];

      if (projectSummaryLines.length > 0) {
        lines.push(``, `📁 專案進度：`);
        lines.push(...projectSummaryLines);
      }

      const message = lines.join('\n');
      const title = `${FREQ_LABEL[freq]}摘要報告`;

      // 摘要不經偏好過濾，直接建立
      await prisma.notification.create({
        data: {
          recipientId:  user.id,
          type:         'system_digest',
          title,
          message,
          resourceType: 'digest',
          isRead:       false,
        },
      });
      created++;
    }

    return created;
  } catch (e) {
    console.warn('[notificationCenter] generateDigestNotifications 失敗:', e.message);
    return 0;
  }
}

/**
 * 掃描已逾期任務 — task_overdue
 * 條件：dueDate < 今天、狀態不是 done/cancelled、未刪除
 *       且 24 小時內未對同一任務+收件人送過相同通知
 */
async function scanTaskOverdue(prisma) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);

  try {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate:    { lt: todayStart },
        status:     { not: 'done' },
        deletedAt:  null,
        assigneeId: { not: null },
      },
      select: { id: true, title: true, assigneeId: true, dueDate: true },
    });

    let created = 0;
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const task of tasks) {
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  task.assigneeId,
          type:         'task_overdue',
          resourceType: 'task',
          resourceId:   task.id,
          createdAt:    { gte: cutoff },
        },
      });
      if (existing) continue;

      const overdueDays = Math.ceil((todayStart - task.dueDate) / 86400000);
      await createNotifications({
        prisma,
        recipients:   [task.assigneeId],
        type:         'task_overdue',
        title:        `任務已逾期：${task.title || `#${task.id}`}`,
        message:      `已逾期 ${overdueDays} 天，請立即處理`,
        resourceType: 'task',
        resourceId:   task.id,
      });
      created++;
    }
    return created;
  } catch (e) {
    console.warn('[notificationCenter] scanTaskOverdue 失敗:', e.message);
    return 0;
  }
}

module.exports = {
  DEFAULT_NOTIFICATION_SETTINGS,
  createNotifications,
  createTaskAssignmentNotifications,
  createTaskCommentNotifications,
  createMentionNotifications,
  createMilestoneAchievedNotifications,
  scanDeadlineApproaching,
  scanTaskOverdue,
  generateDigestNotifications,
  getUnreadCount,
  getUserNotificationSettings,
  updateUserNotificationSettings,
};
