import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './MyTasksWorkspacePage.css';
import { useIsMobile } from '../../hooks/useResponsive';

const C = {
  accent: 'var(--xc-brand)',
  accentDark: 'var(--xc-brand-dark)',
  accentLight: 'var(--xc-brand-soft-strong)',
  pageBg: 'var(--xc-bg)',
  white: 'var(--xc-surface-strong)',
  black: 'var(--xc-text)',
  gray50: 'var(--xc-surface-soft)',
  gray100: 'var(--xc-surface-muted)',
  gray200: 'var(--xc-border)',
  gray300: 'var(--xc-border-strong)',
  gray400: 'var(--xc-text-muted)',
  gray500: 'var(--xc-text-muted)',
  gray600: 'var(--xc-text-soft)',
  gray700: 'var(--xc-text-soft)',
  gray800: 'var(--xc-text)',
  gray900: 'var(--xc-text)',
  blue: 'var(--xc-info)',
  orange: '#F97316',
  green: 'var(--xc-success)',
  red: 'var(--xc-danger)',
  amber: 'var(--xc-warning)',
};

const TABS = [
  { key: 'list', label: '清單' },
  { key: 'board', label: '看板' },
  { key: 'calendar', label: '行事曆' },
  { key: 'dashboard', label: '儀表板' },
  { key: 'files', label: '檔案' },
];

const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: 'due_soon', label: '七日內' },
  { key: 'overdue', label: '逾期' },
  { key: 'done', label: '已完成' },
];

const STATUS_OPTIONS = [
  { value: 'todo', label: '待辦' },
  { value: 'in_progress', label: '進行中' },
  { value: 'review', label: '待審核' },
  { value: 'done', label: '已完成' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '緊急' },
];

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return Math.round((date - todayStart()) / (1000 * 60 * 60 * 24));
}

function isToday(dateStr) {
  return daysUntil(dateStr) === 0;
}

function isOverdue(dateStr) {
  const diff = daysUntil(dateStr);
  return diff !== null && diff < 0;
}

function isDueSoon(dateStr) {
  const diff = daysUntil(dateStr);
  return diff !== null && diff >= 0 && diff <= 7;
}

