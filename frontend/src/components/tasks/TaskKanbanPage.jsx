/**
 * TaskKanbanPage.jsx
 * 跨專案任務看板 — Asana 風格看板 + 新版 TaskDetailPanel 側邊欄
 *
 * API：
 *   GET    /api/projects/tasks          取得所有任務（含看板分組）
 *   POST   /api/projects/:id/tasks      新增任務
 *   PATCH  /api/projects/tasks/:taskId  更新任務
 *   DELETE /api/projects/tasks/:taskId  軟刪除任務
 *   GET    /api/team?companyId=2        取得團隊成員
 *
 * Side Panel 功能：
 *   - 標題內嵌編輯
 *   - 屬性區 / 多專案 Tag
 *   - 自訂欄位動態輸入
 *   - 子任務樹與快速新增
 *   - 活動紀錄時間線
 */

import { useState, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskDetailPanel from './TaskDetailPanel';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ─────────────────────────────────────────────────────
const API      = '/api/projects';
// TEAM_API & CURRENT_USER 改由 useAuth() 動態提供，不再硬編碼

const BRAND = {
  crimson: '#C70018',
  crimsonDeep: '#8F0013',
  ink: '#121212',
  carbon: '#2B2B2B',
  paper: '#F7F2EE',
  mist: '#E8DFD8',
  silver: '#CFC8C3',
  white: '#FFFFFF',
  success: '#16824B',
  warning: '#C97415',
};

const COLUMNS = [
  { id: 'todo',        label: '待辦',   emoji: '◌', color: '#6B6461', accent: '#ECE6E1' },
  { id: 'in_progress', label: '進行中', emoji: '↗', color: '#8F0013', accent: '#F8D8DD' },
  { id: 'review',      label: '審核中', emoji: '◈', color: '#C97415', accent: '#F5E2CE' },
  { id: 'done',        label: '已完成', emoji: '✓', color: '#16824B', accent: '#DDF2E4' },
];

const PRIORITY_MAP = {
  urgent: { label: '緊急', bg: '#FDE1E4', color: '#C70018', dot: '#C70018' },
  high:   { label: '高',   bg: '#FBE7D5', color: '#B35810', dot: '#D16D18' },
  medium: { label: '中',   bg: '#F0ECE8', color: '#6B6461', dot: '#6B6461' },
  low:    { label: '低',   bg: '#F7F2EE', color: '#8A817B', dot: '#B9B0AA' },
};

const STATUS_NEXT = {
  todo:        'in_progress',
  in_progress: 'review',
  review:      'done',
  done:        'todo',
};
const STATUS_NEXT_LABEL = {
  todo:        '開始推進',
  in_progress: '送審',
  review:      '標示完成',
  done:        '重新開啟',
};

// Avatar colour palette (deterministic from name)
const AVATAR_COLORS = ['#C70018', '#8F0013', '#2B2B2B', '#6B6461', '#A63746', '#7A5B61', '#595959', '#B35810'];
function avatarColor(name) {
  if (!name) return BRAND.crimson;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── 共用樣式 ─────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '7px 10px',
  border: `1px solid ${BRAND.silver}`, borderRadius: 8,
  fontSize: '13px', boxSizing: 'border-box',
  outline: 'none', background: BRAND.white,
};
const labelStyle = {
  fontSize: '12px', fontWeight: 600,
  color: BRAND.carbon, marginBottom: 4, display: 'block',
};
// ── 工具函式 ─────────────────────────────────────────────────
function daysLeft(dueDate) {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate) - new Date()) / 86400000);
}
function avatarChar(name) { return name ? name.charAt(0).toUpperCase() : '?'; }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// LocalStorage helpers
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function normalizeDropStatus(columnId) {
  return columnId === 'done' ? 'completed' : columnId;
}

function formatAutomationMessage(taskTitle, automation) {
  if (!automation?.triggered) {
    return `「${taskTitle}」已更新`;
  }

  const parts = [`「${taskTitle}」已自動完成`];
  if (automation.parentProgress) {
    parts.push(`父任務進度 ${automation.parentProgress.progressPercent}%`);
  }
  if (automation.notificationsSent) {
    parts.push(`已通知 ${automation.notificationsSent} 位專案成員`);
  }
  return parts.join('，');
}

function formatDueDateLabel(dueDate) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getTaskSortableId(taskId) {
  return `task-${taskId}`;
}

function getColumnSortableId(columnId) {
  return `column-${columnId}`;
}

function parseTaskSortableId(id) {
  if (typeof id !== 'string' || !id.startsWith('task-')) return null;
  const taskId = Number(id.slice(5));
  return Number.isFinite(taskId) ? taskId : null;
}

function parseColumnSortableId(id) {
  if (typeof id !== 'string' || !id.startsWith('column-')) return null;
  return id.slice(7);
}

function cloneKanbanColumns(kanban) {
  return Object.fromEntries(
    COLUMNS.map((column) => [column.id, [...(kanban[column.id] || [])]])
  );
}

function findTaskInKanban(kanban, taskId) {
  for (const column of COLUMNS) {
    const task = (kanban[column.id] || []).find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

function findTaskColumnId(kanban, taskId) {
  for (const column of COLUMNS) {
    if ((kanban[column.id] || []).some((item) => item.id === taskId)) {
      return column.id;
    }
  }
  return null;
}

function resolveOverColumnId(kanban, overId) {
  const directColumnId = parseColumnSortableId(overId);
  if (directColumnId) return directColumnId;

  const taskId = parseTaskSortableId(overId);
  if (!taskId) return null;

  return findTaskColumnId(kanban, taskId);
}

function moveTaskPreview(kanban, taskId, targetColumnId, overId) {
  const sourceColumnId = findTaskColumnId(kanban, taskId);
  if (!sourceColumnId || !targetColumnId || sourceColumnId === targetColumnId) {
    return kanban;
  }

  const nextKanban = cloneKanbanColumns(kanban);
  const sourceTasks = nextKanban[sourceColumnId] || [];
  const taskIndex = sourceTasks.findIndex((item) => item.id === taskId);
  if (taskIndex === -1) return kanban;

  const [task] = sourceTasks.splice(taskIndex, 1);
  const targetTasks = nextKanban[targetColumnId] || [];
  const overTaskId = parseTaskSortableId(overId);
  const insertIndex = overTaskId
    ? targetTasks.findIndex((item) => item.id === overTaskId)
    : targetTasks.length;

  targetTasks.splice(insertIndex >= 0 ? insertIndex : targetTasks.length, 0, {
    ...task,
    status: targetColumnId,
  });

  return nextKanban;
}

function isTypingElement(target) {
  if (!target) return false;
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) ||
    target.closest?.('[contenteditable="true"]')
  );
}

