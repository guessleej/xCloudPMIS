const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, data, meta, timestamp: new Date().toISOString() });

const fail = (res, message, status = 400) =>
  res.status(status).json({ success: false, error: message });

const SYSTEM_LISTS = [
  { systemKey: 'recent', name: '近期指派', color: '#2563EB', position: 100 },
  { systemKey: 'today', name: '今天執行', color: '#C41230', position: 200 },
  { systemKey: 'week', name: '下週執行', color: '#F97316', position: 300 },
  { systemKey: 'later', name: '稍後執行', color: '#6B7280', position: 400 },
];

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
const MY_FILE_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'my-files');
const TASK_ATTACHMENT_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'task-attachments');

function parseId(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveUserContext(req) {
  const userId = parseId(req.user?.userId) || parseId(req.query.userId) || parseId(req.body?.userId);
  const companyId = parseId(req.user?.companyId) || parseId(req.query.companyId) || parseId(req.body?.companyId);

  return { userId, companyId };
}

function deriveSystemKey(dueDate) {
  if (!dueDate) return 'later';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate);
  const dueAt = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueAt - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'today';
  if (diffDays <= 7) return 'recent';
  if (diffDays <= 14) return 'week';
  return 'later';
}

function normalizeDate(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function serializeBigInt(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function isStoredFileAvailable(filePath) {
  return Boolean(
    filePath && (
      /^https?:\/\//i.test(filePath) ||
      fs.existsSync(filePath)
    ),
  );
}

function resolveStoredFilePath(filePath) {
  if (!filePath) return null;

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  if (path.isAbsolute(filePath)) {
    if (fs.existsSync(filePath)) return filePath;

    if (filePath.startsWith('/app/')) {
      const localPath = path.resolve(__dirname, '../..', filePath.slice('/app/'.length));
      if (fs.existsSync(localPath)) return localPath;
      return localPath;
    }

    return filePath;
  }

  return path.resolve(__dirname, '../..', filePath);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function cleanupUploadedFiles(files) {
  await Promise.all(
    (Array.isArray(files) ? files : []).map(file => (
      file?.path
        ? fsp.unlink(file.path).catch(() => {})
        : Promise.resolve()
    )),
  );
}

async function ensureSystemLists(userId, companyId) {
  const existing = await prisma.myTaskList.findMany({
    where: { userId, systemKey: { in: SYSTEM_LISTS.map(item => item.systemKey) } },
  });

  const existingKeys = new Set(existing.map(item => item.systemKey));
  const missing = SYSTEM_LISTS.filter(item => !existingKeys.has(item.systemKey));

  if (missing.length > 0) {
    await prisma.myTaskList.createMany({
      data: missing.map(item => ({
        companyId,
        userId,
        name: item.name,
        color: item.color,
        isSystem: true,
        systemKey: item.systemKey,
        position: item.position,
      })),
      skipDuplicates: true,
    });
  }

  return prisma.myTaskList.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}

function getAssignedTaskWhere(userId, companyId, extraWhere = null) {
  const baseWhere = {
    deletedAt: null,
    project: {
      companyId,
      deletedAt: null,
    },
    OR: [
      { assigneeId: userId },
      { taskAssigneeLinks: { some: { userId } } },
    ],
  };

  if (!extraWhere || Object.keys(extraWhere).length === 0) {
    return baseWhere;
  }

  return {
    AND: [
      baseWhere,
      extraWhere,
    ],
  };
}

async function getAccessibleTaskWhere(userId, companyId) {
  return {
    where: getAssignedTaskWhere(userId, companyId),
    scope: 'assigned_only',
  };
}

async function findAssignedTask(userId, companyId, taskId, options = {}) {
  return prisma.task.findFirst({
    where: getAssignedTaskWhere(userId, companyId, { id: taskId }),
    ...options,
  });
}

function normalizeList(list) {
  return {
    id: list.id,
    name: list.name,
    color: list.color || null,
    isSystem: Boolean(list.isSystem),
    systemKey: list.systemKey || null,
    position: list.position,
    canRename: !list.isSystem,
    canDelete: !list.isSystem,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

function normalizeMyFile(file) {
  const resolvedPath = resolveStoredFilePath(file.filePath);

  return {
    id: file.id,
    source: 'my_file',
    name: file.originalName,
    mimeType: file.mimeType,
    ext: file.ext || path.extname(file.originalName).replace('.', ''),
    fileSizeBytes: Number(serializeBigInt(file.fileSizeBytes) || 0),
    createdAt: file.createdAt,
    isAvailable: isStoredFileAvailable(resolvedPath),
    downloadUrl: `/api/my-tasks/files/${file.id}/download?source=my_file`,
    canDelete: true,
  };
}

function normalizeAttachment(file, userId) {
  const resolvedPath = resolveStoredFilePath(file.filePath);

  return {
    id: file.id,
    source: 'attachment',
    name: file.originalName,
    mimeType: file.mimeType,
    ext: path.extname(file.originalName).replace('.', ''),
    fileSizeBytes: Number(file.fileSizeBytes || 0),
    createdAt: file.createdAt,
    isAvailable: isStoredFileAvailable(resolvedPath),
    downloadUrl: `/api/my-tasks/files/${file.id}/download?source=attachment`,
    canDelete: file.uploadedById === userId,
    task: file.task ? {
      id: file.task.id,
      title: file.task.title,
      project: file.task.project,
    } : null,
    uploadedBy: file.uploadedBy || null,
  };
}

function normalizeTask(task, taskListMap, systemListMap) {
  const assignment = taskListMap.get(task.id) || null;
  const derivedSystemKey = deriveSystemKey(task.dueDate);
  const fallbackList = systemListMap.get(derivedSystemKey);
  const effectiveListId = assignment?.listId || fallbackList?.id || null;
  const effectiveListKey = assignment?.list?.systemKey || fallbackList?.systemKey || null;
  const projectName = task.project?.name || null;
  const projectColor = task.project?.color || null;

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority,
    dueDate: normalizeDate(task.dueDate),
    projectId: task.projectId,
    project: task.project ? { id: task.project.id, name: task.project.name } : null,
    projectName,
    projectColor,
    assigneeId: task.assigneeId || null,
    assignee: task.assignee ? {
      id: task.assignee.id,
      name: task.assignee.name,
      avatarUrl: task.assignee.avatarUrl || null,
    } : null,
    parentTaskId: task.parentTaskId || null,
    progressPercent: task.progressPercent || 0,
    numSubtasks: task._count?.subtasks || 0,
    estimatedHours: task.estimatedHours ? parseFloat(task.estimatedHours.toString()) : null,
    actualHours: task.actualHours ? parseFloat(task.actualHours.toString()) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    listId: effectiveListId,
    listKey: effectiveListKey,
    listPosition: assignment?.position ?? task.position ?? 0,
    isDone: task.status === 'done' || task.status === 'completed',
  };
}

async function buildOverview(userId, companyId) {
  const lists = await ensureSystemLists(userId, companyId);
  const { where, scope } = await getAccessibleTaskWhere(userId, companyId);
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        myTaskListTasks: {
          where: { userId },
          include: {
            list: { select: { id: true, systemKey: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 1,
        },
        _count: { select: { subtasks: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ]);

  const taskListMap = new Map(
    tasks
      .filter(task => task.myTaskListTasks.length > 0)
      .map(task => [
        task.id,
        {
          listId: task.myTaskListTasks[0].listId,
          position: task.myTaskListTasks[0].position,
          list: task.myTaskListTasks[0].list,
        },
      ]),
  );
  const systemListMap = new Map(lists.filter(item => item.systemKey).map(item => [item.systemKey, item]));

  const normalizedLists = lists.map(normalizeList);
  const normalizedTasks = tasks
    .map(task => normalizeTask(task, taskListMap, systemListMap))
    .sort((a, b) => {
      if (a.listId !== b.listId) return (a.listId || 0) - (b.listId || 0);
      if (a.listPosition !== b.listPosition) return a.listPosition - b.listPosition;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  return {
    lists: normalizedLists,
    tasks: normalizedTasks,
    projects,
    scope,
  };
}

async function getNextListPosition(userId) {
  const result = await prisma.myTaskList.aggregate({
    where: { userId },
    _max: { position: true },
  });

  return (result._max.position || 0) + 100;
}

async function getNextTaskListPosition(db, listId) {
  const result = await db.myTaskListTask.aggregate({
    where: { listId },
    _max: { position: true },
  });

  return (result._max.position || 0) + 100;
}

async function upsertTaskListAssignment(tx, { userId, taskId, listId, position }) {
  const nextPosition = position ?? await getNextTaskListPosition(tx, listId);
  const existing = await tx.myTaskListTask.findUnique({
    where: {
      userId_taskId: {
        userId,
        taskId,
      },
    },
  });

  if (existing) {
    return tx.myTaskListTask.update({
      where: { id: existing.id },
      data: {
        listId,
        position: position ?? (existing.listId === listId ? existing.position : nextPosition),
      },
    });
  }

  return tx.myTaskListTask.create({
    data: {
      userId,
      taskId,
      listId,
      position: nextPosition,
    },
  });
}

function createUploadMiddleware(destinationDir) {
  return multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          await ensureDir(destinationDir);
          cb(null, destinationDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 10,
    },
  });
}

const myFileUpload = createUploadMiddleware(MY_FILE_UPLOAD_DIR);
const taskAttachmentUpload = createUploadMiddleware(TASK_ATTACHMENT_UPLOAD_DIR);

router.get('/overview', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再查看我的任務', 401);

  try {
    const overview = await buildOverview(userId, companyId);
    ok(res, overview, {
      totalLists: overview.lists.length,
      totalTasks: overview.tasks.length,
      scope: overview.scope,
    });
  } catch (error) {
    console.error('[my-tasks/overview]', error);
    fail(res, error.message || '讀取我的任務失敗', 500);
  }
});

router.post('/lists', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再建立清單', 401);

  const name = req.body?.name?.trim();
  const color = req.body?.color?.trim() || null;
  if (!name) return fail(res, '清單名稱為必填', 400);

  try {
    await ensureSystemLists(userId, companyId);
    const list = await prisma.myTaskList.create({
      data: {
        companyId,
        userId,
        name,
        color,
        isSystem: false,
        position: await getNextListPosition(userId),
      },
    });

    ok(res, normalizeList(list), {}, 201);
  } catch (error) {
    console.error('[my-tasks/create-list]', error);
    fail(res, error.message || '建立清單失敗', 500);
  }
});

router.patch('/lists/reorder', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再排序清單', 401);

  const orderedListIds = Array.from(new Set(
    (Array.isArray(req.body?.orderedListIds) ? req.body.orderedListIds : [])
      .map(parseId)
      .filter(Boolean),
  ));

  if (orderedListIds.length === 0) return fail(res, '請提供至少一個清單 ID', 400);

  try {
    await ensureSystemLists(userId, companyId);

    const existingLists = await prisma.myTaskList.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const listMap = new Map(existingLists.map(list => [list.id, list]));

    if (orderedListIds.some(id => !listMap.has(id))) {
      return fail(res, '清單排序內容包含無效 ID', 400);
    }

    const reordered = [
      ...orderedListIds.map(id => listMap.get(id)),
      ...existingLists.filter(list => !orderedListIds.includes(list.id)),
    ];

    await prisma.$transaction(
      reordered.map((list, index) => prisma.myTaskList.update({
        where: { id: list.id },
        data: { position: (index + 1) * 100 },
      })),
    );

    const freshLists = await prisma.myTaskList.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    ok(res, freshLists.map(normalizeList), { total: freshLists.length });
  } catch (error) {
    console.error('[my-tasks/reorder-lists]', error);
    fail(res, error.message || '更新清單排序失敗', 500);
  }
});

router.patch('/lists/:listId/tasks/reorder', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再排序任務', 401);

  const listId = parseId(req.params.listId);
  if (!listId) return fail(res, '無效的清單 ID', 400);

  const orderedTaskIds = Array.from(new Set(
    (Array.isArray(req.body?.orderedTaskIds) ? req.body.orderedTaskIds : [])
      .map(parseId)
      .filter(Boolean),
  ));

  if (orderedTaskIds.length === 0) return fail(res, '請提供至少一個任務 ID', 400);

  try {
    const list = await prisma.myTaskList.findFirst({
      where: { id: listId, userId },
      select: { id: true },
    });
    if (!list) return fail(res, '找不到此清單', 404);

    const overview = await buildOverview(userId, companyId);
    const visibleTasks = overview.tasks.filter(task => task.listId === listId);
    const visibleTaskIdSet = new Set(visibleTasks.map(task => task.id));

    if (orderedTaskIds.some(taskId => !visibleTaskIdSet.has(taskId))) {
      return fail(res, '排序內容包含不屬於此清單的任務', 400);
    }

    const orderedTaskIdSet = new Set(orderedTaskIds);
    const finalTaskIds = [
      ...orderedTaskIds,
      ...visibleTasks
        .filter(task => !orderedTaskIdSet.has(task.id))
        .map(task => task.id),
    ];

    await prisma.$transaction(
      finalTaskIds.map((taskId, index) => prisma.myTaskListTask.upsert({
        where: {
          userId_taskId: {
            userId,
            taskId,
          },
        },
        update: {
          listId,
          position: (index + 1) * 100,
        },
        create: {
          userId,
          taskId,
          listId,
          position: (index + 1) * 100,
        },
      })),
    );

    ok(res, {
      listId,
      orderedTaskIds: finalTaskIds,
    }, {
      total: finalTaskIds.length,
    });
  } catch (error) {
    console.error('[my-tasks/reorder-list-tasks]', error);
    fail(res, error.message || '更新任務排序失敗', 500);
  }
});

router.patch('/lists/:listId', async (req, res) => {
  const { userId } = resolveUserContext(req);
  if (!userId) return fail(res, '請先登入後再更新清單', 401);

  const listId = parseId(req.params.listId);
  if (!listId) return fail(res, '無效的清單 ID', 400);

  const name = req.body?.name?.trim();
  const color = req.body?.color?.trim() || null;

  try {
    const existing = await prisma.myTaskList.findFirst({
      where: { id: listId, userId },
    });

    if (!existing) return fail(res, '找不到此清單', 404);
    if (existing.isSystem) return fail(res, '系統清單不可修改名稱', 400);

    const updated = await prisma.myTaskList.update({
      where: { id: listId },
      data: {
        ...(name ? { name } : {}),
        color,
      },
    });

    ok(res, normalizeList(updated));
  } catch (error) {
    console.error('[my-tasks/update-list]', error);
    fail(res, error.message || '更新清單失敗', 500);
  }
});

router.delete('/lists/:listId', async (req, res) => {
  const { userId } = resolveUserContext(req);
  if (!userId) return fail(res, '請先登入後再刪除清單', 401);

  const listId = parseId(req.params.listId);
  if (!listId) return fail(res, '無效的清單 ID', 400);

  try {
    const existing = await prisma.myTaskList.findFirst({
      where: { id: listId, userId },
    });

    if (!existing) return fail(res, '找不到此清單', 404);
    if (existing.isSystem) return fail(res, '系統清單不可刪除', 400);

    await prisma.myTaskList.delete({ where: { id: listId } });
    ok(res, { id: listId, deleted: true });
  } catch (error) {
    console.error('[my-tasks/delete-list]', error);
    fail(res, error.message || '刪除清單失敗', 500);
  }
});

router.post('/tasks', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再新增任務', 401);

  const title = req.body?.title?.trim();
  const description = req.body?.description || '';
  const priority = req.body?.priority || 'medium';
  const dueDate = req.body?.dueDate || null;
  const requestedProjectId = parseId(req.body?.projectId);
  const requestedListId = parseId(req.body?.listId);

  if (!title) return fail(res, '任務標題為必填', 400);

  try {
    const lists = await ensureSystemLists(userId, companyId);
    const targetList = requestedListId
      ? lists.find(item => item.id === requestedListId)
      : lists.find(item => item.systemKey === 'recent') || lists[0];

    if (!targetList) return fail(res, '找不到可用清單', 400);

    const project = requestedProjectId
      ? await prisma.project.findFirst({
          where: { id: requestedProjectId, companyId, deletedAt: null },
          select: { id: true },
        })
      : await prisma.project.findFirst({
          where: { companyId, deletedAt: null },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }],
        });

    if (!project) return fail(res, '請先建立一個專案，才能新增任務', 400);

    const taskPositionResult = await prisma.task.aggregate({
      where: { projectId: project.id },
      _max: { position: true },
    });
    const nextTaskPosition = (taskPositionResult._max.position || 0) + 100;

    const createdTask = await prisma.$transaction(async tx => {
      const task = await tx.task.create({
        data: {
          projectId: project.id,
          assigneeId: userId,
          createdById: userId,
          title,
          description,
          priority,
          status: 'todo',
          dueDate: dueDate ? new Date(dueDate) : null,
          position: nextTaskPosition,
        },
      });

      await tx.taskProject.upsert({
        where: {
          taskId_projectId: {
            taskId: task.id,
            projectId: project.id,
          },
        },
        update: {
          isPrimary: true,
          position: nextTaskPosition,
          addedById: userId,
        },
        create: {
          taskId: task.id,
          projectId: project.id,
          isPrimary: true,
          position: nextTaskPosition,
          addedById: userId,
        },
      });

      await tx.taskAssigneeLink.upsert({
        where: {
          taskId_userId: {
            taskId: task.id,
            userId,
          },
        },
        update: {
          isPrimary: true,
          assignedById: userId,
        },
        create: {
          taskId: task.id,
          userId,
          isPrimary: true,
          assignedById: userId,
        },
      });

      await upsertTaskListAssignment(tx, {
        userId,
        taskId: task.id,
        listId: targetList.id,
      });

      return tx.task.findUnique({
        where: { id: task.id },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
          myTaskListTasks: {
            where: { userId },
            include: { list: { select: { id: true, systemKey: true } } },
            take: 1,
          },
          _count: { select: { subtasks: true } },
        },
      });
    });

    const systemListMap = new Map(lists.filter(item => item.systemKey).map(item => [item.systemKey, item]));
    const taskListMap = new Map(
      createdTask.myTaskListTasks.length > 0
        ? [[createdTask.id, {
            listId: createdTask.myTaskListTasks[0].listId,
            position: createdTask.myTaskListTasks[0].position,
            list: createdTask.myTaskListTasks[0].list,
          }]]
        : [],
    );

    ok(res, normalizeTask(createdTask, taskListMap, systemListMap), {}, 201);
  } catch (error) {
    console.error('[my-tasks/create-task]', error);
    fail(res, error.message || '新增任務失敗', 500);
  }
});