function normalizeDateInput(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '未設定';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '未設定';
  if (isToday(dateStr)) return '今天';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatDueLabel(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === null) return '未排程';
  if (diff === 0) return '今天到期';
  if (diff === 1) return '明天到期';
  if (diff > 1) return `${diff} 天後`;
  return `逾期 ${Math.abs(diff)} 天`;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getPriorityColor(priority) {
  return {
    urgent: C.red,
    high: C.orange,
    medium: C.blue,
    low: C.green,
  }[priority] || C.gray400;
}

function getPriorityRank(priority) {
  return {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  }[priority] ?? 4;
}

function getStatusLabel(status) {
  return STATUS_OPTIONS.find(item => item.value === status)?.label || status || '待辦';
}

function getPriorityLabel(priority) {
  return PRIORITY_OPTIONS.find(item => item.value === priority)?.label || priority || '未設定';
}

function getStatusTone(status) {
  if (status === 'done') return { fg: '#166534', bg: '#ECFDF5', border: '#BBF7D0' };
  if (status === 'review') return { fg: '#92400E', bg: '#FFFBEB', border: '#FDE68A' };
  if (status === 'in_progress') return { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
  return { fg: '#475569', bg: '#F8FAFC', border: '#CBD5E1' };
}

function getPriorityTone(priority) {
  if (priority === 'urgent') return { fg: '#991B1B', bg: '#FEF2F2', border: '#FECACA' };
  if (priority === 'high') return { fg: '#9A3412', bg: '#FFF7ED', border: '#FDBA74' };
  if (priority === 'medium') return { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
  return { fg: '#166534', bg: '#F0FDF4', border: '#BBF7D0' };
}

function buildTaskSearchText(task) {
  return [
    task.title,
    task.description,
    task.projectName,
    task.project?.name,
    task.assignee?.name,
    getStatusLabel(task.status),
    getPriorityLabel(task.priority),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesQuickFilter(task, quickFilter) {
  if (quickFilter === 'done') return Boolean(task.isDone);
  if (task.isDone) return false;
  if (quickFilter === 'today') return isToday(task.dueDate);
  if (quickFilter === 'due_soon') return isDueSoon(task.dueDate);
  if (quickFilter === 'overdue') return isOverdue(task.dueDate);
  return true;
}

function sortTasksByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const aDiff = daysUntil(a.dueDate);
    const bDiff = daysUntil(b.dueDate);
    const aDueRank = aDiff === null ? 999 : aDiff < 0 ? aDiff - 1000 : aDiff;
    const bDueRank = bDiff === null ? 999 : bDiff < 0 ? bDiff - 1000 : bDiff;

    if (aDueRank !== bDueRank) return aDueRank - bDueRank;
    if (getPriorityRank(a.priority) !== getPriorityRank(b.priority)) {
      return getPriorityRank(a.priority) - getPriorityRank(b.priority);
    }
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
}

function groupTasksByList(lists, tasks) {
  const grouped = {};
  lists.forEach(list => {
    grouped[list.id] = [];
  });
  tasks.forEach(task => {
    if (!grouped[task.listId]) grouped[task.listId] = [];
    grouped[task.listId].push(task);
  });
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => {
      if (a.isDone !== b.isDone) return Number(a.isDone) - Number(b.isDone);
      if ((a.listPosition || 0) !== (b.listPosition || 0)) return (a.listPosition || 0) - (b.listPosition || 0);
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  });
  return grouped;
}

function reorderItemsById(items, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return items;

  const draggedIndex = items.findIndex(item => item.id === draggedId);
  const targetIndex = items.findIndex(item => item.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return items;

  const nextItems = [...items];
  const [draggedItem] = nextItems.splice(draggedIndex, 1);
  nextItems.splice(targetIndex, 0, draggedItem);
  return nextItems;
}

function reorderTasksForDrop(lists, tasks, draggedTaskId, targetListId, targetTaskId = null) {
  if (!draggedTaskId || !targetListId || draggedTaskId === targetTaskId) {
    return { tasks, sourceListId: null, targetListId };
  }

  const draggedTask = tasks.find(task => task.id === draggedTaskId);
  if (!draggedTask) return { tasks, sourceListId: null, targetListId };

  const sourceListId = draggedTask.listId;
  const grouped = groupTasksByList(lists, tasks);
  const sourceTaskIds = (grouped[sourceListId] || []).map(task => task.id).filter(id => id !== draggedTaskId);
  const targetTaskIds = sourceListId === targetListId
    ? sourceTaskIds
    : (grouped[targetListId] || []).map(task => task.id);

  const nextTargetTaskIds = [...targetTaskIds];
  const insertIndex = targetTaskId ? nextTargetTaskIds.indexOf(targetTaskId) : nextTargetTaskIds.length;
  nextTargetTaskIds.splice(insertIndex === -1 ? nextTargetTaskIds.length : insertIndex, 0, draggedTaskId);

  const orderMap = new Map();
  if (sourceListId === targetListId) {
    nextTargetTaskIds.forEach((taskId, index) => {
      orderMap.set(taskId, { listId: targetListId, listPosition: (index + 1) * 100 });
    });
  } else {
    sourceTaskIds.forEach((taskId, index) => {
      orderMap.set(taskId, { listId: sourceListId, listPosition: (index + 1) * 100 });
    });
    nextTargetTaskIds.forEach((taskId, index) => {
      orderMap.set(taskId, { listId: targetListId, listPosition: (index + 1) * 100 });
    });
  }

  return {
    sourceListId,
    targetListId,
    tasks: tasks.map(task => {
      const placement = orderMap.get(task.id);
      if (!placement) return task;
      return {
        ...task,
        listId: placement.listId,
        listPosition: placement.listPosition,
      };
    }),
  };
}

function Avatar({ name = 'XC', size = 30 }) {
  const initials = String(name || 'XC')
    .split(/\s+/)
    .map(part => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="mytasks-workspace__avatar"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.floor(size * 0.34)) }}
    >
      {initials}
    </div>
  );
}

function Tag({ label, tone }) {
  return (
    <span
      className="mytasks-workspace__tag"
      style={{
        color: tone.fg,
        background: tone.bg,
        borderColor: tone.border,
      }}
    >
      {label}
    </span>
  );
}

function TaskCheckbox({ checked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mytasks-workspace__checkbox${checked ? ' is-checked' : ''}`}
      aria-label={checked ? '取消完成任務' : '標記任務完成'}
    >
      {checked ? '✓' : ''}
    </button>
  );
}

function HeroStat({ label, value, hint, tone }) {
  return (
    <div
      className="mytasks-workspace__stat"
      style={{
        '--stat-accent': tone,
      }}
    >
      <div className="mytasks-workspace__stat-label">{label}</div>
      <div className="mytasks-workspace__stat-value">{value}</div>
      <div className="mytasks-workspace__stat-hint">{hint}</div>
    </div>
  );
}

function EmptyPanel({ title, description, action }) {
  return (
    <div className="mytasks-workspace__empty">
      <div className="mytasks-workspace__empty-title">{title}</div>
      <div className="mytasks-workspace__empty-copy">{description}</div>
      {action}
    </div>
  );
}

function LoadingPanel({ label }) {
  return (
    <div className="mytasks-workspace__loading">
      <div className="mytasks-workspace__loading-ring" />
      <div>{label}</div>
    </div>
  );
}

function InlineComposer({ placeholder, submitLabel, onSubmit, onCancel, autoFocus = true }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <div className="mytasks-workspace__composer">
      <input
        ref={inputRef}
        value={value}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="mytasks-workspace__composer-input"
      />
      <div className="mytasks-workspace__composer-actions">
        <button type="button" onClick={submit} className="mytasks-workspace__button">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="mytasks-workspace__button mytasks-workspace__button--ghost">
          取消
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  draggedTaskId,
  allowReorder,
  onDragTaskStart,
  onDropTask,
  onToggleDone,
  onOpen,
}) {
  const dueTone = task.isDone
    ? C.gray500
    : isOverdue(task.dueDate)
      ? C.red
      : isToday(task.dueDate)
        ? C.accent
        : C.gray600;

  return (
    <div
      draggable={allowReorder}
      onDragStart={() => allowReorder && onDragTaskStart(task.id)}
      onDragEnd={() => allowReorder && onDragTaskStart(null)}
      onDragOver={event => allowReorder && event.preventDefault()}
      onDrop={event => {
        if (!allowReorder) return;
        event.preventDefault();
        if (draggedTaskId) onDropTask(draggedTaskId, task.listId, task.id);
      }}
      onClick={() => onOpen(task)}
      className={`mytasks-workspace__row${draggedTaskId === task.id ? ' is-dragging' : ''}${allowReorder ? ' is-reorderable' : ''}`}
    >
      <div className="mytasks-workspace__row-main">
        <TaskCheckbox
          checked={task.isDone}
          onClick={event => {
            event.stopPropagation();
            onToggleDone(task);
          }}
        />
        <div
          className="mytasks-workspace__row-priority"
          style={{ background: getPriorityColor(task.priority) }}
        />
        <div className="mytasks-workspace__row-copy">
          <div className={`mytasks-workspace__row-title${task.isDone ? ' is-done' : ''}`}>
            {task.title}
          </div>
          <div className="mytasks-workspace__row-meta">
            {task.projectName && (
              <span className="mytasks-workspace__meta-chip">
                <span
                  className="mytasks-workspace__meta-dot"
                  style={{ background: task.projectColor || C.accent }}
                />
                {task.projectName}
              </span>
            )}
            {task.numSubtasks > 0 && (
              <span className="mytasks-workspace__meta-chip">{task.numSubtasks} 個子任務</span>
            )}
            {task.description && (
              <span className="mytasks-workspace__meta-chip">
                {task.description.length > 36 ? `${task.description.slice(0, 36)}...` : task.description}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mytasks-workspace__row-side">
        <div className="mytasks-workspace__row-due" style={{ color: dueTone }}>
          <div className="mytasks-workspace__row-due-label">{formatDueLabel(task.dueDate)}</div>
          <div className="mytasks-workspace__row-due-value">{formatDate(task.dueDate)}</div>
        </div>

        <div className="mytasks-workspace__row-assignee">
          {task.assignee ? (
            <>
              <Avatar name={task.assignee.name} size={28} />
              <span>{task.assignee.name}</span>
            </>
          ) : (
            <span className="mytasks-workspace__muted">未指派</span>
          )}
        </div>

        <div className="mytasks-workspace__row-tags">
          <Tag label={getStatusLabel(task.status)} tone={getStatusTone(task.status)} />
          <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
        </div>
      </div>
    </div>
  );
}

function ListSection({
  list,
  visibleTasks,
  totalTasks,
  doneCount,
  isFilteredView,
  allowReorder,
  draggedListId,
  draggedTaskId,
  editingListId,
  editingListName,
  onDragListStart,
  onDropList,
  onDragTaskStart,
  onDropTask,
  onStartEdit,
  onChangeEditName,
  onSaveEdit,
  onCancelEdit,
  onDeleteList,
  onCreateTask,
  onToggleDone,
  onOpenTask,
}) {
  const [isAddingTask, setIsAddingTask] = useState(false);
  const accent = list.color || C.accent;
  const activeCount = Math.max(totalTasks - doneCount, 0);
  const completion = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  return (
    <section
      className={`mytasks-workspace__section${draggedListId === list.id ? ' is-list-dragging' : ''}`}
      style={{ '--list-accent': accent }}
      onDragOver={event => allowReorder && event.preventDefault()}
      onDrop={event => {
        if (!allowReorder) return;
        event.preventDefault();
        if (draggedListId) {
          onDropList(draggedListId, list.id);
          return;
        }
        if (draggedTaskId) onDropTask(draggedTaskId, list.id, null);
      }}
    >
      <div className="mytasks-workspace__section-header">
        <div className="mytasks-workspace__section-title-group">
          <button
            type="button"
            draggable={allowReorder}
            onDragStart={() => allowReorder && onDragListStart(list.id)}
            onDragEnd={() => allowReorder && onDragListStart(null)}
            className="mytasks-workspace__handle"
            title={allowReorder ? '拖曳排序清單' : '目前篩選中，排序已暫停'}
          >
            ::
          </button>
          <div className="mytasks-workspace__section-title-wrap">
            <div className="mytasks-workspace__section-topline">
              <span className="mytasks-workspace__section-dot" />
              {editingListId === list.id ? (
                <input
                  value={editingListName}
                  onChange={event => onChangeEditName(event.target.value)}
                  onBlur={onSaveEdit}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onSaveEdit();
                    if (event.key === 'Escape') onCancelEdit();
                  }}
                  autoFocus
                  className="mytasks-workspace__section-input"
                />
              ) : (
                <span className="mytasks-workspace__section-title">{list.name}</span>
              )}
              <span className="mytasks-workspace__section-count">{visibleTasks.length}</span>
              {list.isSystem && <span className="mytasks-workspace__section-badge">系統</span>}
            </div>
            <div className="mytasks-workspace__section-subline">
              <span>{activeCount} 個進行中</span>
              <span>{doneCount} 個完成</span>
              {isFilteredView && <span>顯示 {visibleTasks.length} / {totalTasks}</span>}
            </div>
          </div>
        </div>

        <div className="mytasks-workspace__section-actions">
          {!list.isSystem && editingListId !== list.id && (
            <>
              <button type="button" onClick={() => onStartEdit(list)} className="mytasks-workspace__chip-button">
                重新命名
              </button>
              <button type="button" onClick={() => onDeleteList(list)} className="mytasks-workspace__chip-button danger">
                刪除
              </button>
            </>
          )}
          <button type="button" onClick={() => setIsAddingTask(value => !value)} className="mytasks-workspace__chip-button accent">
            新增任務
          </button>
        </div>
      </div>

      <div className="mytasks-workspace__section-progress">
        <div className="mytasks-workspace__section-progress-bar">
          <div className="mytasks-workspace__section-progress-fill" style={{ width: `${completion}%` }} />
        </div>
        <span>{completion}% 已完成</span>
      </div>

      {isAddingTask && (
        <div className="mytasks-workspace__section-composer">
          <InlineComposer
            placeholder={`新增到「${list.name}」`}
            submitLabel="建立任務"
            onSubmit={async title => {
              await onCreateTask(list.id, title);
              setIsAddingTask(false);
            }}
            onCancel={() => setIsAddingTask(false)}
          />
        </div>
      )}

      <div className="mytasks-workspace__section-body">
        {visibleTasks.length === 0 ? (
          <EmptyPanel
            title={isFilteredView ? '這個清單沒有符合條件的任務' : '這個清單還沒有任務'}
            description={isFilteredView ? '試著切換篩選條件，或清除搜尋關鍵字。' : '你可以直接新增一個任務，或把其他任務拖進來。'}
          />
        ) : (
          visibleTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              draggedTaskId={draggedTaskId}
              allowReorder={allowReorder}
              onDragTaskStart={onDragTaskStart}
              onDropTask={onDropTask}
              onToggleDone={onToggleDone}
              onOpen={onOpenTask}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BoardColumn({
  list,
  tasks,
  totalTasks,
  doneCount,
  draggedTaskId,
  draggedListId,
  allowReorder,
  onDragTaskStart,
  onDragListStart,
  onDropTask,
  onDropList,
  onCreateTask,
  onToggleDone,
  onOpenTask,
}) {
  const [isAddingTask, setIsAddingTask] = useState(false);
  const activeTasks = tasks.filter(task => !task.isDone);

  return (
    <div
      className={`mytasks-workspace__board-column${draggedListId === list.id ? ' is-list-dragging' : ''}`}
      style={{ '--list-accent': list.color || C.accent }}
      onDragOver={event => allowReorder && event.preventDefault()}
      onDrop={event => {
        if (!allowReorder) return;
        event.preventDefault();
        if (draggedListId) {
          onDropList(draggedListId, list.id);
          return;
        }
        if (draggedTaskId) onDropTask(draggedTaskId, list.id);
      }}
    >
      <div className="mytasks-workspace__board-header">
        <div className="mytasks-workspace__board-title">
          <button
            type="button"
            draggable={allowReorder}
            onDragStart={() => allowReorder && onDragListStart(list.id)}
            onDragEnd={() => allowReorder && onDragListStart(null)}
            className="mytasks-workspace__handle"
            title={allowReorder ? '拖曳排序清單' : '目前篩選中，排序已暫停'}
          >
            ::
          </button>
          <div>
            <div className="mytasks-workspace__board-name">{list.name}</div>
            <div className="mytasks-workspace__board-meta">
              {activeTasks.length} 進行中 / {doneCount} 完成 / {totalTasks} 全部
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setIsAddingTask(value => !value)} className="mytasks-workspace__chip-button accent">
          +
        </button>
      </div>

      <div className="mytasks-workspace__board-body">
        {isAddingTask && (
          <InlineComposer
            placeholder={`新增到「${list.name}」`}
            submitLabel="建立"
            onSubmit={async title => {
              await onCreateTask(list.id, title);
              setIsAddingTask(false);
            }}
            onCancel={() => setIsAddingTask(false)}
          />
        )}

        {tasks.length === 0 && !isAddingTask ? (
          <EmptyPanel
            title="目前沒有任務"
            description="可拖曳其他任務到這裡，或直接新增一個。"
          />
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              draggable={allowReorder}
              onDragStart={() => allowReorder && onDragTaskStart(task.id)}
              onDragEnd={() => allowReorder && onDragTaskStart(null)}
              onDragOver={event => allowReorder && event.preventDefault()}
              onDrop={event => {
                if (!allowReorder) return;
                event.preventDefault();
                if (draggedTaskId) onDropTask(draggedTaskId, list.id, task.id);
              }}
              onClick={() => onOpenTask(task)}
              className={`mytasks-workspace__board-card${task.isDone ? ' is-done' : ''}`}
            >
              <div className="mytasks-workspace__board-card-top">
                <TaskCheckbox
                  checked={task.isDone}
                  onClick={event => {
                    event.stopPropagation();
                    onToggleDone(task);
                  }}
                />
                <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
              </div>
              <div className="mytasks-workspace__board-card-title">{task.title}</div>
              <div className="mytasks-workspace__board-card-meta">
                <span style={{ color: isOverdue(task.dueDate) && !task.isDone ? C.red : C.gray500 }}>
                  {formatDueLabel(task.dueDate)}
                </span>
                {task.projectName && <span>{task.projectName}</span>}
              </div>
              <div className="mytasks-workspace__board-card-footer">
                <Tag label={getStatusLabel(task.status)} tone={getStatusTone(task.status)} />
                {task.assignee ? <Avatar name={task.assignee.name} size={24} /> : <span className="mytasks-workspace__muted">未指派</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CalendarView({ tasks, onOpenTask }) {
  const withDate = tasks.filter(task => task.dueDate);
  const withoutDate = tasks.filter(task => !task.dueDate);

  if (withDate.length === 0 && withoutDate.length === 0) {
    return (
      <EmptyPanel
        title="行事曆目前沒有資料"
        description="幫任務設定截止日後，這裡就會顯示成一條更清楚的時間軸。"
      />
    );
  }

  const grouped = {};
  sortTasksByUrgency(withDate).forEach(task => {
    if (!grouped[task.dueDate]) grouped[task.dueDate] = [];
    grouped[task.dueDate].push(task);
  });

  return (
    <div className="mytasks-workspace__calendar">
      {Object.keys(grouped).sort().map(date => (
        <section key={date} className="mytasks-workspace__day">
          <div className="mytasks-workspace__day-header">
            <div>
              <div className="mytasks-workspace__day-title">{formatDate(date)}</div>
              <div className="mytasks-workspace__day-subtitle">{formatDueLabel(date)}</div>
            </div>
            <span className="mytasks-workspace__section-count">{grouped[date].length}</span>
          </div>
          <div className="mytasks-workspace__day-list">
            {grouped[date].map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task)}
                className="mytasks-workspace__day-card"
              >
                <div className="mytasks-workspace__day-card-title">{task.title}</div>
                <div className="mytasks-workspace__day-card-meta">
                  <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
                  {task.projectName && <span>{task.projectName}</span>}
                  {task.assignee?.name && <span>{task.assignee.name}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {withoutDate.length > 0 && (
        <section className="mytasks-workspace__day">
          <div className="mytasks-workspace__day-header">
            <div>
              <div className="mytasks-workspace__day-title">未排程任務</div>
              <div className="mytasks-workspace__day-subtitle">建議補上截止日，排程才會更清楚</div>
            </div>
            <span className="mytasks-workspace__section-count">{withoutDate.length}</span>
          </div>
          <div className="mytasks-workspace__day-list">
            {withoutDate.map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task)}
                className="mytasks-workspace__day-card"
              >
                <div className="mytasks-workspace__day-card-title">{task.title}</div>
                <div className="mytasks-workspace__day-card-meta">
                  <Tag label={getStatusLabel(task.status)} tone={getStatusTone(task.status)} />
                  {task.projectName && <span>{task.projectName}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DashboardView({ tasks, allTasks, lists, files, onOpenTask }) {
  const total = tasks.length;
  const completed = tasks.filter(task => task.isDone).length;
  const overdue = tasks.filter(task => !task.isDone && isOverdue(task.dueDate)).length;
  const dueSoon = tasks.filter(task => !task.isDone && isDueSoon(task.dueDate)).length;
  const focusTasks = sortTasksByUrgency(tasks.filter(task => !task.isDone)).slice(0, 5);
  const groupedAll = groupTasksByList(lists, allTasks);

  return (
    <div className="mytasks-workspace__dashboard">
      <div className="mytasks-workspace__dashboard-grid">
        <HeroStat label="目前顯示" value={total} hint="符合目前篩選的任務數" tone={C.gray800} />
        <HeroStat label="已完成" value={completed} hint="已結案或已標記完成" tone={C.green} />
        <HeroStat label="即將到期" value={dueSoon} hint="七日內需要處理" tone={C.orange} />
        <HeroStat label="已逾期" value={overdue} hint="建議優先清理" tone={C.red} />
      </div>

      <div className="mytasks-workspace__dashboard-columns">
        <section className="mytasks-workspace__dashboard-panel">
          <div className="mytasks-workspace__panel-title">焦點任務</div>
          {focusTasks.length === 0 ? (
            <EmptyPanel
              title="目前沒有需要追的任務"
              description="現在的節奏很乾淨，沒有逾期或近期到期的工作。"
            />
          ) : (
            <div className="mytasks-workspace__focus-list">
              {focusTasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="mytasks-workspace__focus-card"
                >
                  <div className="mytasks-workspace__focus-card-top">
                    <div className="mytasks-workspace__focus-card-title">{task.title}</div>
                    <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
                  </div>
                  <div className="mytasks-workspace__focus-card-meta">
                    <span style={{ color: isOverdue(task.dueDate) ? C.red : C.gray600 }}>{formatDueLabel(task.dueDate)}</span>
                    {task.projectName && <span>{task.projectName}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mytasks-workspace__dashboard-panel">
          <div className="mytasks-workspace__panel-title">清單負載</div>
          <div className="mytasks-workspace__health-list">
            {lists.map(list => {
              const listTasks = groupedAll[list.id] || [];
              const listDone = listTasks.filter(task => task.isDone).length;
              const ratio = listTasks.length > 0 ? Math.round((listDone / listTasks.length) * 100) : 0;
              return (
                <div key={list.id} className="mytasks-workspace__health-row" style={{ '--list-accent': list.color || C.accent }}>
                  <div>
                    <div className="mytasks-workspace__health-name">{list.name}</div>
                    <div className="mytasks-workspace__health-subtitle">
                      {Math.max(listTasks.length - listDone, 0)} 進行中 / {listDone} 完成
                    </div>
                  </div>
                  <div className="mytasks-workspace__health-bar">
                    <div className="mytasks-workspace__health-fill" style={{ width: `${ratio}%` }} />
                  </div>
                  <div className="mytasks-workspace__health-ratio">{ratio}%</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mytasks-workspace__dashboard-panel">
          <div className="mytasks-workspace__panel-title">檔案快照</div>
          <div className="mytasks-workspace__file-summary">
            <div className="mytasks-workspace__file-summary-card">
              <span>我的檔案</span>
              <strong>{files.myFiles.length}</strong>
            </div>
            <div className="mytasks-workspace__file-summary-card">
              <span>任務附件</span>
              <strong>{files.attachments.length}</strong>
            </div>
            <div className="mytasks-workspace__file-summary-card">
              <span>可下載</span>
              <strong>{[...files.myFiles, ...files.attachments].filter(file => file.isAvailable).length}</strong>
            </div>
          </div>
          <div className="mytasks-workspace__dashboard-note">
            檔案中心已支援個人檔案與任務附件統整，直接在檔案頁可上傳、下載與刪除。
          </div>
        </section>
      </div>
    </div>
  );
}

function FileGroup({ title, items, emptyText, onDownload, onDelete }) {
  return (
    <section className="mytasks-workspace__file-section">
      <div className="mytasks-workspace__file-section-header">
        <div className="mytasks-workspace__panel-title">{title}</div>
        <span className="mytasks-workspace__section-count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <EmptyPanel title="這個區塊目前沒有檔案" description={emptyText} />
      ) : (
        <div className="mytasks-workspace__file-grid">
          {items.map(file => (
            <article key={`${file.source}-${file.id}`} className="mytasks-workspace__file-card">
              <div className="mytasks-workspace__file-card-top">
                <div>
                  <div className="mytasks-workspace__file-name">{file.name}</div>
                  <div className="mytasks-workspace__file-meta">
                    {formatFileSize(file.fileSizeBytes)} / {file.ext || file.mimeType || 'unknown'}
                  </div>
                </div>
                <Tag
                  label={file.isAvailable ? '可下載' : '缺少來源'}
                  tone={file.isAvailable ? { fg: '#166534', bg: '#F0FDF4', border: '#BBF7D0' } : { fg: '#991B1B', bg: '#FEF2F2', border: '#FECACA' }}
                />
              </div>

              {file.task && (
                <div className="mytasks-workspace__file-task">
                  來源任務：{file.task.title}
                </div>
              )}

              <div className="mytasks-workspace__file-footer">
                <div className="mytasks-workspace__file-date">
                  {file.createdAt ? new Date(file.createdAt).toLocaleString('zh-TW') : '未知時間'}
                </div>
                <div className="mytasks-workspace__file-actions">
                  <button type="button" onClick={() => onDownload(file)} className="mytasks-workspace__button mytasks-workspace__button--ghost">
                    下載
                  </button>
                  {onDelete && file.canDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(file)}
                      className="mytasks-workspace__button mytasks-workspace__button--ghost danger"
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FilesView({ files, loading, searchText, onUpload, onDownload, onDelete }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const total = files.myFiles.length + files.attachments.length;

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files || []);
    if (dropped.length > 0) onUpload(dropped);
  }

  return (
    <div className="mytasks-workspace__files">
      <section className="mytasks-workspace__files-hero">
        <div>
          <div className="mytasks-workspace__files-title">檔案中心</div>
          <div className="mytasks-workspace__files-copy">
            個人檔案與任務附件統整在同一個工作區，搜尋、上傳與管理都集中在這裡。
          </div>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} className="mytasks-workspace__button mytasks-workspace__button--light">
          上傳檔案
        </button>
      </section>

      <div className="mytasks-workspace__dashboard-grid">
        <HeroStat label="我的檔案" value={files.myFiles.length} hint="手動上傳到個人空間" tone={C.blue} />
        <HeroStat label="任務附件" value={files.attachments.length} hint="綁定在任務中的檔案" tone={C.orange} />
        <HeroStat label="可下載" value={[...files.myFiles, ...files.attachments].filter(file => file.isAvailable).length} hint="可直接取用的檔案" tone={C.green} />
        <HeroStat label="目前顯示" value={total} hint={searchText ? '已套用搜尋條件' : '包含所有檔案'} tone={C.gray800} />
      </div>

      <div
        className={`mytasks-workspace__dropzone${dragActive ? ' is-active' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="mytasks-workspace__dropzone-title">拖曳檔案到這裡，或點擊上方按鈕上傳</div>
        <div className="mytasks-workspace__dropzone-copy">
          支援多檔上傳；上傳後會立即出現在下方列表中。
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={event => {
          const selected = Array.from(event.target.files || []);
          if (selected.length > 0) onUpload(selected);
          event.target.value = '';
        }}
      />

      {loading ? (
        <LoadingPanel label="載入檔案中..." />
      ) : total === 0 ? (
        <EmptyPanel
          title={searchText ? '找不到符合搜尋條件的檔案' : '目前還沒有檔案'}
          description={searchText ? '試著清除搜尋條件，或上傳新的檔案。' : '上傳後這裡會立刻顯示你的個人檔案與任務附件。'}
        />
      ) : (
        <>
          <FileGroup
            title="我的檔案"
            items={files.myFiles}
            emptyText="你還沒有上傳任何個人檔案。"
            onDownload={onDownload}
            onDelete={onDelete}
          />
          <FileGroup
            title="任務附件"
            items={files.attachments}
            emptyText="目前沒有任務附件。"
            onDownload={onDownload}
            onDelete={null}
          />
        </>
      )}
    </div>
  );
}

function Field({ label, children, span = 1 }) {
  return (
    <label className="mytasks-workspace__field" style={{ gridColumn: `span ${span}` }}>
      <span className="mytasks-workspace__field-label">{label}</span>
      {children}
    </label>
  );
}

function TaskPanel({
  task,
  lists,
  projects,
  attachments,
  loadingAttachments,
  onUploadAttachments,
  onDownloadAttachment,
  onDeleteAttachment,
  onClose,
  onSave,
  onDelete,
}) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const attachmentInputRef = useRef(null);

  useEffect(() => {
    setDraft(task);
  }, [task]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        title: draft.title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate || null,
        dueTime: draft.dueTime || null,
        dueEndTime: draft.dueEndTime || null,
        listId: draft.listId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mytasks-workspace__drawer-overlay" onClick={onClose} />
      <aside className="mytasks-workspace__drawer">
        <div className="mytasks-workspace__drawer-header">
          <div>
            <div className="mytasks-workspace__drawer-eyebrow">任務詳情</div>
            <div className="mytasks-workspace__drawer-title">{task.title}</div>
          </div>
          <button type="button" onClick={onClose} className="mytasks-workspace__chip-button">
            關閉
          </button>
        </div>

        <div className="mytasks-workspace__drawer-tags">
          <Tag label={getStatusLabel(task.status)} tone={getStatusTone(task.status)} />
          <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
          <Tag
            label={task.dueDate ? `${formatDueLabel(task.dueDate)} · ${formatDate(task.dueDate)}` : '未設定截止日'}
            tone={{ fg: C.gray700, bg: C.gray50, border: C.gray200 }}
          />
        </div>

        <div className="mytasks-workspace__drawer-body">
          <div className="mytasks-workspace__field-grid">
            <Field label="標題" span={2}>
              <input
                value={draft.title || ''}
                onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                className="mytasks-workspace__input"
              />
            </Field>

            <Field label="清單">
              <select
                value={draft.listId || ''}
                onChange={event => setDraft(prev => ({ ...prev, listId: Number(event.target.value) }))}
                className="mytasks-workspace__input"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="狀態">
              <select
                value={draft.status || 'todo'}
                onChange={event => setDraft(prev => ({ ...prev, status: event.target.value }))}
                className="mytasks-workspace__input"
              >
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="優先級">
              <select
                value={draft.priority || 'medium'}
                onChange={event => setDraft(prev => ({ ...prev, priority: event.target.value }))}
                className="mytasks-workspace__input"
              >
                {PRIORITY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="截止日">
              <input
                type="date"
                value={normalizeDateInput(draft.dueDate)}
                onChange={event => setDraft(prev => ({ ...prev, dueDate: event.target.value || null }))}
                className="mytasks-workspace__input"
              />
            </Field>

            <Field label="專案">
              <div className="mytasks-workspace__readonly">
                {draft.projectName || projects.find(project => project.id === draft.projectId)?.name || '未設定專案'}
              </div>
            </Field>

            <Field label="負責人">
              <div className="mytasks-workspace__readonly">
                {draft.assignee ? (
                  <>
                    <Avatar name={draft.assignee.name} size={28} />
                    <span>{draft.assignee.name}</span>
                  </>
                ) : (
                  '未指派'
                )}
              </div>
            </Field>

            <Field label="說明" span={2}>
              <textarea
                value={draft.description || ''}
                onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))}
                rows={6}
                className="mytasks-workspace__input mytasks-workspace__textarea"
              />
            </Field>
          </div>

          <section className="mytasks-workspace__attachments">
            <div className="mytasks-workspace__attachments-header">
              <div>
                <div className="mytasks-workspace__panel-title">任務附件</div>
                <div className="mytasks-workspace__attachments-copy">
                  {loadingAttachments ? '附件載入中...' : `目前共有 ${attachments.length} 份附件`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={uploadingAttachments}
                className="mytasks-workspace__button"
              >
                {uploadingAttachments ? '上傳中...' : '新增附件'}
              </button>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                hidden
                onChange={async event => {
                  const selectedFiles = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (selectedFiles.length === 0) return;

                  setUploadingAttachments(true);
                  try {
                    await onUploadAttachments(task.id, selectedFiles);
                  } finally {
                    setUploadingAttachments(false);
                  }
                }}
              />
            </div>

            {loadingAttachments ? (
              <LoadingPanel label="同步附件中..." />
            ) : attachments.length === 0 ? (
              <EmptyPanel
                title="目前沒有附件"
                description="你可以直接把檔案掛在這個任務上，後續整理會更清楚。"
              />
            ) : (
              <div className="mytasks-workspace__attachments-list">
                {attachments.map(file => (
                  <div key={file.id} className="mytasks-workspace__attachment-row">
                    <div>
                      <div className="mytasks-workspace__attachment-name">{file.name}</div>
                      <div className="mytasks-workspace__attachment-meta">
                        {formatFileSize(file.fileSizeBytes)}{file.uploadedBy?.name ? ` / ${file.uploadedBy.name}` : ''}
                      </div>
                    </div>
                    <div className="mytasks-workspace__file-actions">
                      <button
                        type="button"
                        onClick={() => onDownloadAttachment(file)}
                        className="mytasks-workspace__button mytasks-workspace__button--ghost"
                      >
                        下載
                      </button>
                      {file.canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteAttachment(file)}
                          className="mytasks-workspace__button mytasks-workspace__button--ghost danger"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mytasks-workspace__drawer-footer">
          <button type="button" onClick={handleSave} disabled={saving} className="mytasks-workspace__button">
            {saving ? '儲存中...' : '儲存變更'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            className="mytasks-workspace__button mytasks-workspace__button--ghost danger"
          >
            刪除任務
          </button>
        </div>
      </aside>
    </>
  );
}

export default function MyTasksWorkspacePage() {
  const isMobile = useIsMobile();
  const { user, token, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('list');
  const [lists, setLists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState({ myFiles: [], attachments: [] });
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingTaskAttachments, setLoadingTaskAttachments] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newListMode, setNewListMode] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [editingListName, setEditingListName] = useState('');
  const [draggedListId, setDraggedListId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskAttachments, setTaskAttachments] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');

  const deferredSearch = useDeferredValue(searchText.trim().toLowerCase());
  const selectedTask = tasks.find(task => task.id === selectedTaskId) || null;
  const isFilteredView = Boolean(deferredSearch) || quickFilter !== 'all';
  const allowReorder = !isFilteredView;

  const filteredTasks = tasks.filter(task => {
    if (!matchesQuickFilter(task, quickFilter)) return false;
    if (!deferredSearch) return true;
    return buildTaskSearchText(task).includes(deferredSearch);
  });

  const filteredFiles = {
    myFiles: files.myFiles.filter(file => {
      if (!deferredSearch) return true;
      return `${file.name} ${file.ext} ${file.mimeType}`.toLowerCase().includes(deferredSearch);
    }),
    attachments: files.attachments.filter(file => {
      if (!deferredSearch) return true;
      return `${file.name} ${file.task?.title || ''} ${file.mimeType}`.toLowerCase().includes(deferredSearch);
    }),
  };

  const groupedVisibleTasks = groupTasksByList(lists, filteredTasks);
  const groupedAllTasks = groupTasksByList(lists, tasks);
  const activeTasks = tasks.filter(task => !task.isDone);
  const visibleActiveTasks = filteredTasks.filter(task => !task.isDone);
  const focusTasks = sortTasksByUrgency(visibleActiveTasks).slice(0, 4);

  const quickFilterCounts = {
    all: activeTasks.length,
    today: activeTasks.filter(task => isToday(task.dueDate)).length,
    due_soon: activeTasks.filter(task => isDueSoon(task.dueDate)).length,
    overdue: activeTasks.filter(task => isOverdue(task.dueDate)).length,
    done: tasks.filter(task => task.isDone).length,
  };

  const tabCounts = {
    list: filteredTasks.length,
    board: filteredTasks.length,
    calendar: filteredTasks.filter(task => task.dueDate).length,
    dashboard: filteredTasks.length,
    files: filteredFiles.myFiles.length + filteredFiles.attachments.length,
  };

  async function requestJson(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body
        ? (isFormData ? options.body : JSON.stringify(options.body))
        : undefined,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function setFlash(kind, text) {
    if (kind === 'error') {
      setError(text);
      setMessage('');
      return;
    }
    setMessage(text);
    setError('');
  }

  async function loadOverview() {
    if (!token || !user) return;

    setLoadingOverview(true);
    try {
      const payload = await requestJson('/api/my-tasks/overview');
      setLists(payload.data?.lists || []);
      setTasks(payload.data?.tasks || []);
      setProjects(payload.data?.projects || []);
      setError('');
    } catch (fetchError) {
      setFlash('error', fetchError.message);
    } finally {
      setLoadingOverview(false);
    }
  }

  async function loadFiles() {
    if (!token || !user) return;

    setLoadingFiles(true);
    try {
      const payload = await requestJson('/api/my-tasks/files');
      setFiles({
        myFiles: payload.data?.myFiles || [],
        attachments: payload.data?.attachments || [],
      });
      setError('');
    } catch (fetchError) {
      setFlash('error', fetchError.message);
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    if (authLoading || !token || !user) return;
    loadOverview();
    loadFiles();
  }, [authLoading, token, user]);

  useEffect(() => {
    if (activeTab === 'files' && token && user) loadFiles();
  }, [activeTab, token, user]);

  useEffect(() => {
    if (!selectedTaskId || !token || !user) {
      setTaskAttachments([]);
      return;
    }

    let alive = true;

    async function fetchAttachments() {
      setLoadingTaskAttachments(true);
      try {
        const payload = await requestJson(`/api/my-tasks/tasks/${selectedTaskId}/attachments`);
        if (alive) {
          setTaskAttachments(payload.data || []);
          setError('');
        }
      } catch (fetchError) {
        if (alive) {
          setTaskAttachments([]);
          setFlash('error', fetchError.message);
        }
      } finally {
        if (alive) setLoadingTaskAttachments(false);
      }
    }

    fetchAttachments();

    return () => {
      alive = false;
    };
  }, [selectedTaskId, token, user]);

  async function createList(name) {
    try {
      const payload = await requestJson('/api/my-tasks/lists', {
        method: 'POST',
        body: { name, color: C.accent },
      });
      setLists(prev => [...prev, payload.data].sort((a, b) => a.position - b.position));
      setFlash('message', `已建立清單「${payload.data.name}」`);
    } catch (createError) {
      setFlash('error', createError.message);
      throw createError;
    }
  }

  async function renameList(listId, name) {
    if (!name.trim()) {
      setEditingListId(null);
      return;
    }

    try {
      const payload = await requestJson(`/api/my-tasks/lists/${listId}`, {
        method: 'PATCH',
        body: { name },
      });
      setLists(prev => prev.map(item => (item.id === listId ? payload.data : item)));
      setFlash('message', '清單名稱已更新');
    } catch (updateError) {
      setFlash('error', updateError.message);
    } finally {
      setEditingListId(null);
      setEditingListName('');
    }
  }

  async function deleteList(list) {
    if (!window.confirm(`確定要刪除清單「${list.name}」嗎？任務不會被刪掉，會回到系統清單。`)) return;

    try {
      await requestJson(`/api/my-tasks/lists/${list.id}`, { method: 'DELETE' });
      await loadOverview();
      setFlash('message', `已刪除清單「${list.name}」`);
    } catch (deleteError) {
      setFlash('error', deleteError.message);
    }
  }

  async function reorderLists(draggedId, targetId) {
    if (!allowReorder) {
      setFlash('error', '套用搜尋或篩選時，為避免排序錯亂，暫時不能拖曳清單。');
      setDraggedListId(null);
      return;
    }

    if (!draggedId || !targetId || draggedId === targetId) {
      setDraggedListId(null);
      return;
    }

    const previousLists = lists;
    const reorderedLists = reorderItemsById(lists, draggedId, targetId);
    setLists(reorderedLists);

    try {
      const payload = await requestJson('/api/my-tasks/lists/reorder', {
        method: 'PATCH',
        body: { orderedListIds: reorderedLists.map(list => list.id) },
      });
      setLists(payload.data || reorderedLists);
      setFlash('message', '清單排序已儲存');
    } catch (reorderError) {
      setLists(previousLists);
      setFlash('error', reorderError.message);
    } finally {
      setDraggedListId(null);
    }
  }

  async function createTask(listId, title, overrides = {}) {
    if (!lists.length) {
      setFlash('error', '尚未取得可用清單，請先重新整理頁面。');
      return;
    }

    try {
      const payload = await requestJson('/api/my-tasks/tasks', {
        method: 'POST',
        body: {
          title,
          listId,
          projectId: overrides.projectId || projects[0]?.id || null,
          dueDate: overrides.dueDate || null,
        },
      });
      setTasks(prev => [...prev, payload.data]);
      setFlash('message', `已建立任務「${payload.data.title}」`);
    } catch (createError) {
      setFlash('error', createError.message);
      throw createError;
    }
  }

  async function patchTask(taskId, body, successMessage = '任務已更新') {
    const payload = await requestJson(`/api/my-tasks/tasks/${taskId}`, {
      method: 'PATCH',
      body,
    });
    setTasks(prev => prev.map(task => (task.id === taskId ? payload.data : task)));
    setFlash('message', successMessage);
    return payload.data;
  }

  async function toggleTaskDone(task) {
    try {
      await patchTask(
        task.id,
        { status: task.isDone ? 'todo' : 'done' },
        task.isDone ? '任務已恢復為待辦' : '任務已標記完成',
      );
    } catch (toggleError) {
      setFlash('error', toggleError.message);
    }
  }

  async function persistTaskOrder(listId, orderedTaskIds) {
    if (!listId || !orderedTaskIds.length) return;

    await requestJson(`/api/my-tasks/lists/${listId}/tasks/reorder`, {
      method: 'PATCH',
      body: { orderedTaskIds },
    });
  }

  async function handleDropTask(draggedId, targetListId, targetTaskId = null) {
    if (!allowReorder) {
      setFlash('error', '套用搜尋或篩選時，為避免排序錯亂，暫時不能拖曳任務。');
      setDraggedTaskId(null);
      return;
    }

    if (!draggedId || !targetListId || draggedId === targetTaskId) {
      setDraggedTaskId(null);
      return;
    }

    const draggedTask = tasks.find(task => task.id === draggedId);
    if (!draggedTask) {
      setDraggedTaskId(null);
      return;
    }

    const previousTasks = tasks;
    const reordered = reorderTasksForDrop(lists, tasks, draggedId, targetListId, targetTaskId);
    if (!reordered.sourceListId) {
      setDraggedTaskId(null);
      return;
    }

    setTasks(reordered.tasks);

    try {
      if (reordered.sourceListId !== targetListId) {
        await requestJson(`/api/my-tasks/tasks/${draggedId}`, {
          method: 'PATCH',
          body: { listId: targetListId },
        });
      }

      const grouped = groupTasksByList(lists, reordered.tasks);
      await persistTaskOrder(targetListId, (grouped[targetListId] || []).map(task => task.id));

      if (reordered.sourceListId !== targetListId) {
        const sourceOrderedTaskIds = (grouped[reordered.sourceListId] || []).map(task => task.id);
        if (sourceOrderedTaskIds.length > 0) {
          await persistTaskOrder(reordered.sourceListId, sourceOrderedTaskIds);
        }
      }

      await loadOverview();
      setFlash('message', reordered.sourceListId === targetListId ? '任務排序已儲存' : '任務已移動並更新排序');
    } catch (moveError) {
      setTasks(previousTasks);
      setFlash('error', moveError.message);
    } finally {
      setDraggedTaskId(null);
    }
  }

  async function saveTask(task, body) {
    try {
      const updated = await patchTask(task.id, body);
      setSelectedTaskId(updated.id);
    } catch (saveError) {
      setFlash('error', saveError.message);
      throw saveError;
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`確定要刪除任務「${task.title}」嗎？`)) return;

    try {
      await requestJson(`/api/my-tasks/tasks/${task.id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(item => item.id !== task.id));
      setSelectedTaskId(null);
      setFlash('message', `已刪除任務「${task.title}」`);
    } catch (deleteError) {
      setFlash('error', deleteError.message);
    }
  }

  async function uploadFiles(selectedFiles) {
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));

    try {
      await requestJson('/api/my-tasks/files/upload', {
        method: 'POST',
        body: formData,
      });
      await loadFiles();
      setFlash('message', `已上傳 ${selectedFiles.length} 個檔案`);
    } catch (uploadError) {
      setFlash('error', uploadError.message);
    }
  }

  async function uploadTaskAttachments(taskId, selectedFiles) {
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));

    try {
      await requestJson(`/api/my-tasks/tasks/${taskId}/attachments/upload`, {
        method: 'POST',
        body: formData,
      });
      const [attachmentPayload] = await Promise.all([
        requestJson(`/api/my-tasks/tasks/${taskId}/attachments`),
        loadFiles(),
      ]);
      setTaskAttachments(attachmentPayload.data || []);
      setFlash('message', `已將 ${selectedFiles.length} 個附件掛到任務`);
    } catch (uploadError) {
      setFlash('error', uploadError.message);
      throw uploadError;
    }
  }

  async function downloadFile(file) {
    try {
      const response = await fetch(file.downloadUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || '下載失敗');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setFlash('error', downloadError.message);
    }
  }

  async function deleteFile(file) {
    if (!window.confirm(`確定要刪除檔案「${file.name}」嗎？`)) return;

    try {
      await requestJson(`/api/my-tasks/files/${file.id}?source=${file.source || 'my_file'}`, { method: 'DELETE' });
      await loadFiles();
      if (file.source === 'attachment' && selectedTaskId && (!file.task || file.task.id === selectedTaskId)) {
        const payload = await requestJson(`/api/my-tasks/tasks/${selectedTaskId}/attachments`);
        setTaskAttachments(payload.data || []);
      }
      setFlash('message', '檔案已刪除');
    } catch (deleteError) {
      setFlash('error', deleteError.message);
    }
  }

  async function refreshAll() {
    if (!token || !user) return;
    await Promise.all([loadOverview(), loadFiles()]);
    setFlash('message', '資料已重新整理');
  }

  if (authLoading) {
    return (
      <div className="mytasks-workspace">
        <div className="mytasks-workspace__shell">
          <LoadingPanel label="正在確認登入狀態..." />
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="mytasks-workspace">
        <div className="mytasks-workspace__shell">
          <EmptyPanel
            title="請先登入後再使用我的任務"
            description="登入後就能看到自己的清單、看板、行事曆與檔案中心。"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mytasks-workspace">
      <div className="mytasks-workspace__shell">
        <section className="mytasks-workspace__hero">
          <div className="mytasks-workspace__hero-main">
            <div className="mytasks-workspace__hero-badge">
              <span className="mytasks-workspace__hero-badge-dot" />
              我的工作台
            </div>
            <div className="mytasks-workspace__hero-title-row">
              <Avatar name={user?.name || 'XC'} size={40} />
              <div>
                <h1 className="mytasks-workspace__hero-title">我的任務</h1>
                <p className="mytasks-workspace__hero-copy">
                  把今天需要推進的任務、檔案與附件收在同一個地方。少一點切換，多一點進度。
                </p>
              </div>
            </div>

            <div className="mytasks-workspace__hero-summary">
              <span>目前共 {tasks.length} 個任務</span>
              <span>{activeTasks.length} 個進行中</span>
              <span>{tasks.filter(task => task.isDone).length} 個完成</span>
              {isFilteredView && <span>已套用搜尋或焦點篩選</span>}
            </div>

            <div className="mytasks-workspace__hero-focus">
              <div className="mytasks-workspace__panel-title">今天的焦點</div>
              {focusTasks.length === 0 ? (
                <div className="mytasks-workspace__hero-empty">
                  目前沒有急件，今天可以照節奏往前推進。
                </div>
              ) : (
                <div className="mytasks-workspace__hero-focus-list">
                  {focusTasks.map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => startTransition(() => setSelectedTaskId(task.id))}
                      className="mytasks-workspace__hero-focus-card"
                    >
                      <div className="mytasks-workspace__hero-focus-top">
                        <div className="mytasks-workspace__hero-focus-title">{task.title}</div>
                        <Tag label={getPriorityLabel(task.priority)} tone={getPriorityTone(task.priority)} />
                      </div>
                      <div className="mytasks-workspace__hero-focus-meta">
                        <span style={{ color: isOverdue(task.dueDate) ? C.red : C.gray600 }}>{formatDueLabel(task.dueDate)}</span>
                        {task.projectName && <span>{task.projectName}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mytasks-workspace__hero-side">
            <div className="mytasks-workspace__stats-grid">
              <HeroStat label="待處理" value={activeTasks.length} hint="尚未完成的任務" tone={C.gray800} />
              <HeroStat label="今天" value={quickFilterCounts.today} hint="今天到期的工作" tone={C.accent} />
              <HeroStat label="七日內" value={quickFilterCounts.due_soon} hint="需要提前排程" tone={C.orange} />
              <HeroStat label="逾期" value={quickFilterCounts.overdue} hint="建議優先處理" tone={C.red} />
            </div>
          </div>
        </section>

        <section className="mytasks-workspace__toolbar">
          <div className="mytasks-workspace__tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => startTransition(() => setActiveTab(tab.key))}
                className={`mytasks-workspace__tab${activeTab === tab.key ? ' is-active' : ''}`}
              >
                <span>{tab.label}</span>
                <span className="mytasks-workspace__tab-count">{tabCounts[tab.key]}</span>
              </button>
            ))}
          </div>

          <div className="mytasks-workspace__toolbar-row">
            <div className="mytasks-workspace__search-wrap">
              <input
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                placeholder={activeTab === 'files' ? '搜尋檔名、附件來源' : '搜尋任務、專案、負責人'}
                className="mytasks-workspace__search"
              />
              {searchText && (
                <button type="button" onClick={() => setSearchText('')} className="mytasks-workspace__search-clear">
                  清除
                </button>
              )}
            </div>

            <div className="mytasks-workspace__toolbar-actions">
              <button type="button" onClick={() => setNewListMode(value => !value)} className="mytasks-workspace__button mytasks-workspace__button--ghost">
                新增清單
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultList = lists[0];
                  if (!defaultList) {
                    setFlash('error', '目前沒有可用清單，請先建立清單或重新整理資料。');
                    return;
                  }
                  createTask(defaultList.id, '未命名任務').catch(() => {});
                }}
                className="mytasks-workspace__button"
              >
                快速新增任務
              </button>
              <button type="button" onClick={() => refreshAll().catch(() => {})} className="mytasks-workspace__button mytasks-workspace__button--ghost">
                重新整理
              </button>
            </div>
          </div>

          {activeTab !== 'files' && (
            <div className="mytasks-workspace__filters">
              {QUICK_FILTERS.map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setQuickFilter(filter.key)}
                  className={`mytasks-workspace__filter${quickFilter === filter.key ? ' is-active' : ''}`}
                >
                  <span>{filter.label}</span>
                  <span className="mytasks-workspace__filter-count">{quickFilterCounts[filter.key]}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {(message || error || newListMode || (isFilteredView && (activeTab === 'list' || activeTab === 'board'))) && (
          <section className="mytasks-workspace__alerts">
            {message && (
              <div className="mytasks-workspace__flash is-success">
                {message}
              </div>
            )}
            {error && (
              <div className="mytasks-workspace__flash is-error">
                {error}
              </div>
            )}
            {newListMode && (
              <InlineComposer
                placeholder="輸入新清單名稱"
                submitLabel="建立清單"
                onSubmit={async name => {
                  await createList(name);
                  setNewListMode(false);
                }}
                onCancel={() => setNewListMode(false)}
              />
            )}
            {isFilteredView && (activeTab === 'list' || activeTab === 'board') && (
              <div className="mytasks-workspace__hint">
                已套用搜尋或焦點篩選。為了避免被隱藏的任務排序錯亂，這個狀態下暫停拖曳排序。
              </div>
            )}
          </section>
        )}

        <section className="mytasks-workspace__body">
          {loadingOverview && activeTab !== 'files' ? (
            <LoadingPanel label="載入我的任務中..." />
          ) : activeTab === 'list' ? (
            <div className="mytasks-workspace__section-stack">
              {lists.map(list => (
                <ListSection
                  key={list.id}
                  list={list}
                  visibleTasks={groupedVisibleTasks[list.id] || []}
                  totalTasks={(groupedAllTasks[list.id] || []).length}
                  doneCount={(groupedAllTasks[list.id] || []).filter(task => task.isDone).length}
                  isFilteredView={isFilteredView}
                  allowReorder={allowReorder}
                  draggedListId={draggedListId}
                  draggedTaskId={draggedTaskId}
                  editingListId={editingListId}
                  editingListName={editingListName}
                  onDragListStart={listId => {
                    setDraggedTaskId(null);
                    setDraggedListId(listId);
                  }}
                  onDropList={reorderLists}
                  onDragTaskStart={taskId => {
                    setDraggedListId(null);
                    setDraggedTaskId(taskId);
                  }}
                  onDropTask={handleDropTask}
                  onStartEdit={listItem => {
                    setEditingListId(listItem.id);
                    setEditingListName(listItem.name);
                  }}
                  onChangeEditName={setEditingListName}
                  onSaveEdit={() => renameList(list.id, editingListName)}
                  onCancelEdit={() => {
                    setEditingListId(null);
                    setEditingListName('');
                  }}
                  onDeleteList={deleteList}
                  onCreateTask={createTask}
                  onToggleDone={toggleTaskDone}
                  onOpenTask={task => startTransition(() => setSelectedTaskId(task.id))}
                />
              ))}
              {filteredTasks.length === 0 && (
                <EmptyPanel
                  title="目前沒有符合條件的任務"
                  description="試著清除搜尋字詞、切換焦點篩選，或直接建立一個新任務。"
                />
              )}
            </div>
          ) : activeTab === 'board' ? (
            <div className="mytasks-workspace__board">
              {lists.map(list => (
                <BoardColumn
                  key={list.id}
                  list={list}
                  tasks={groupedVisibleTasks[list.id] || []}
                  totalTasks={(groupedAllTasks[list.id] || []).length}
                  doneCount={(groupedAllTasks[list.id] || []).filter(task => task.isDone).length}
                  draggedTaskId={draggedTaskId}
                  draggedListId={draggedListId}
                  allowReorder={allowReorder}
                  onDragTaskStart={taskId => {
                    setDraggedListId(null);
                    setDraggedTaskId(taskId);
                  }}
                  onDragListStart={listId => {
                    setDraggedTaskId(null);
                    setDraggedListId(listId);
                  }}
                  onDropTask={handleDropTask}
                  onDropList={reorderLists}
                  onCreateTask={createTask}
                  onToggleDone={toggleTaskDone}
                  onOpenTask={task => startTransition(() => setSelectedTaskId(task.id))}
                />
              ))}
            </div>
          ) : activeTab === 'calendar' ? (
            <CalendarView
              tasks={filteredTasks}
              onOpenTask={task => startTransition(() => setSelectedTaskId(task.id))}
            />
          ) : activeTab === 'dashboard' ? (
            <DashboardView
              tasks={filteredTasks}
              allTasks={tasks}
              lists={lists}
              files={files}
              onOpenTask={task => startTransition(() => setSelectedTaskId(task.id))}
            />
          ) : (
            <FilesView
              files={filteredFiles}
              loading={loadingFiles}
              searchText={searchText}
              onUpload={uploadFiles}
              onDownload={downloadFile}
              onDelete={deleteFile}
            />
          )}
        </section>
      </div>

      {selectedTask && (
        <TaskPanel
          task={selectedTask}
          lists={lists}
          projects={projects}
          attachments={taskAttachments}
          loadingAttachments={loadingTaskAttachments}
          onUploadAttachments={uploadTaskAttachments}
          onDownloadAttachment={downloadFile}
          onDeleteAttachment={deleteFile}
          onClose={() => setSelectedTaskId(null)}
          onSave={body => saveTask(selectedTask, body)}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}