function getStatusMeta(status) {
  const column = COLUMNS.find((item) => item.id === status || (status === 'completed' && item.id === 'done'));
  if (column) return column;
  return { id: status, label: status, emoji: '•' };
}

function mapPanelFieldType(type) {
  if (type === 'currency') return 'number';
  if (type === 'checkbox') return 'select';
  if (type === 'people') return 'people';
  if (type === 'date') return 'date';
  if (type === 'select') return 'select';
  if (type === 'number') return 'number';
  return 'text';
}

function mapPanelFieldOptions(field) {
  if (field.type === 'checkbox') {
    return [
      { label: '是', value: 'true' },
      { label: '否', value: 'false' },
    ];
  }

  return (field.options || []).map((option) => {
    if (typeof option === 'string') {
      return { label: option, value: option };
    }

    return {
      label: option.label || option.value || '',
      value: option.value || option.label || '',
      color: option.color,
    };
  });
}

function buildSubtaskTree(allTasks, parentTaskId) {
  return allTasks
    .filter((item) => String(item.parentTaskId) === String(parentTaskId))
    .map((item) => ({
      id: item.id,
      title: item.title,
      completed: item.status === 'done' || item.status === 'completed',
      dueDate: item.dueDate,
      progressPercent: item.progressPercent || (item.status === 'done' ? 100 : 0),
      assignee: item.assignee || null,
      children: buildSubtaskTree(allTasks, item.id),
    }));
}

function createActivityActor(source, fallbackName = '系統') {
  if (!source) {
    return { id: `ghost-${fallbackName}`, name: fallbackName };
  }

  return {
    id: source.id ?? `actor-${fallbackName}`,
    name: source.name || fallbackName,
    email: source.email,
    avatarUrl: source.avatarUrl,
  };
}