router.patch('/tasks/:taskId', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再更新任務', 401);

  const taskId = parseId(req.params.taskId);
  if (!taskId) return fail(res, '無效的任務 ID', 400);

  try {
    const existing = await findAssignedTask(userId, companyId, taskId, {
      include: {
        myTaskListTasks: {
          where: { userId },
          include: { list: { select: { id: true, systemKey: true } } },
          take: 1,
        },
      },
    });

    if (!existing) return fail(res, '找不到此任務', 404);

    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title || '').trim();
    if (req.body.description !== undefined) data.description = req.body.description || '';
    if (req.body.priority !== undefined) data.priority = req.body.priority || existing.priority;
    if (req.body.status !== undefined) {
      data.status = req.body.status === 'completed' ? 'done' : req.body.status;
      data.completedAt = data.status === 'done' ? new Date() : null;
      data.progressPercent = data.status === 'done' ? 100 : existing.progressPercent;
    }
    if (req.body.dueDate !== undefined) data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    const assigneeId = req.body.assigneeId !== undefined
      ? (req.body.assigneeId ? parseId(req.body.assigneeId) : null)
      : undefined;
    if (assigneeId !== undefined) {
      data.assigneeId = assigneeId;
    }

    const listId = req.body.listId !== undefined ? parseId(req.body.listId) : null;
    const lists = await ensureSystemLists(userId, companyId);
    const targetList = listId ? lists.find(item => item.id === listId) : null;
    if (req.body.listId !== undefined && !targetList) return fail(res, '找不到此清單', 404);

    const updatedTask = await prisma.$transaction(async tx => {
      const task = await tx.task.update({
        where: { id: taskId },
        data,
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
          myTaskListTasks: {
            where: { userId },
            include: { list: { select: { id: true, systemKey: true } } },
            take: 1,
          },
          _count: { select: { subtasks: true } },
        },
      });

      if (assigneeId !== undefined) {
        await tx.taskAssigneeLink.updateMany({
          where: { taskId, isPrimary: true },
          data: { isPrimary: false },
        });

        if (assigneeId) {
          await tx.taskAssigneeLink.upsert({
            where: {
              taskId_userId: {
                taskId,
                userId: assigneeId,
              },
            },
            update: {
              isPrimary: true,
              assignedById: userId,
            },
            create: {
              taskId,
              userId: assigneeId,
              isPrimary: true,
              assignedById: userId,
            },
          });
        }
      }

      if (targetList) {
        await upsertTaskListAssignment(tx, {
          userId,
          taskId,
          listId: targetList.id,
        });

        return tx.task.findUnique({
          where: { id: taskId },
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
            project: { select: { id: true, name: true } },
            myTaskListTasks: {
              where: { userId },
              include: { list: { select: { id: true, systemKey: true } } },
              take: 1,
            },
            _count: { select: { subtasks: true } },
          },
        });
      }

      return task;
    });

    const systemListMap = new Map(lists.filter(item => item.systemKey).map(item => [item.systemKey, item]));
    const taskListMap = new Map(
      updatedTask.myTaskListTasks.length > 0
        ? [[updatedTask.id, {
            listId: updatedTask.myTaskListTasks[0].listId,
            position: updatedTask.myTaskListTasks[0].position,
            list: updatedTask.myTaskListTasks[0].list,
          }]]
        : [],
    );

    ok(res, normalizeTask(updatedTask, taskListMap, systemListMap));
  } catch (error) {
    console.error('[my-tasks/update-task]', error);
    fail(res, error.message || '更新任務失敗', 500);
  }
});

