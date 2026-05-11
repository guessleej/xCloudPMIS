/**
 * notificationCenter — 通知中心服務
 * 提供通知設定的讀寫，以及建立通知的統一入口
 * 當使用者開啟 emailNotifications 時，會同步透過 emailService 發送郵件
 */

const emailService = require('./emailService');
// 延遲載入 userOutlookService，避免循環依賴 & 註解語法問題
const getUserOutlookService = () => require('./userOutlookService');
// 行事曆 ICS 連結產生器（郵件「加入行事曆」按鈕用）
const getCalendarAddUrl = () => require('../routes/calendar').getCalendarAddUrl;

// 預設通知設定（使用者未自訂時回傳）
const DEFAULT_NOTIFICATION_SETTINGS = {
  taskAssigned:        true,
  taskDueReminder:     true,
  taskOverdue:         true,
  taskCompleted:       false,
  mentioned:           true,
  projectUpdate:       true,
  dailyProgressReminder: true,
  dailyProgressReminderTime: '14:00',
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
 * 通知 type → emailService 函式名 的映射
 * 用來決定要呼叫哪個郵件模板函式
 */
/**
 * 通知 type → emailService accent color 的映射（通用郵件用）
 */
const TYPE_TO_EMAIL_COLOR = {
  task_assigned:        '#3B82F6',
  comment_added:        '#F59E0B',
  mentioned:            '#8B5CF6',
  deadline_approaching: '#C70018',
  task_overdue:         '#DC2626',
  milestone_achieved:   '#0EA5E9',
  task_completed:       '#16824B',
  system_digest:        '#7C3AED',
};

/**
 * 通知 type → 郵件主旨前綴
 */
const TYPE_TO_EMAIL_SUBJECT_PREFIX = {
  task_assigned:        '📋',
  comment_added:        '💬',
  mentioned:            '📢',
  deadline_approaching: '⏰',
  task_overdue:         '🚨',
  milestone_achieved:   '🎉',
  task_completed:       '✅',
  system_digest:        '📊',
};

/**
 * 非同步發送 Email 通知（fire-and-forget，不阻塞通知建立流程）
 * 規則很簡單：使用者開啟 emailNotifications → 系統通知有一封，email 就寄一封
 */
async function dispatchEmailNotifications(opts = {}) {
  const { prisma, recipientIds = [], type, title, message, senderUserId, resourceType, resourceId } = opts;
  if (!recipientIds.length) return;

  try {
    const [users, senderUser] = await Promise.all([
      prisma.user.findMany({
        where:  { id: { in: recipientIds } },
        select: { id: true, email: true, name: true, settings: true },
      }),
      senderUserId ? prisma.user.findUnique({ where: { id: senderUserId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    const senderName = senderUser?.name || null;

    const emailJobs = [];
    const prefix      = TYPE_TO_EMAIL_SUBJECT_PREFIX[type] || '🔔';
    const accentColor = TYPE_TO_EMAIL_COLOR[type] || '#3B82F6';

    for (const user of users) {
      const prefs = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...((user.settings && typeof user.settings === 'object')
          ? (user.settings.notificationSettings || {})
          : {}),
      };
      if (!prefs.emailNotifications || !user.email) continue;

      const subject = `${prefix} ${title}`;
      const htmlMessage = (message || '').replace(/\n/g, '<br>');
      const senderBadge = senderName
        ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">來自：<strong style="color:#374151;">${senderName}</strong></p>`
        : '';
      const htmlBody = `
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a202c;font-weight:700;">
          ${title}
        </h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          系統通知 · ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
        </p>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;">
          ${user.name} 您好，
        </p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
          ${senderBadge}
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.75;">
            ${htmlMessage || '（無詳細說明）'}
          </p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:10px 0 8px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3838'}"
                 style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
                前往系統查看 →
              </a>
            </td>
          </tr>
          ${type === 'task_assigned' && resourceType === 'task' && resourceId ? `
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              <a href="${(() => { try { return getCalendarAddUrl()(user.id, resourceId); } catch { return ''; } })()}"
                 style="display:inline-block;background:#0078d4;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:8px;">
                📅 加入 Outlook 行事曆
              </a>
            </td>
          </tr>` : ''}
        </table>
      `;

      const wrappedHtml = emailService.wrapEmailTemplate
        ? emailService.wrapEmailTemplate({ title: subject, accentColor, content: htmlBody })
        : htmlBody;

      // 優先使用操作者的 Delegated Token（從其 Outlook 信箱發送）
      // 無 Token 或失敗時自動降級為 ACS 系統信箱
      if (senderUserId) {
        emailJobs.push(() => getUserOutlookService().sendNotification(senderUserId, {
          to: user.email, subject, htmlBody: wrappedHtml,
        }));
      } else {
        emailJobs.push(() => emailService.sendEmail({
          to: user.email, subject, htmlBody: wrappedHtml,
        }));
      }
    }

    if (emailJobs.length > 0) {
      console.log(`📧 [notificationCenter] 觸發 Email 發送：${emailJobs.length} 封（type: ${type}）`);
      emailService.batchSendEmails(emailJobs).catch(err => {
        console.warn('[notificationCenter] Email 批次發送失敗:', err.message);
      });
    }
  } catch (e) {
    console.warn('[notificationCenter] dispatchEmailNotifications 失敗:', e.message);
  }
}

/**
 * 建立通知（批量）— 會依據每位收件者的通知偏好過濾
 * @param {object} opts - { prisma, recipients: number[], type, title, message, resourceType?, resourceId? }
 */
async function createNotifications(opts = {}) {
  const { prisma, recipients = [], type, title, message, resourceType, resourceId, senderUserId } = opts;
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

    // ── Email 通知（非同步發送，不阻塞）────────────────────
    dispatchEmailNotifications({
      prisma,
      recipientIds: filteredRecipients,
      type,
      title,
      message,
      resourceType,
      resourceId: resourceId ? (parseInt(String(resourceId), 10) || null) : null,
      senderUserId,
    });

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

  // 回讀確認寫入成功
  const verify = await prisma.user.findUnique({
    where:  { id: parseInt(userId) },
    select: { settings: true },
  });
  const saved = verify?.settings?.notificationSettings;
  if (!saved) {
    throw new Error('通知設定寫入後無法讀回，請檢查資料庫欄位');
  }
  return saved;
}

/**
 * 專案負責人指派通知
 * @param {object} prisma
 * @param {object} opts - { projectId, projectName, recipientId, actorId }
 */
async function createProjectAssignmentNotifications(prisma, opts = {}) {
  const { projectId, projectName, recipientId, actorId } = opts;
  if (!recipientId) return [];
  try {
    const name = projectName || `專案 #${projectId}`;
    return createNotifications({
      prisma,
      recipients:   [recipientId],
      type:         'task_assigned',
      title:        `你已被指派為專案負責人：${name}`,
      message:      `你已被指派為「${name}」的專案負責人`,
      resourceType: 'project',
      resourceId:   projectId,
      senderUserId: actorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createProjectAssignmentNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 專案成員加入通知 — 只通知新加入的成員，不通知既有成員
 * @param {object} prisma
 * @param {object} opts - { projectId, projectName, recipientIds, actorId }
 */
async function createProjectMemberAddedNotifications(prisma, opts = {}) {
  const { projectId, projectName, recipientIds = [], actorId } = opts;
  const recipients = [...new Set(recipientIds.map(Number).filter(Boolean))]
    .filter(uid => uid !== actorId);
  if (!projectId || !recipients.length) return [];

  try {
    const name = projectName || `專案 #${projectId}`;
    return createNotifications({
      prisma,
      recipients,
      type:         'milestone_achieved', // 借用 projectUpdate 偏好，不新增 DB enum
      title:        `你已加入專案：${name}`,
      message:      `你已被加入「${name}」專案，可以開始查看專案內容與任務。`,
      resourceType: 'project',
      resourceId:   projectId,
      senderUserId: actorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createProjectMemberAddedNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 任務指派通知
 * @param {object} prisma
 * @param {object} opts - { taskId, projectId, recipientId, actorId }
 */
async function createTaskAssignmentNotifications(prisma, opts = {}) {
  const { taskId, projectId, recipientId, actorId } = opts;
  if (!recipientId) return [];
  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId }, select: { title: true } }),
      actorId ? prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }) : null,
    ]);
    const actorName = actor?.name || '系統';
    const taskTitle = task?.title || `#${taskId}`;
    return createNotifications({
      prisma,
      recipients:   [recipientId],
      type:         'task_assigned',
      title:        `${actorName} 指派任務給你：${taskTitle}`,
      message:      `${actorName} 將任務「${taskTitle}」指派給你`,
      resourceType: 'task',
      resourceId:   taskId,
      senderUserId: actorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createTaskAssignmentNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 任務評論通知（專案負責人 + 任務負責人 + 回覆原留言者）
 * @param {object} prisma
 * @param {object} opts - { taskId, authorId, content, commentId, parentId }
 */
async function createTaskCommentNotifications(prisma, opts = {}) {
  const { taskId, authorId, content, commentId, parentId } = opts;
  try {
    const [task, author] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          assigneeId: true,
          project: { select: { ownerId: true } },
        },
      }),
      authorId ? prisma.user.findUnique({ where: { id: authorId }, select: { name: true } }) : null,
    ]);

    const recipientSet = new Set();

    // 通知專案負責人（非留言者）
    if (task?.project?.ownerId && task.project.ownerId !== authorId) {
      recipientSet.add(task.project.ownerId);
    }

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

    const authorName = author?.name || '某人';
    const taskTitle = task?.title || `#${taskId}`;
    return createNotifications({
      prisma,
      recipients:   [...recipientSet],
      type:         'comment_added',
      title:        `${authorName} 在任務「${taskTitle}」留言`,
      message:      content ? `${authorName}：${content.slice(0, 70)}` : '',
      resourceType: 'task',
      resourceId:   taskId,
      senderUserId: authorId || null,
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
    const [task, author] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId }, select: { title: true } }),
      authorId ? prisma.user.findUnique({ where: { id: authorId }, select: { name: true } }) : null,
    ]);
    const authorName = author?.name || '某人';
    const taskTitle = task?.title || `#${taskId}`;
    return createNotifications({
      prisma,
      recipients,
      type:         'mentioned',
      title:        `${authorName} 在「${taskTitle}」提到了你`,
      message:      content ? `${authorName}：${content.slice(0, 70)}` : '',
      resourceType: 'task',
      resourceId:   taskId,
      senderUserId: authorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createMentionNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 任務完成通知 — 通知專案負責人（owner）
 * @param {object} prisma
 * @param {object} opts - { taskId, projectId, actorId }
 */
async function createTaskCompletedNotifications(prisma, opts = {}) {
  const { taskId, projectId, actorId } = opts;
  if (!taskId || !projectId) return [];
  try {
    const [task, project] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId }, select: { title: true, assigneeId: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, ownerId: true } }),
    ]);
    // 若無專案負責人，或操作者就是負責人本人 → 不通知
    if (!project?.ownerId || project.ownerId === actorId) return [];
    return createNotifications({
      prisma,
      recipients:   [project.ownerId],
      type:         'task_completed',
      title:        `任務已完成：${task?.title || `#${taskId}`}`,
      message:      `專案「${project.name}」中的任務「${task?.title || `#${taskId}`}」已被標記為完成`,
      resourceType: 'task',
      resourceId:   taskId,
      senderUserId: actorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createTaskCompletedNotifications 失敗:', e.message);
    return [];
  }
}

/**
 * 專案狀態變更通知 — 通知專案負責人 + 專案成員
 * @param {object} prisma
 * @param {object} opts - { projectId, projectName, newStatus, actorId }
 */
async function createProjectStatusChangeNotifications(prisma, opts = {}) {
  const { projectId, projectName, newStatus, actorId } = opts;
  if (!projectId || !newStatus) return [];

  const statusLabel = {
    planning: '規劃中', active: '進行中', on_hold: '暫停',
    completed: '已完成', cancelled: '已取消', archived: '已封存',
  };
  const label = statusLabel[newStatus] || newStatus;
  const name = projectName || `專案 #${projectId}`;

  try {
    // 取得專案負責人 + 全體成員（排除操作者）
    const [project, members] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
      prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
    ]);
    const recipientSet = new Set(members.map(m => m.userId));
    if (project?.ownerId) recipientSet.add(project.ownerId);
    // 排除操作者本人
    if (actorId) recipientSet.delete(actorId);
    if (!recipientSet.size) return [];

    return createNotifications({
      prisma,
      recipients:   [...recipientSet],
      type:         'milestone_achieved',   // 借用 milestone_achieved → 對應 projectUpdate 偏好
      title:        `專案「${name}」狀態變更為「${label}」`,
      message:      `專案「${name}」的狀態已更新為「${label}」`,
      resourceType: 'project',
      resourceId:   projectId,
      senderUserId: actorId || null,
    });
  } catch (e) {
    console.warn('[notificationCenter] createProjectStatusChangeNotifications 失敗:', e.message);
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
    for (const task of tasks) {
      // 去重：同一任務已有通知（含軟刪除）則跳過，避免使用者刪除後重複建立
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  task.assigneeId,
          type:         'deadline_approaching',
          resourceType: 'task',
          resourceId:   task.id,
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

    // ── 專案 (Project) 到期掃描 ────────────────────────────
    const projects = await prisma.project.findMany({
      where: {
        endDate:   { gte: tomorrow, lte: dayAfterTomorrow },
        status:    { notIn: ['completed', 'cancelled', 'archived'] },
        deletedAt: null,
        ownerId:   { not: null },
      },
      select: { id: true, name: true, ownerId: true, endDate: true },
    });

    for (const proj of projects) {
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  proj.ownerId,
          type:         'deadline_approaching',
          resourceType: 'project',
          resourceId:   proj.id,
        },
      });
      if (existing) continue;

      const dueStr = proj.endDate.toLocaleDateString('zh-TW');
      await createNotifications({
        prisma,
        recipients:   [proj.ownerId],
        type:         'deadline_approaching',
        title:        `專案即將到期：${proj.name || `#${proj.id}`}`,
        message:      `截止日期 ${dueStr}，請儘快確認進度`,
        resourceType: 'project',
        resourceId:   proj.id,
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

      // ── 多 instance 競态保護：建立前再次確認沒有其他 instance 已經建立 ──
      const recheck = await prisma.notification.findFirst({
        where: { recipientId: user.id, type: 'system_digest' },
        orderBy: { createdAt: 'desc' },
      });
      if (recheck && (new Date() - new Date(recheck.createdAt)) < interval) {
        continue; // 其他 instance 已建立
      }

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

      // ── 如果使用者開啟了 emailNotifications，寄送摘要郵件 ──
      if (settings.emailNotifications) {
        const userRecord = await prisma.user.findUnique({
          where:  { id: user.id },
          select: { email: true },
        });
        if (userRecord?.email) {
          const htmlMessage = message.replace(/\n/g, '<br>');
          const accentColor = '#7C3AED';
          const subject = `📊 ${title}`;
          const htmlBody = `
            <h2 style="margin:0 0 8px;font-size:20px;color:#1a202c;font-weight:700;">
              ${title}
            </h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
              系統定期報告 · ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
            </p>
            <p style="font-size:15px;color:#374151;margin:0 0 20px;">
              ${user.name} 您好，以下是您的${FREQ_LABEL[freq]}工作摘要：
            </p>
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.75;">
                ${htmlMessage}
              </p>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:10px 0 24px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3838'}"
                     style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">
                    前往系統查看 →
                  </a>
                </td>
              </tr>
            </table>
          `;
          emailService.sendEmail({
            to:       userRecord.email,
            subject,
            htmlBody: emailService.wrapEmailTemplate({ title: subject, accentColor, content: htmlBody }),
          }).catch(err => {
            console.warn(`[notificationCenter] 摘要郵件發送失敗（${userRecord.email}）:`, err.message);
          });
        }
      }

      created++;
    }

    return created;
  } catch (e) {
    console.warn('[notificationCenter] generateDigestNotifications 失敗:', e.message);
    return 0;
  }
}

function taipeiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (parseInt(parts.hour, 10) * 60) + parseInt(parts.minute, 10),
  };
}

function parseReminderTime(value) {
  const match = String(value || '14:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 14 * 60;
  const hh = Math.min(Math.max(parseInt(match[1], 10), 0), 23);
  const mm = Math.min(Math.max(parseInt(match[2], 10), 0), 59);
  return hh * 60 + mm;
}

async function generateDailyProgressReminderNotifications(prisma) {
  const now = new Date();
  const { dateKey, minutes } = taipeiDateParts(now);
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  const end = new Date(`${dateKey}T23:59:59.999+08:00`);

  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, settings: true, companyId: true },
    });

    let created = 0;
    for (const user of users) {
      const settings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...((user.settings && typeof user.settings === 'object')
          ? (user.settings.notificationSettings || {})
          : {}),
      };
      const wantsInAppNotification = !!settings.pushNotifications;
      const wantsEmailNotification = !!settings.emailNotifications;
      if (!settings.dailyProgressReminder || (!wantsInAppNotification && !wantsEmailNotification)) continue;
      if (minutes < parseReminderTime(settings.dailyProgressReminderTime)) continue;

      const alreadySent = await prisma.notification.findFirst({
        where: {
          recipientId: user.id,
          type: 'system_digest',
          resourceType: 'daily_progress_reminder',
          createdAt: { gte: start, lte: end },
        },
        select: { id: true },
      });
      if (alreadySent) continue;

      const activityCount = await prisma.activityLog.count({
        where: {
          userId: user.id,
          createdAt: { gte: start, lte: end },
          task: { deletedAt: null, project: { companyId: user.companyId, deletedAt: null } },
        },
      });

      const title = '每日專案任務更新進度提醒';
      const message = activityCount > 0
        ? `今天已記錄 ${activityCount} 筆專案 / 任務進度更新，記得確認每日進度頁是否完整。`
        : '今天尚未偵測到你的專案 / 任務進度更新，請記得更新今日工作進度。';
      const sentAt = new Date();

      await prisma.notification.create({
        data: {
          recipientId: user.id,
          type: 'system_digest',
          title,
          message,
          resourceType: 'daily_progress_reminder',
          resourceId: user.id,
          isRead: !wantsInAppNotification,
          readAt: wantsInAppNotification ? null : sentAt,
          deletedAt: wantsInAppNotification ? null : sentAt,
        },
      });

      if (wantsEmailNotification) {
        dispatchEmailNotifications({
          prisma,
          recipientIds: [user.id],
          type: 'system_digest',
          title,
          message,
          resourceType: 'daily_progress_reminder',
          resourceId: user.id,
        });
      }
      created++;
    }
    return created;
  } catch (e) {
    console.warn('[notificationCenter] generateDailyProgressReminderNotifications 失敗:', e.message);
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

    for (const task of tasks) {
      // 去重：同一任務已有逾期通知（含軟刪除）則跳過
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  task.assigneeId,
          type:         'task_overdue',
          resourceType: 'task',
          resourceId:   task.id,
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

    // ── 專案 (Project) 逾期掃描 ────────────────────────────
    const projects = await prisma.project.findMany({
      where: {
        endDate:   { lt: todayStart },
        status:    { notIn: ['completed', 'cancelled', 'archived'] },
        deletedAt: null,
        ownerId:   { not: null },
      },
      select: { id: true, name: true, ownerId: true, endDate: true },
    });

    for (const proj of projects) {
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId:  proj.ownerId,
          type:         'task_overdue',
          resourceType: 'project',
          resourceId:   proj.id,
        },
      });
      if (existing) continue;

      const overdueDays = Math.ceil((todayStart - proj.endDate) / 86400000);
      await createNotifications({
        prisma,
        recipients:   [proj.ownerId],
        type:         'task_overdue',
        title:        `專案已逾期：${proj.name || `#${proj.id}`}`,
        message:      `已逾期 ${overdueDays} 天，請立即處理`,
        resourceType: 'project',
        resourceId:   proj.id,
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
  createProjectAssignmentNotifications,
  createProjectMemberAddedNotifications,
  createTaskAssignmentNotifications,
  createTaskCompletedNotifications,
  createProjectStatusChangeNotifications,
  createTaskCommentNotifications,
  createMentionNotifications,
  scanDeadlineApproaching,
  scanTaskOverdue,
  generateDigestNotifications,
  generateDailyProgressReminderNotifications,
  getUnreadCount,
  getUserNotificationSettings,
  updateUserNotificationSettings,
};