function buildTaskActivity(task, linkedProjects, comments, currentUser, users) {
  const userByName = new Map(users.map((user) => [user.name, user]));
  const actor = createActivityActor(currentUser, '系統');
  const now = new Date().toISOString();
  const statusMeta = getStatusMeta(task.status);

  const history = [
    {
      id: `history-status-${task.id}`,
      type: 'history',
      actor,
      createdAt: task.completedAt || task.startedAt || now,
      text: `任務目前位於「${statusMeta.label}」階段。`,
      meta: [statusMeta.label],
    },
    ...(task.assignee
      ? [{
          id: `history-assignee-${task.id}`,
          type: 'history',
          actor,
          createdAt: now,
          text: `目前負責人為 ${task.assignee.name}。`,
          meta: ['已指派'],
        }]
      : []),
    ...(task.dueDate
      ? [{
          id: `history-due-${task.id}`,
          type: 'history',
          actor,
          createdAt: task.dueDate,
          text: `截止日期設定為 ${new Date(task.dueDate).toLocaleDateString('zh-TW')}。`,
          meta: ['截止日期'],
        }]
      : []),
    ...(linkedProjects.length > 1
      ? [{
          id: `history-projects-${task.id}`,
          type: 'history',
          actor,
          createdAt: now,
          text: `此任務同步歸屬於 ${linkedProjects.length} 個專案。`,
          meta: linkedProjects.map((project) => project.name),
        }]
      : []),
    ...(task.numSubtasks > 0
      ? [{
          id: `history-subtasks-${task.id}`,
          type: 'history',
          actor,
          createdAt: now,
          text: `目前共有 ${task.numSubtasks} 個子任務，父任務進度為 ${task.progressPercent || 0}%。`,
          meta: [`${task.numSubtasks} subtasks`],
        }]
      : []),
  ];

  const commentItems = comments.map((comment, index) => {
    const knownActor = userByName.get(comment.author);
    return {
      id: comment.id || `comment-${task.id}-${index}`,
      type: 'comment',
      actor: createActivityActor(knownActor || { id: `commenter-${index}`, name: comment.author }, comment.author),
      createdAt: comment.ts || now,
      text: comment.text || '',
      mentions: (comment.mentions || []).map((mention) => ({
        id: mention.id || mention.name,
        name: mention.name,
      })),
    };
  });

  return [...history, ...commentItems].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

// ════════════════════════════════════════════════════════════
// Avatar 圓圈
// ════════════════════════════════════════════════════════════
function Avatar({ name, size = 22 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColor(name), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, flexShrink: 0,
    }}>
      {avatarChar(name)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務卡片元件（含指標徽章）
// ════════════════════════════════════════════════════════════
function TaskCard({
  task,
  onMoveNext,
  onOpenPanel,
  isDragging,
  isUpdating,
  isSelected,
  dragHandleProps,
  isOverlay = false,
}) {
  const pri      = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const days     = daysLeft(task.dueDate);
  const isOverdue = days !== null && days < 0 && task.status !== 'done';
  const progressPercent = task.progressPercent || 0;
  const numSubtasks = task.numSubtasks || 0;
  const dueDateLabel = formatDueDateLabel(task.dueDate);
  const hasSummary = Boolean(task.description?.trim());

  // Read local indicators
  const deps     = lsGet(`xcloud-deps-${task.id}`, { blocking: [], waitingOn: [] });
  const comments = lsGet(`xcloud-comments-${task.id}`, []);
  const depCount = (deps.blocking?.length || 0) + (deps.waitingOn?.length || 0);
  const mentionCount = comments.reduce((s, c) => s + (c.mentions?.length || 0), 0);

  return (
    <div
      {...(isOverlay ? {} : dragHandleProps)}
      style={{
        background:   BRAND.white,
        borderRadius: '20px',
        marginBottom: '10px',
        boxShadow: isDragging
          ? '0 24px 48px rgba(18,18,18,.22)'
          : isSelected
            ? '0 18px 36px rgba(199,0,24,.16)'
            : '0 8px 24px rgba(18,18,18,.08)',
        border: `1px solid ${
          isDragging || isSelected ? BRAND.crimson : BRAND.mist
        }`,
        transition:   'box-shadow .18s, transform .18s, border-color .18s, opacity .18s',
        overflow:     'hidden',
        cursor: isOverlay ? 'grabbing' : 'pointer',
        opacity:      isDragging ? 0.44 : (isUpdating ? 0.7 : 1),
        transform: isDragging
          ? 'rotate(-1.5deg) scale(1.01)'
          : isSelected
            ? 'translateY(-2px)'
            : 'translateY(0)',
        position: 'relative',
        pointerEvents: isOverlay ? 'none' : 'auto',
      }}
      onClick={isOverlay ? undefined : () => onOpenPanel(task)}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 14px 28px rgba(18,18,18,.12)'; }}
      onMouseLeave={e => {
        if (isDragging) return;
        e.currentTarget.style.boxShadow = isSelected
          ? '0 18px 36px rgba(199,0,24,.16)'
          : '0 8px 24px rgba(18,18,18,.08)';
      }}
    >
      <div style={{ height: 5, background: `linear-gradient(90deg, ${pri.dot}, ${BRAND.crimson})` }} />
      <div style={{ padding: '14px 16px 16px', minHeight: 202, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            background: '#FBE5E8',
            color: BRAND.crimsonDeep,
            padding: '5px 9px',
            borderRadius: 999,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}>
            {task.project?.name || '未分類'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {dueDateLabel && (
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isOverdue ? BRAND.crimson : days !== null && days <= 3 ? BRAND.warning : '#6B6461',
                background: isOverdue ? '#FDE1E4' : '#F7F2EE',
                padding: '5px 8px',
                borderRadius: 999,
              }}>
                {dueDateLabel}
              </span>
            )}
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#8A817B',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{ fontSize: 12 }}>⋮⋮</span> 拖曳
            </span>
          </div>
        </div>

        <div style={{
          fontSize: '15px',
          fontWeight: 700,
          color: BRAND.ink,
          marginBottom: 8,
          lineHeight: 1.45,
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          opacity: task.status === 'done' ? 0.58 : 1,
        }}>
          {task.title}
        </div>

        {hasSummary && (
          <div style={{
            fontSize: '12px',
            lineHeight: 1.55,
            color: '#6B6461',
            marginBottom: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 37,
          }}>
            {task.description.trim()}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: 999,
            background: pri.bg,
            color: pri.color,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: pri.dot,
              boxShadow: `0 0 0 2px ${BRAND.white}`,
            }} />
            {pri.label} 優先
          </span>
          {days !== null && (
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: isOverdue ? BRAND.crimson : days <= 3 ? BRAND.warning : '#6B6461',
            }}>
              {isOverdue
                ? `逾期 ${Math.abs(days)} 天`
                : days === 0 ? '今天到期'
                : `剩 ${days} 天`}
            </span>
          )}
          {task.status === 'done' && (
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: BRAND.success,
              background: '#DDF2E4',
              padding: '4px 8px',
              borderRadius: 999,
            }}>
              已完成
            </span>
          )}
        </div>

        {task.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {task.tags.map(tag => (
              <span key={tag.id} style={{
                fontSize: '10px',
                padding: '3px 7px',
                borderRadius: 999,
                background: tag.color || '#EEE7E2',
                color: BRAND.carbon,
                fontWeight: 600,
              }}>
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {numSubtasks > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: BRAND.carbon }}>子任務進度</span>
              <span style={{ fontSize: '11px', color: '#8A817B' }}>
                {progressPercent}% / {numSubtasks} 子任務
              </span>
            </div>
            <div style={{
              height: 7,
              borderRadius: 999,
              background: BRAND.mist,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${BRAND.crimsonDeep}, ${BRAND.crimson})`,
                transition: 'width .2s ease',
              }} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 26 }}>
            {dueDateLabel && (
              <span style={{
                fontSize: '10px',
                padding: '4px 8px',
                borderRadius: 999,
                background: '#F7F2EE',
                color: '#6B6461',
                fontWeight: 700,
              }}>
                截止 {dueDateLabel}
              </span>
            )}

            {depCount > 0 && (
              <span style={{
                fontSize: '10px',
                padding: '3px 7px',
                borderRadius: 999,
                background: '#FDE1E4',
                color: BRAND.crimson,
                fontWeight: 700,
              }} title="依賴關係">
                依賴 {depCount}
              </span>
            )}
            {mentionCount > 0 && (
              <span style={{
                fontSize: '10px',
                padding: '3px 7px',
                borderRadius: 999,
                background: '#F0ECE8',
                color: BRAND.carbon,
                fontWeight: 700,
              }} title="提及">
                @ {mentionCount}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            {!isOverlay && (
              <button
                onClick={e => { e.stopPropagation(); onMoveNext(task); }}
                style={{
                  fontSize: '11px',
                  padding: '7px 10px',
                  borderRadius: 999,
                  border: `1px solid ${task.status === 'done' ? BRAND.silver : BRAND.crimson}`,
                  background: task.status === 'done' ? BRAND.white : BRAND.crimson,
                  color: task.status === 'done' ? BRAND.carbon : BRAND.white,
                  cursor: 'pointer',
                  fontWeight: 700,
                  transition: 'all .15s', flexShrink: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background  = task.status === 'done' ? '#F4EFEB' : BRAND.crimsonDeep;
                  e.currentTarget.style.color       = task.status === 'done' ? BRAND.ink : BRAND.white;
                  e.currentTarget.style.borderColor = task.status === 'done' ? BRAND.silver : BRAND.crimsonDeep;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background  = task.status === 'done' ? BRAND.white : BRAND.crimson;
                  e.currentTarget.style.color       = task.status === 'done' ? BRAND.carbon : BRAND.white;
                  e.currentTarget.style.borderColor = task.status === 'done' ? BRAND.silver : BRAND.crimson;
                }}
              >
                {STATUS_NEXT_LABEL[task.status]}
              </button>
            )}

            {task.assignee ? (
              <div style={{ position: 'relative' }} title={task.assignee.name}>
                <div style={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: '50%',
                  border: `2px solid ${BRAND.white}`,
                  boxShadow: '0 6px 16px rgba(18,18,18,.12)',
                }} />
                <Avatar name={task.assignee.name} size={28} />
              </div>
            ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `1px dashed ${BRAND.silver}`,
                color: '#8A817B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                background: '#FCFAF8',
              }} title="未指派">
                +
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  columnId,
  onMoveNext,
  onOpenPanel,
  selectedTaskId,
  draggingTaskId,
  updatingTaskId,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getTaskSortableId(task.id),
    data: {
      type: 'task',
      taskId: task.id,
      columnId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: 'none',
      }}
    >
      <TaskCard
        task={task}
        onMoveNext={onMoveNext}
        onOpenPanel={onOpenPanel}
        isDragging={isDragging || draggingTaskId === task.id}
        isUpdating={updatingTaskId === task.id}
        isSelected={selectedTaskId === task.id}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 看板欄位
// ════════════════════════════════════════════════════════════
function KanbanColumn({
  col,
  tasks,
  onMoveNext,
  onOpenPanel,
  onAddTask,
  selectedTaskId,
  draggingTaskId,
  isDropTarget,
  updatingTaskId,
}) {
  const { setNodeRef } = useDroppable({
    id: getColumnSortableId(col.id),
    data: {
      type: 'column',
      columnId: col.id,
    },
  });

  return (
    <div style={{
      flex: '1 1 280px',
      minWidth: 280,
      background: isDropTarget ? '#FFF4F5' : 'rgba(255,255,255,0.74)',
      borderRadius: '24px',
      padding: '14px 12px 12px',
      display: 'flex',
      flexDirection: 'column',
      border: `1.5px solid ${isDropTarget ? BRAND.crimson : 'rgba(255,255,255,0.55)'}`,
      boxShadow: isDropTarget ? '0 18px 40px rgba(199,0,24,.12)' : '0 14px 36px rgba(18,18,18,.08)',
      backdropFilter: 'blur(10px)',
      transition: 'border-color .18s, box-shadow .18s, background .18s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, padding: '2px 6px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: col.accent,
            color: col.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 800,
          }}>{col.emoji}</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: BRAND.ink, letterSpacing: '.04em' }}>{col.label}</span>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            background: col.accent,
            color: col.color,
            padding: '3px 8px',
            borderRadius: '999px',
          }}>
            {tasks.length}
          </span>
          {col.id === 'done' && (
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              background: '#1C1214',
              color: '#FFF4F5',
              padding: '3px 8px',
              borderRadius: 999,
              letterSpacing: '.06em',
            }}>
              AUTO
            </span>
          )}
        </div>
        <button
          onClick={() => onAddTask(col.id)}
          style={{
            width: 30, height: 30, borderRadius: 999,
            border: `1px dashed ${col.color}`,
            background: BRAND.white, cursor: 'pointer',
            fontSize: 18, color: col.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={`新增${col.label}任務`}
        >+</button>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 4,
          borderRadius: 18,
          background: isDropTarget ? 'rgba(199,0,24,0.04)' : 'transparent',
          outline: draggingTaskId && isDropTarget ? `2px dashed ${BRAND.crimson}` : 'none',
          outlineOffset: '-10px',
          minHeight: 160,
        }}
      >
        {tasks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 12px',
            color: '#8A817B',
            fontSize: '12px',
            borderRadius: 18,
            border: `1px dashed ${BRAND.silver}`,
            background: 'rgba(255,255,255,0.52)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: .9, color: col.color }}>{col.emoji}</div>
            <div style={{ fontWeight: 700, color: BRAND.carbon, marginBottom: 4 }}>目前沒有任務</div>
            <div>{col.id === 'done' ? '把卡片拖進來，系統會自動結案並通知成員' : '把任務拖到這裡改變工作階段'}</div>
          </div>
        ) : (
          <SortableContext
            items={tasks.map((task) => getTaskSortableId(task.id))}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map(task => (
              <SortableTaskCard
                key={task.id}
                task={task}
                columnId={col.id}
                onMoveNext={onMoveNext}
                onOpenPanel={onOpenPanel}
                selectedTaskId={selectedTaskId}
                draggingTaskId={draggingTaskId}
                updatingTaskId={updatingTaskId}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 新增任務對話框（保持置中 modal）
// ════════════════════════════════════════════════════════════
function AddTaskModal({ defaultStatus, projects, users, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', description: '',
    status: defaultStatus || 'todo', priority: 'medium',
    projectId: projects[0]?.id || '', assigneeId: '', dueDate: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert('請輸入任務名稱');
    if (!form.projectId)    return alert('請選擇專案');
    setSaving(true);
    try {
      const res = await fetch(`${API}/${form.projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:      form.title.trim(),
          description: form.description,
          status:     form.status,
          priority:   form.priority,
          assigneeId: form.assigneeId ? parseInt(form.assigneeId) : undefined,
          dueDate:    form.dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSave();
    } catch (err) {
      alert('建立失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1200,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: 480, maxHeight: '80vh',
        overflow: 'auto', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#111827' }}>✏️ 新增任務</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>任務名稱 *</label>
              <input style={inputStyle} placeholder="輸入任務名稱..." value={form.title}
                onChange={e => set('title', e.target.value)} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>說明</label>
              <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }}
                placeholder="任務描述（選填）" value={form.description}
                onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>所屬專案 *</label>
              <select style={inputStyle} value={form.projectId}
                onChange={e => set('projectId', e.target.value)}>
                <option value="">請選擇專案...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>初始狀態</label>
                <select style={inputStyle} value={form.status}
                  onChange={e => set('status', e.target.value)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>優先度</label>
                <select style={inputStyle} value={form.priority}
                  onChange={e => set('priority', e.target.value)}>
                  <option value="urgent">🔴 緊急</option>
                  <option value="high">🟠 高</option>
                  <option value="medium">🟡 中</option>
                  <option value="low">⚪ 低</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>指派給</label>
                <select style={inputStyle} value={form.assigneeId}
                  onChange={e => set('assigneeId', e.target.value)}>
                  <option value="">未指派</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>截止日期</label>
                <input type="date" style={inputStyle} value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              fontSize: '13px', cursor: 'pointer',
            }}>取消</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 18px', borderRadius: 8,
              border: 'none', background: BRAND.crimson, color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: saving ? .7 : 1,
            }}>
              {saving ? '建立中...' : '✅ 建立任務'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 刪除確認 Modal
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({ task, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      const res  = await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '刪除失敗');
      onDeleted(task.id);
    } catch (e) {
      setError(e.message); setDeleting(false);
    }
  };

  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1300,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32,
        width: 420, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fee2e2', margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>🗑️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#111827' }}>
          確認刪除任務？
        </h2>
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 10, padding: '12px 16px',
          margin: '12px 0 16px', textAlign: 'left',
        }}>
          <div style={{ fontSize: '11px', color: BRAND.crimsonDeep, fontWeight: 600, marginBottom: 4 }}>
            📁 {task.project?.name || '未知專案'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: 6 }}>
            {task.title}
          </div>
          <span style={{
            fontSize: '11px', padding: '2px 7px', borderRadius: 4,
            background: pri.bg, color: pri.color, fontWeight: 600,
          }}>
            {pri.label}
          </span>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#9ca3af' }}>
          此操作為軟刪除，資料不會永久消失。
        </p>
        {error && (
          <div style={{
            background: '#fee2e2', color: '#b91c1c',
            borderRadius: 8, padding: '8px 12px',
            fontSize: '12px', marginBottom: 14,
          }}>❌ {error}</div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} disabled={deleting} style={{
            padding: '9px 20px', borderRadius: 8,
            border: '1px solid #d1d5db', background: '#fff',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>取消</button>
          <button onClick={handleDelete} disabled={deleting} style={{
            padding: '9px 20px', borderRadius: 8,
            border: 'none', background: deleting ? '#fca5a5' : '#ef4444',
            color: '#fff', fontSize: '13px', fontWeight: 600,
            cursor: deleting ? 'not-allowed' : 'pointer',
          }}>
            {deleting ? '刪除中...' : '確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務詳情側邊面板 (Asana 風格)
// ════════════════════════════════════════════════════════════
function TaskSidePanel({ task, users, projects, allTasks, onClose, onSaved, onDeleteRequest, currentUser }) {
  const currentProject = task.project ? {
    id: task.project.id,
    name: task.project.name,
    color: '#FBE5E8',
  } : null;
  const extraProjects = lsGet(`xcloud-multihome-${task.id}`, []);
  const linkedProjects = [
    ...(currentProject ? [currentProject] : []),
    ...extraProjects
      .filter((project) => String(project.id) !== String(currentProject?.id))
      .map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color || '#F3EEEA',
      })),
  ];
  const scopedProjectIds = linkedProjects.map((project) => String(project.id));
  const customFieldDefinitions = lsGet('xcloud-custom-fields', [])
    .filter((field) => {
      const usedInProjects = (field.usedInProjects || []).map(String);
      return field.global || usedInProjects.length === 0 || usedInProjects.some((projectId) => scopedProjectIds.includes(projectId));
    })
    .map((field) => ({
      id: field.id,
      name: field.name,
      type: mapPanelFieldType(field.type),
      placeholder: field.description || `設定 ${field.name}`,
      description: field.description || '',
      unit: field.type === 'currency' ? 'NT$' : field.unit,
      options: mapPanelFieldOptions(field),
    }));
  const customFieldValues = lsGet(`xcloud-task-fields-${task.id}`, {});
  const comments = lsGet(`xcloud-comments-${task.id}`, []);
  const subtasks = buildSubtaskTree(allTasks, task.id);
  const activity = buildTaskActivity(task, linkedProjects, comments, currentUser, users);

  const handleSave = async (payload) => {
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title.trim(),
          assigneeId: payload.assigneeId ? parseInt(payload.assigneeId, 10) : null,
          dueDate: payload.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const primaryProjectId = currentProject ? String(currentProject.id) : String(payload.projectIds[0] || '');
      const persistedExtraProjects = projects
        .filter((project) =>
          payload.projectIds.some((projectId) => String(projectId) === String(project.id) && String(project.id) !== primaryProjectId)
        )
        .map((project) => ({
          id: project.id,
          name: project.name,
          color: '#F3EEEA',
        }));

      lsSet(`xcloud-multihome-${task.id}`, persistedExtraProjects);
      lsSet(`xcloud-task-fields-${task.id}`, payload.customFieldValues || {});
      onSaved();
    } catch (error) {
      alert(`更新失敗：${error.message}`);
    }
  };

  const handleQuickAddSubtask = async ({ title }) => {
    try {
      const projectId = task.project?.id;
      if (!projectId) throw new Error('找不到任務所屬專案');

      const res = await fetch(`${API}/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          status: 'todo',
          priority: 'medium',
          parentTaskId: task.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
    } catch (error) {
      alert(`新增子任務失敗：${error.message}`);
    }
  };

  const handleToggleSubtask = async ({ subtaskId, completed }) => {
    try {
      const res = await fetch(`${API}/tasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: completed ? 'completed' : 'todo' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
    } catch (error) {
      alert(`更新子任務失敗：${error.message}`);
    }
  };

  return (
    <TaskDetailPanel
      open={Boolean(task)}
      task={{
        id: task.id,
        title: task.title,
        status: task.status,
        assignee: task.assignee || null,
        dueDate: task.dueDate,
        projects: linkedProjects,
        customFieldValues,
        subtasks,
        activity,
      }}
      members={users}
      availableProjects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: '#FBE5E8',
      }))}
      customFields={customFieldDefinitions}
      lockedProjectIds={currentProject ? [currentProject.id] : []}
      onClose={onClose}
      onSave={handleSave}
      onDelete={() => onDeleteRequest(task)}
      onQuickAddSubtask={handleQuickAddSubtask}
      onToggleSubtask={handleToggleSubtask}
    />
  );
}