router.delete('/tasks/:taskId', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再刪除任務', 401);

  const taskId = parseId(req.params.taskId);
  if (!taskId) return fail(res, '無效的任務 ID', 400);

  try {
    const existing = await findAssignedTask(userId, companyId, taskId, {
      select: { id: true, title: true },
    });

    if (!existing) return fail(res, '找不到此任務', 404);

    await prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    ok(res, { id: taskId, title: existing.title, deleted: true });
  } catch (error) {
    console.error('[my-tasks/delete-task]', error);
    fail(res, error.message || '刪除任務失敗', 500);
  }
});

router.get('/tasks/:taskId/attachments', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再查看任務附件', 401);

  const taskId = parseId(req.params.taskId);
  if (!taskId) return fail(res, '無效的任務 ID', 400);

  try {
    const task = await findAssignedTask(userId, companyId, taskId, {
      select: { id: true, title: true },
    });

    if (!task) return fail(res, '找不到此任務', 404);

    const attachments = await prisma.attachment.findMany({
      where: { taskId },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const normalized = attachments.map(file => normalizeAttachment(file, userId));
    ok(res, normalized, { total: normalized.length, taskId });
  } catch (error) {
    console.error('[my-tasks/task-attachments]', error);
    fail(res, error.message || '讀取任務附件失敗', 500);
  }
});

router.post('/tasks/:taskId/attachments/upload', taskAttachmentUpload.array('files', 10), async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) {
    await cleanupUploadedFiles(req.files);
    return fail(res, '請先登入後再上傳任務附件', 401);
  }

  const taskId = parseId(req.params.taskId);
  if (!taskId) {
    await cleanupUploadedFiles(req.files);
    return fail(res, '無效的任務 ID', 400);
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return fail(res, '請至少選擇一個檔案', 400);

  try {
    const task = await findAssignedTask(userId, companyId, taskId, {
      select: { id: true, title: true },
    });

    if (!task) {
      await cleanupUploadedFiles(files);
      return fail(res, '找不到此任務', 404);
    }

    const created = [];

    for (const file of files) {
      const record = await prisma.attachment.create({
        data: {
          taskId,
          uploadedById: userId,
          originalName: file.originalname,
          storedName: file.filename,
          filePath: file.path,
          mimeType: file.mimetype || '',
          fileSizeBytes: Number(file.size || 0),
        },
        include: {
          uploadedBy: { select: { id: true, name: true } },
        },
      });

      created.push(normalizeAttachment(record, userId));
    }

    ok(res, created, { total: created.length, taskId }, 201);
  } catch (error) {
    await cleanupUploadedFiles(files);
    console.error('[my-tasks/upload-task-attachments]', error);
    fail(res, error.message || '上傳任務附件失敗', 500);
  }
});

router.get('/files', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再查看檔案', 401);

  try {
    const [myFiles, taskAttachments] = await Promise.all([
      prisma.myFile.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.attachment.findMany({
        where: {
          task: getAssignedTaskWhere(userId, companyId),
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } },
            },
          },
          uploadedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const normalizedMyFiles = myFiles.map(normalizeMyFile);
    const normalizedAttachments = taskAttachments.map(file => normalizeAttachment(file, userId));

    ok(res, {
      myFiles: normalizedMyFiles,
      attachments: normalizedAttachments,
    }, {
      total: normalizedMyFiles.length + normalizedAttachments.length,
      myFiles: normalizedMyFiles.length,
      attachments: normalizedAttachments.length,
    });
  } catch (error) {
    console.error('[my-tasks/files]', error);
    fail(res, error.message || '讀取檔案失敗', 500);
  }
});

router.post('/files/upload', myFileUpload.array('files', 10), async (req, res) => {
  const { userId } = resolveUserContext(req);
  if (!userId) return fail(res, '請先登入後再上傳檔案', 401);

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return fail(res, '請至少選擇一個檔案', 400);

  try {
    const created = [];

    for (const file of files) {
      const record = await prisma.myFile.create({
        data: {
          userId,
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype || '',
          fileSizeBytes: BigInt(file.size || 0),
          filePath: file.path,
          ext: path.extname(file.originalname || '').replace('.', ''),
        },
      });

      created.push(normalizeMyFile(record));
    }

    ok(res, created, { total: created.length }, 201);
  } catch (error) {
    console.error('[my-tasks/upload-file]', error);
    fail(res, error.message || '上傳檔案失敗', 500);
  }
});