// ════════════════════════════════════════════════════════════
// 任務看板主頁面
// ════════════════════════════════════════════════════════════
export default function TaskKanbanPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const currentUser = user
    ? { id: user.id, name: user.name || '我', color: BRAND.crimson }
    : { id: 0, name: '我', color: BRAND.crimson };

  const [kanban,   setKanban]   = useState({ todo: [], in_progress: [], review: [], done: [] });
  const [projects, setProjects] = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // 篩選器
  const [filterProject,  setFilterProject]  = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // UI 狀態
  const [addModal,   setAddModal]   = useState(null);  // null | status string
  const [panelTask,  setPanelTask]  = useState(null);  // null | task (side panel)
  const [deleteTask, setDeleteTask] = useState(null);  // null | task

  const [toast, setToast] = useState(null);
  const [automationFeed, setAutomationFeed] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragPreviewKanban, setDragPreviewKanban] = useState(null);
  const [dropColumnId, setDropColumnId] = useState(null);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const showToast = (message, tone = 'neutral') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  };

  // ── 資料載入 ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (filterProject)  params.set('projectId',  filterProject);
      if (filterAssignee) params.set('assigneeId', filterAssignee);
      if (filterPriority) params.set('priority',   filterPriority);

      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API}/tasks?${params}`),
        fetch(`${API}/users?companyId=${companyId}`),
      ]);
      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();

      if (!tasksData.success) throw new Error(tasksData.error);
      setKanban(tasksData.data.kanban);
      setDragPreviewKanban(null);
      setProjects(tasksData.data.projects || []);
      setUsers(usersData.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, filterProject, filterAssignee, filterPriority]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (task, nextColumnId, source = 'button') => {
    const targetStatus = normalizeDropStatus(nextColumnId);
    const currentStatus = task.status === 'done' ? 'completed' : task.status;

    if (currentStatus === targetStatus) {
      setDraggingTaskId(null);
      setDropColumnId(null);
      return;
    }

    setUpdatingTaskId(task.id);
    try {
      const res = await fetch(`${API}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const automation = data.data?.automation;
      if (automation?.triggered) {
        setAutomationFeed({
          ...automation,
          taskTitle: task.title,
          source,
          targetColumnId: nextColumnId,
          triggeredAt: new Date().toISOString(),
        });
      }

      showToast(formatAutomationMessage(task.title, automation), automation?.triggered ? 'accent' : 'neutral');
      await fetchData();
    } catch (e) {
      showToast(`狀態更新失敗：${e.message}`, 'error');
    } finally {
      setUpdatingTaskId(null);
      setDraggingTaskId(null);
      setDropColumnId(null);
    }
  };

  // ── 移到下一狀態 ─────────────────────────────────────────
  const handleMoveNext = async (task) => {
    await handleStatusChange(task, STATUS_NEXT[task.status], 'button');
  };

  // ── 刪除成功 ─────────────────────────────────────────────
  const handleDeleted = (taskId) => {
    setDeleteTask(null);
    setPanelTask(null);
    setSelectedTaskId((current) => (current === taskId ? null : current));
    setKanban(prev => {
      const next = { ...prev };
      for (const col of Object.keys(next)) {
        next[col] = next[col].filter(t => t.id !== taskId);
      }
      return next;
    });
    showToast('任務已刪除', 'error');
  };

  // ── 取得所有任務（扁平列表）供 dependency picker 使用 ───
  const activeKanban = dragPreviewKanban || kanban;
  const allTasks = COLUMNS.flatMap(c => activeKanban[c.id] || []);
  const persistedTasks = COLUMNS.flatMap(c => kanban[c.id] || []);
  const selectedTask = persistedTasks.find((task) => task.id === selectedTaskId) || panelTask;
  const automationDepth = automationFeed?.parentProgress?.ancestorChain?.length || 0;

  const openTaskPanel = (task) => {
    setSelectedTaskId(task.id);
    setPanelTask(task);
  };

  const handleDuplicateTask = useCallback(async (task) => {
    const projectId = task.project?.id || task.projectId;
    if (!projectId) {
      showToast('找不到任務所屬專案，無法複製', 'error');
      return;
    }

    setUpdatingTaskId(task.id);
    try {
      const res = await fetch(`${API}/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${task.title}（副本）`,
          description: task.description || '',
          status: task.status,
          priority: task.priority || 'medium',
          assigneeId: task.assignee?.id,
          dueDate: task.dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      await fetchData();
      setSelectedTaskId(data.data?.id || null);
      showToast(`已複製「${task.title}」`, 'accent');
    } catch (e) {
      showToast(`複製失敗：${e.message}`, 'error');
    } finally {
      setUpdatingTaskId(null);
    }
  }, [fetchData]);

  const handleDragCancel = () => {
    setDraggingTaskId(null);
    setDragPreviewKanban(null);
    setDropColumnId(null);
  };

  const handleDragStart = ({ active }) => {
    const taskId = parseTaskSortableId(active?.id);
    if (!taskId) return;

    const task = findTaskInKanban(kanban, taskId);
    if (!task) return;

    setDraggingTaskId(taskId);
    setSelectedTaskId(taskId);
    setDragPreviewKanban(cloneKanbanColumns(kanban));
    setDropColumnId(findTaskColumnId(kanban, taskId));
  };

  const handleDragOver = ({ active, over }) => {
    const taskId = parseTaskSortableId(active?.id);
    if (!taskId || !over?.id) return;

    const board = dragPreviewKanban || kanban;
    const overColumnId = resolveOverColumnId(board, over.id);
    if (!overColumnId) return;

    setDropColumnId(overColumnId);
    setDragPreviewKanban((currentBoard) => {
      const workingBoard = currentBoard || cloneKanbanColumns(kanban);
      return moveTaskPreview(workingBoard, taskId, overColumnId, over.id);
    });
  };

  const handleDragEnd = async ({ active, over }) => {
    const taskId = parseTaskSortableId(active?.id);
    const draggedTask = taskId ? findTaskInKanban(kanban, taskId) : null;
    const sourceColumnId = taskId ? findTaskColumnId(kanban, taskId) : null;
    const board = dragPreviewKanban || kanban;
    const targetColumnId = over?.id ? resolveOverColumnId(board, over.id) : null;

    setDraggingTaskId(null);
    setDragPreviewKanban(null);
    setDropColumnId(null);

    if (!draggedTask || !sourceColumnId || !targetColumnId || sourceColumnId === targetColumnId) {
      return;
    }

    await handleStatusChange(draggedTask, targetColumnId, 'drag');
  };

  useEffect(() => {
    if (panelTask) {
      setSelectedTaskId(panelTask.id);
    }
  }, [panelTask]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedTask || isTypingElement(event.target)) return;

      const selectedText = window.getSelection?.()?.toString().trim();
      if (selectedText) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        handleDuplicateTask(selectedTask);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setDeleteTask(selectedTask);
        setPanelTask((current) => (current?.id === selectedTask.id ? null : current));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDuplicateTask, selectedTask]);

  // ── 統計 ─────────────────────────────────────────────────
  const totalTasks   = COLUMNS.reduce((s, c) => s + (activeKanban[c.id]?.length || 0), 0);
  const doneTasks    = activeKanban.done?.length || 0;
  const completion   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const overdueTasks = [...(activeKanban.todo || []), ...(activeKanban.in_progress || []), ...(activeKanban.review || [])]
    .filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
  const hasFilter = filterProject || filterAssignee || filterPriority;
  const dragPreviewTask = draggingTaskId ? findTaskInKanban(activeKanban, draggingTaskId) : null;

  // ── 渲染 ─────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100%',
      background: 'linear-gradient(180deg, #12090A 0%, #2A0C11 16%, #F7F2EE 16%, #F4EEE9 100%)',
      padding: '24px clamp(18px, 3vw, 32px) 32px',
      boxSizing: 'border-box',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    }}>
      <div style={{ maxWidth: 1580, margin: '0 auto' }}>

        {toast && (
          <div style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            zIndex: 9999,
            background: toast.tone === 'accent'
              ? `linear-gradient(135deg, ${BRAND.crimsonDeep}, ${BRAND.crimson})`
              : toast.tone === 'error'
                ? '#1F1114'
                : '#FFFFFF',
            color: toast.tone === 'neutral' ? BRAND.ink : '#fff',
            padding: '14px 18px',
            borderRadius: 16,
            fontSize: 14,
            fontWeight: 700,
            border: toast.tone === 'neutral' ? `1px solid ${BRAND.mist}` : 'none',
            boxShadow: '0 18px 36px rgba(18,18,18,.18)',
            animation: 'fadeIn .22s ease',
            maxWidth: 420,
          }}>
            {toast.message}
          </div>
        )}

        <div style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 30,
          padding: '28px clamp(18px, 3vw, 32px)',
          color: '#fff',
          background: `linear-gradient(135deg, ${BRAND.ink} 0%, ${BRAND.crimsonDeep} 38%, ${BRAND.crimson} 100%)`,
          boxShadow: '0 28px 56px rgba(18,18,18,.28)',
        }}>
          <div style={{
            position: 'absolute',
            top: -80,
            right: -40,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,.24) 0%, rgba(255,255,255,0) 68%)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: -120,
            left: -40,
            width: 340,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 72%)',
          }} />

          <div style={{ position: 'relative', display: 'flex', gap: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 620px', minWidth: 280 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {['Rule Engine Live', 'Drag to Complete', 'Asana-style Flow'].map((chip) => (
                  <span key={chip} style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.12)',
                    border: '1px solid rgba(255,255,255,.18)',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}>
                    {chip}
                  </span>
                ))}
              </div>
              <h1 style={{
                margin: 0,
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                maxWidth: 760,
              }}>
                任務看板與自動化規則，現在是一條完整的執行鏈。
              </h1>
              <p style={{
                margin: '14px 0 0',
                fontSize: 15,
                lineHeight: 1.7,
                color: 'rgba(255,255,255,.82)',
                maxWidth: 760,
              }}>
                把任務拖進「已完成」欄位，系統會自動結案、回填父任務進度條，並通知追蹤該專案的成員。右側面板依然保留，現在看板互動更接近 Asana 的節奏。
              </p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                <button
                  onClick={() => setAddModal('todo')}
                  style={{
                    padding: '11px 18px',
                    borderRadius: 999,
                    border: 'none',
                    background: '#fff',
                    color: BRAND.crimsonDeep,
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  + 新增任務
                </button>
                <button
                  onClick={fetchData}
                  style={{
                    padding: '11px 18px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,.2)',
                    background: 'rgba(255,255,255,.08)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? '同步中...' : '重新同步'}
                </button>
              </div>
            </div>

            <div style={{
              flex: '0 1 340px',
              minWidth: 280,
              background: 'rgba(255,255,255,.09)',
              border: '1px solid rgba(255,255,255,.14)',
              borderRadius: 24,
              padding: 18,
              backdropFilter: 'blur(10px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>
                內建規則
              </div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>
                拖曳到已完成欄位
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {[
                  '將任務狀態自動改為 Completed',
                  '沿著 subtask 鏈往上更新父任務進度',
                  '通知追蹤該專案的成員與相關負責人',
                ].map((item) => (
                  <div key={item} style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    color: 'rgba(255,255,255,.84)',
                  }}>
                    <span style={{ color: '#FFD9DE', fontWeight: 800 }}>•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 18,
                background: 'rgba(18,18,18,.2)',
                border: '1px solid rgba(255,255,255,.12)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.72)', marginBottom: 6 }}>
                  {automationFeed ? '最近一次自動化' : '規則待命中'}
                </div>
                {automationFeed ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35 }}>
                      {automationFeed.taskTitle}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
                      更新 {automationDepth || 0} 層父任務，通知 {automationFeed.notificationsSent || 0} 位成員
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.78)', lineHeight: 1.6 }}>
                    從任一欄位把卡片拖進「已完成」，這裡就會顯示規則實際執行的結果。
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            {[
              { label: '總任務', value: totalTasks, accent: '#FFFFFF' },
              { label: '完成率', value: `${completion}%`, accent: '#FFD9DE' },
              { label: '已完成', value: doneTasks, accent: '#DDF2E4' },
              { label: '逾期', value: overdueTasks, accent: '#FBE7D5' },
            ].map((stat) => (
              <div key={stat.label} style={{
                minWidth: 120,
                flex: '1 1 120px',
                padding: '14px 16px',
                borderRadius: 18,
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.12)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', marginBottom: 8, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.accent }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          marginTop: 18,
          padding: '18px 20px',
          borderRadius: 24,
          background: 'rgba(255,255,255,.82)',
          border: `1px solid ${BRAND.mist}`,
          boxShadow: '0 16px 40px rgba(18,18,18,.08)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A817B' }}>
                Board Filters
              </div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: BRAND.ink }}>
                依專案、負責人與優先度切換工作視角
              </div>
            </div>
            <div style={{
              padding: '10px 12px',
              borderRadius: 16,
              background: automationFeed ? '#FFF3F5' : '#F1ECE7',
              border: `1px solid ${automationFeed ? '#F3C4CC' : BRAND.mist}`,
              color: automationFeed ? BRAND.crimsonDeep : BRAND.carbon,
              fontSize: 12,
              fontWeight: 700,
            }}>
              {automationFeed
                ? `最近規則命中：${automationFeed.taskTitle}`
                : '規則引擎待命中'}
            </div>
          </div>

          <div style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              style={{ ...inputStyle, maxWidth: 220, minWidth: 180 }}
            >
              <option value="">所有專案</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              style={{ ...inputStyle, maxWidth: 220, minWidth: 180 }}
            >
              <option value="">所有成員</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              style={{ ...inputStyle, maxWidth: 220, minWidth: 180 }}
            >
              <option value="">所有優先度</option>
              <option value="urgent">緊急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>

            {hasFilter && (
              <button
                onClick={() => { setFilterProject(''); setFilterAssignee(''); setFilterPriority(''); }}
                style={{
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: `1px solid ${BRAND.crimson}`,
                  background: '#FFF5F6',
                  color: BRAND.crimson,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                清除篩選
              </button>
            )}

            <div style={{
              marginLeft: 'auto',
              padding: '9px 12px',
              borderRadius: 14,
              background: '#1B1315',
              color: '#FFF4F5',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.04em',
            }}>
              快捷鍵：Ctrl/Cmd + C 複製，Backspace 刪除
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, minHeight: 'calc(100vh - 280px)' }}>
          {error ? (
            <div style={{
              textAlign: 'center',
              padding: '64px 20px',
              color: BRAND.crimson,
              background: 'rgba(255,255,255,.8)',
              borderRadius: 24,
              border: `1px solid ${BRAND.mist}`,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>×</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{error}</div>
              <button onClick={fetchData} style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: `1px solid ${BRAND.crimson}`,
                background: BRAND.white,
                color: BRAND.crimson,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
              }}>重新載入</button>
            </div>
          ) : loading ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {COLUMNS.map(col => (
                <div key={col.id} style={{
                  flex: '1 1 280px',
                  minWidth: 280,
                  minHeight: 280,
                  borderRadius: 24,
                  background: 'rgba(255,255,255,.7)',
                  border: `1px solid ${BRAND.mist}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8A817B',
                  fontWeight: 700,
                }}>
                  載入 {col.label}...
                </div>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
                {COLUMNS.map(col => (
                  <KanbanColumn
                    key={col.id}
                    col={col}
                    tasks={activeKanban[col.id] || []}
                    onMoveNext={handleMoveNext}
                    onOpenPanel={openTaskPanel}
                    onAddTask={(status) => setAddModal(status)}
                    selectedTaskId={selectedTaskId}
                    draggingTaskId={draggingTaskId}
                    isDropTarget={dropColumnId === col.id}
                    updatingTaskId={updatingTaskId}
                  />
                ))}
              </div>

              <DragOverlay>
                {dragPreviewTask ? (
                  <div style={{ width: 320 }}>
                    <TaskCard
                      task={dragPreviewTask}
                      onMoveNext={() => {}}
                      onOpenPanel={() => {}}
                      isDragging
                      isUpdating={false}
                      isSelected={false}
                      isOverlay
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {panelTask && selectedTask && (
          <TaskSidePanel
            key={selectedTask.id}
            task={selectedTask}
            users={users}
            projects={projects}
            allTasks={persistedTasks}
            onClose={() => setPanelTask(null)}
            onSaved={() => { fetchData(); showToast('任務已更新', 'neutral'); }}
            onDeleteRequest={(task) => { setPanelTask(null); setDeleteTask(task); }}
            currentUser={currentUser}
          />
        )}

        {addModal && (
          <AddTaskModal
            defaultStatus={addModal}
            projects={projects}
            users={users}
            onSave={() => { setAddModal(null); fetchData(); showToast('任務已建立', 'accent'); }}
            onClose={() => setAddModal(null)}
          />
        )}

        {deleteTask && (
          <DeleteConfirmModal
            task={deleteTask}
            onClose={() => setDeleteTask(null)}
            onDeleted={handleDeleted}
          />
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