router.get('/files/:fileId/download', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再下載檔案', 401);

  const fileId = parseId(req.params.fileId);
  const source = req.query.source === 'attachment' ? 'attachment' : 'my_file';
  if (!fileId) return fail(res, '無效的檔案 ID', 400);

  try {
    let fileRecord;

    if (source === 'attachment') {
      fileRecord = await prisma.attachment.findFirst({
        where: {
          id: fileId,
          task: getAssignedTaskWhere(userId, companyId),
        },
      });
    } else {
      fileRecord = await prisma.myFile.findFirst({
        where: { id: fileId, userId },
      });
    }

    if (!fileRecord) return fail(res, '找不到此檔案', 404);

    const resolvedPath = resolveStoredFilePath(fileRecord.filePath);
    if (!resolvedPath) return fail(res, '檔案路徑不存在', 404);

    if (/^https?:\/\//i.test(resolvedPath)) {
      return res.redirect(resolvedPath);
    }

    if (!fs.existsSync(resolvedPath)) {
      return fail(res, '檔案不存在或尚未同步', 404);
    }

    return res.download(resolvedPath, fileRecord.originalName);
  } catch (error) {
    console.error('[my-tasks/download-file]', error);
    fail(res, error.message || '下載檔案失敗', 500);
  }
});

router.delete('/files/:fileId', async (req, res) => {
  const { userId, companyId } = resolveUserContext(req);
  if (!userId || !companyId) return fail(res, '請先登入後再刪除檔案', 401);

  const fileId = parseId(req.params.fileId);
  const source = req.query.source === 'attachment' ? 'attachment' : 'my_file';
  if (!fileId) return fail(res, '無效的檔案 ID', 400);

  try {
    let existing;

    if (source === 'attachment') {
      existing = await prisma.attachment.findFirst({
        where: {
          id: fileId,
          uploadedById: userId,
          task: getAssignedTaskWhere(userId, companyId),
        },
      });

      if (!existing) return fail(res, '找不到此任務附件，或你沒有刪除權限', 404);

      const resolvedPath = resolveStoredFilePath(existing.filePath);
      await prisma.attachment.delete({ where: { id: fileId } });

      if (resolvedPath && !/^https?:\/\//i.test(resolvedPath) && fs.existsSync(resolvedPath)) {
        await fsp.unlink(resolvedPath).catch(() => {});
      }

      return ok(res, { id: fileId, source, deleted: true, taskId: existing.taskId });
    }

    existing = await prisma.myFile.findFirst({
      where: { id: fileId, userId },
    });

    if (!existing) return fail(res, '找不到此檔案', 404);

    const resolvedPath = resolveStoredFilePath(existing.filePath);
    await prisma.myFile.delete({ where: { id: fileId } });

    if (resolvedPath && !/^https?:\/\//i.test(resolvedPath) && fs.existsSync(resolvedPath)) {
      await fsp.unlink(resolvedPath).catch(() => {});
    }

    ok(res, { id: fileId, source, deleted: true });
  } catch (error) {
    console.error('[my-tasks/delete-file]', error);
    fail(res, error.message || '刪除檔案失敗', 500);
  }
});

module.exports = router;
