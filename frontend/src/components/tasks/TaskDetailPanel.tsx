import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

type EntityId = string | number;

type CustomFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'multi_select'
  | 'people';

type CustomFieldPrimitive = string | number | null;
type CustomFieldStoredValue = CustomFieldPrimitive | string[] | number[];

export interface TaskPanelMember {
  id: EntityId;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface TaskPanelProject {
  id: EntityId;
  name: string;
  color?: string | null;
}

export interface TaskCustomFieldOption {
  id?: EntityId;
  label: string;
  value: string;
  color?: string | null;
}

export interface TaskCustomFieldDefinition {
  id: EntityId;
  name: string;
  type: CustomFieldType;
  placeholder?: string;
  description?: string;
  unit?: string;
  options?: TaskCustomFieldOption[];
}

export interface TaskSubtaskNode {
  id: EntityId;
  title: string;
  completed?: boolean;
  dueDate?: string | null;
  progressPercent?: number | null;
  assignee?: TaskPanelMember | null;
  children?: TaskSubtaskNode[];
}

export interface TaskActivityMention {
  id: EntityId;
  name: string;
}

export interface TaskActivityItem {
  id: EntityId;
  type: 'comment' | 'history';
  actor: TaskPanelMember;
  createdAt: string;
  text: string;
  mentions?: TaskActivityMention[];
  meta?: string[];
}

export interface TaskDetailRecord {
  id: EntityId;
  title: string;
  status?: string | null;
  assignee?: TaskPanelMember | null;
  dueDate?: string | null;
  projects: TaskPanelProject[];
  customFieldValues?: Record<string, CustomFieldStoredValue | undefined>;
  subtasks?: TaskSubtaskNode[];
  activity?: TaskActivityItem[];
}

export interface TaskDetailSavePayload {
  title: string;
  assigneeId: EntityId | null;
  dueDate: string | null;
  projectIds: EntityId[];
  customFieldValues: Record<string, CustomFieldStoredValue | undefined>;
}

export interface TaskCommentCreatePayload {
  content: string;
  parentId?: EntityId | null;
}

export interface TaskDependencyItem {
  id: EntityId;
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish';
  taskId: EntityId;
  dependsOnTaskId: EntityId;
  dependsOnTask?: { id: EntityId; title: string } | null;
  task?: { id: EntityId; title: string } | null;
}

export interface TaskDetailPanelProps {
  open: boolean;
  task: TaskDetailRecord | null;
  members: TaskPanelMember[];
  availableProjects: TaskPanelProject[];
  customFields: TaskCustomFieldDefinition[];
  lockedProjectIds?: EntityId[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: TaskDetailSavePayload) => Promise<void> | void;
  onDelete?: (taskId: EntityId) => Promise<void> | void;
  onQuickAddSubtask?: (input: {
    parentTaskId: EntityId;
    title: string;
  }) => Promise<void> | void;
  onAddComment?: (input: TaskCommentCreatePayload) => Promise<void> | void;
  commentSaving?: boolean;
  commentError?: string | null;
  onToggleSubtask?: (input: {
    subtaskId: EntityId;
    completed: boolean;
  }) => Promise<void> | void;
  // ── Asana-style features ──────────────────────────────────────────
  isSubscribed?: boolean;
  subscriberCount?: number;
  onSubscribe?: (taskId: EntityId) => Promise<void> | void;
  onUnsubscribe?: (taskId: EntityId) => Promise<void> | void;
  dependencies?: TaskDependencyItem[];
  onAddDependency?: (input: { taskId: EntityId; dependsOnTaskId: EntityId; type: string }) => Promise<void> | void;
  onRemoveDependency?: (depId: EntityId) => Promise<void> | void;
  allTasks?: { id: EntityId; title: string }[];
}

const BRAND = {
  crimson: 'var(--xc-brand)',
  crimsonDeep: 'var(--xc-brand-dark)',
  ink: 'var(--xc-text)',
  carbon: 'var(--xc-text-soft)',
  paper: 'var(--xc-bg)',
  surface: 'var(--xc-surface)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  mist: 'var(--xc-border)',
  line: 'var(--xc-border-strong)',
  white: 'var(--xc-surface-strong)',
  success: 'var(--xc-success)',
  successSoft: 'var(--xc-success-soft)',
  warning: 'var(--xc-warning)',
  warningSoft: 'var(--xc-warning-soft)',
  dangerSoft: 'var(--xc-danger-soft)',
  infoSoft: 'var(--xc-info-soft)',
  muted: 'var(--xc-text-muted)',
};

const STATUS_TONES: Record<string, { label: string; bg: string; color: string }> = {
  todo: { label: '待辦', bg: '#EEE7E2', color: '#6B6461' },
  in_progress: { label: '進行中', bg: '#F8D8DD', color: '#8F0013' },
  review: { label: '審核中', bg: '#F5E2CE', color: '#B35810' },
  done: { label: '已完成', bg: '#DDF2E4', color: '#16824B' },
  completed: { label: '已完成', bg: '#DDF2E4', color: '#16824B' },
};

const shellStyle = {
  border: `1px solid ${BRAND.line}`,
  borderRadius: 14,
  background: BRAND.white,
  color: BRAND.ink,
  width: '100%',
  boxSizing: 'border-box' as const,
};

const inputStyle = {
  ...shellStyle,
  minHeight: 42,
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
};

function toKey(id: EntityId) {
  return String(id);
}

function getAvatarHue(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) % 360;
  }
  return hash;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join('') || '?';
}

function formatDateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHumanDate(value?: string | null) {
  if (!value) return '未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未設定';

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function flattenSubtasks(nodes: TaskSubtaskNode[]) {
  return nodes.flatMap((node) => [node, ...flattenSubtasks(node.children || [])]);
}

function getSubtaskStats(nodes: TaskSubtaskNode[]) {
  const flattened = flattenSubtasks(nodes);
  const total = flattened.length;
  const completed = flattened.filter((node) => node.completed).length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, progress };
}

function normalizeFieldValue(
  type: CustomFieldType,
  value: TaskCustomFieldValueMap[string]
): TaskCustomFieldValueMap[string] {
  if (type === 'multi_select' || type === 'people') {
    if (Array.isArray(value)) return value;
    return [];
  }

  if (type === 'number') {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return value ?? '';
}

type TaskCustomFieldValueMap = Record<string, CustomFieldStoredValue | undefined>;

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: BRAND.muted,
        }}
      >
        {kicker}
      </div>
      <h3
        style={{
          margin: '6px 0 14px',
          fontSize: 18,
          fontWeight: 800,
          color: BRAND.ink,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Avatar({
  user,
  size = 32,
}: {
  user: TaskPanelMember;
  size?: number;
}) {
  const bg = `hsl(${getAvatarHue(user.name)}, 70%, 42%)`;

  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: bg,
        color: BRAND.white,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 800,
      }}
    >
      {getInitials(user.name)}
    </div>
  );
}

function ProjectTag({
  project,
  removable = false,
  onRemove,
}: {
  project: TaskPanelProject;
  removable?: boolean;
  onRemove?: (projectId: EntityId) => void;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 11px',
        borderRadius: 999,
        background: project.color || '#FBE5E8',
        color: BRAND.crimsonDeep,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {project.name}
      {removable && onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(project.id)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function CustomFieldControl({
  field,
  members,
  value,
  onChange,
}: {
  field: TaskCustomFieldDefinition;
  members: TaskPanelMember[];
  value: TaskCustomFieldValueMap[string];
  onChange: (nextValue: TaskCustomFieldValueMap[string]) => void;
}) {
  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        <option value="">未設定</option>
        {(field.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'number') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value ?? ''}
          placeholder={field.placeholder || '輸入數字'}
          onChange={(event) => onChange(event.target.value)}
          style={{ ...inputStyle, paddingRight: field.unit ? 54 : 12 }}
        />
        {field.unit ? (
          <span
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 12,
              color: BRAND.muted,
              fontWeight: 700,
            }}
          >
            {field.unit}
          </span>
        ) : null}
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    );
  }

  if (field.type === 'multi_select') {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(field.options || []).map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onChange(
                    checked
                      ? selectedValues.filter((item) => item !== option.value)
                      : [...selectedValues, option.value]
                  )
                }
                style={{
                  padding: '8px 11px',
                  borderRadius: 999,
                  border: `1px solid ${checked ? BRAND.crimson : BRAND.line}`,
                  background: checked ? 'var(--xc-brand-soft)' : BRAND.white,
                  color: checked ? BRAND.crimsonDeep : BRAND.carbon,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'people') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <select
          value=""
          onChange={(event) => {
            const nextId = event.target.value;
            if (!nextId) return;
            if (selected.includes(nextId)) return;
            onChange([...selected, nextId]);
          }}
          style={inputStyle}
        >
          <option value="">加入成員</option>
          {members
            .filter((member) => !selected.includes(toKey(member.id)))
            .map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
        </select>

        {selected.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selected.map((memberId) => {
              const member = members.find((item) => toKey(item.id) === memberId);
              if (!member) return null;

              return (
                <span
                  key={memberId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: BRAND.surfaceMuted,
                    color: BRAND.carbon,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Avatar user={member} size={22} />
                  {member.name}
                  <button
                    type="button"
                    onClick={() => onChange(selected.filter((item) => item !== memberId))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 13,
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      placeholder={field.placeholder || '輸入內容'}
      onChange={(event) => onChange(event.target.value)}
      style={inputStyle}
    />
  );
}

function SubtaskTree({
  items,
  level = 0,
  onToggle,
}: {
  items: TaskSubtaskNode[];
  level?: number;
  onToggle?: (item: TaskSubtaskNode) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            borderRadius: 16,
            border: `1px solid ${BRAND.line}`,
            background: BRAND.white,
            padding: '12px 14px',
            marginLeft: level * 18,
            boxShadow: level === 0 ? 'var(--xc-shadow)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <button
              type="button"
              onClick={() => onToggle?.(item)}
              style={{
                marginTop: 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `1.5px solid ${item.completed ? BRAND.success : BRAND.line}`,
                background: item.completed ? BRAND.success : BRAND.white,
                color: BRAND.white,
                fontSize: 11,
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: onToggle ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >
              {item.completed ? '✓' : ''}
            </button>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: BRAND.ink,
                  textDecoration: item.completed ? 'line-through' : 'none',
                  opacity: item.completed ? 0.58 : 1,
                }}
              >
                {item.title}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: BRAND.muted,
                    background: BRAND.surfaceMuted,
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  進度 {item.progressPercent ?? (item.completed ? 100 : 0)}%
                </span>

                {item.dueDate ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: BRAND.muted,
                      background: BRAND.surfaceSoft,
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontWeight: 700,
                    }}
                  >
                    {formatHumanDate(item.dueDate)}
                  </span>
                ) : null}

                {item.assignee ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11,
                      color: BRAND.carbon,
                      fontWeight: 700,
                    }}
                  >
                    <Avatar user={item.assignee} size={22} />
                    {item.assignee.name}
                  </span>
                ) : null}
              </div>

              {item.children && item.children.length > 0 ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BRAND.mist}` }}>
                  <SubtaskTree items={item.children} level={level + 1} onToggle={onToggle} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTimeline({ items }: { items: TaskActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div
        style={{
          border: `1px dashed ${BRAND.line}`,
          borderRadius: 18,
          background: BRAND.surfaceSoft,
          color: BRAND.muted,
          padding: '20px 18px',
          fontSize: 13,
        }}
      >
        尚無評論與操作紀錄。
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <Avatar user={item.actor} size={34} />

          <div
            style={{
              borderRadius: 18,
              border: `1px solid ${BRAND.line}`,
              background: BRAND.white,
              padding: '14px 16px',
              boxShadow: 'var(--xc-shadow)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.ink }}>
                  {item.actor.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: '4px 8px',
                    background: item.type === 'comment' ? 'var(--xc-brand-soft)' : BRAND.surfaceMuted,
                    color: item.type === 'comment' ? BRAND.crimsonDeep : BRAND.muted,
                  }}
                >
                  {item.type === 'comment' ? '評論' : '歷史操作'}
                </span>
              </div>

              <span style={{ fontSize: 11, color: BRAND.muted, fontWeight: 700 }}>
                {formatActivityTime(item.createdAt)}
              </span>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                lineHeight: 1.7,
                color: BRAND.carbon,
                whiteSpace: 'pre-wrap',
              }}
            >
              {item.text}
            </div>

            {item.mentions && item.mentions.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {item.mentions.map((mention) => (
                  <span
                    key={mention.id}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 999,
                      background: BRAND.infoSoft,
                      color: '#2563EB',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    @{mention.name}
                  </span>
                ))}
              </div>
            ) : null}

            {item.meta && item.meta.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {item.meta.map((entry) => (
                  <span
                    key={entry}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 999,
                      background: BRAND.surfaceSoft,
                      color: BRAND.muted,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {entry}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TaskDetailPanel({
  open,
  task,
  members,
  availableProjects,
  customFields,
  lockedProjectIds = [],
  saving = false,
  onClose,
  onSave,
  onDelete,
  onQuickAddSubtask,
  onAddComment,
  commentSaving = false,
  commentError = null,
  onToggleSubtask,
  isSubscribed = false,
  subscriberCount = 0,
  onSubscribe,
  onUnsubscribe,
  dependencies = [],
  onAddDependency,
  onRemoveDependency,
  allTasks = [],
}: TaskDetailPanelProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<TaskCustomFieldValueMap>({});
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskPending, setSubtaskPending] = useState(false);
  const [commentText, setCommentText] = useState('');
  // ── Asana features ────────────────────────────────────────────────
  const [subscribing, setSubscribing] = useState(false);
  const [depInput, setDepInput] = useState('');
  const [depType, setDepType] = useState<'finish_to_start' | 'start_to_start' | 'finish_to_finish'>('finish_to_start');
  const [depPending, setDepPending] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  useEffect(() => {
    if (!open || !task) return;

    setTitle(task.title);
    setAssigneeId(task.assignee ? toKey(task.assignee.id) : '');
    setDueDate(formatDateInputValue(task.dueDate));
    setSelectedProjectIds(task.projects.map((project) => toKey(project.id)));
    setCustomFieldValues(task.customFieldValues || {});
    setSubtaskInput('');
    setCommentText('');
    setShowProjectPicker(false);
    setIsEditingTitle(false);
  }, [open, task]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const projectCatalog = useMemo(() => {
    const catalog = new Map<string, TaskPanelProject>();
    [...availableProjects, ...task.projects].forEach((project) => {
      catalog.set(toKey(project.id), project);
    });
    return catalog;
  }, [availableProjects, task.projects]);

  const activeProjects = useMemo(() => {
    return selectedProjectIds
      .map((projectId) => projectCatalog.get(projectId))
      .filter(Boolean) as TaskPanelProject[];
  }, [projectCatalog, selectedProjectIds]);

  const projectOptions = useMemo(
    () => Array.from(projectCatalog.values()).filter((project) => !selectedProjectIds.includes(toKey(project.id))),
    [projectCatalog, selectedProjectIds]
  );

  const activityFeed = useMemo(
    () =>
      [...(task?.activity || [])].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [task]
  );
  const lockedProjectKeys = useMemo(
    () => new Set(lockedProjectIds.map((projectId) => toKey(projectId))),
    [lockedProjectIds]
  );

  if (!open || !task) return null;

  const subtaskStats = getSubtaskStats(task.subtasks || []);
  const assignee = members.find((member) => toKey(member.id) === assigneeId) || null;
  const statusTone = STATUS_TONES[task.status || 'todo'] || STATUS_TONES.todo;

  const handleSave = async () => {
    const normalizedValues: TaskCustomFieldValueMap = {};

    customFields.forEach((field) => {
      normalizedValues[toKey(field.id)] = normalizeFieldValue(
        field.type,
        customFieldValues[toKey(field.id)]
      );
    });

    await onSave({
      title: title.trim(),
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      projectIds: selectedProjectIds,
      customFieldValues: normalizedValues,
    });
  };

  const handleQuickAddSubtask = async () => {
    const nextTitle = subtaskInput.trim();
    if (!nextTitle || !onQuickAddSubtask) return;

    setSubtaskPending(true);
    try {
      await onQuickAddSubtask({ parentTaskId: task.id, title: nextTitle });
      setSubtaskInput('');
    } finally {
      setSubtaskPending(false);
    }
  };

  const handleAddComment = async () => {
    const nextComment = commentText.trim();
    if (!nextComment || !onAddComment) return;

    await onAddComment({ content: nextComment });
    setCommentText('');
  };

  const handleSubscribeToggle = async () => {
    if (!task || subscribing) return;
    setSubscribing(true);
    try {
      if (isSubscribed) {
        await onUnsubscribe?.(task.id);
      } else {
        await onSubscribe?.(task.id);
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleAddDep = async () => {
    if (!task || !depInput.trim() || !onAddDependency) return;
    const found = allTasks.find(t => String(t.id) === depInput.trim() || t.title.toLowerCase() === depInput.trim().toLowerCase());
    if (!found) return;
    setDepPending(true);
    try {
      await onAddDependency({ taskId: task.id, dependsOnTaskId: found.id, type: depType });
      setDepInput('');
    } finally {
      setDepPending(false);
    }
  };

  const handleCommentChange = (value: string) => {
    setCommentText(value);
    const textarea = commentTextareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? 0;
    const before = value.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx !== -1 && !before.slice(atIdx + 1).includes(' ')) {
      const query = before.slice(atIdx + 1);
      setMentionQuery(query);
      setShowMentionPicker(true);
    } else {
      setShowMentionPicker(false);
    }
  };

  const insertMention = (member: TaskPanelMember) => {
    const textarea = commentTextareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? 0;
    const before = commentText.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    const after = commentText.slice(cursor);
    const newText = commentText.slice(0, atIdx) + `@${member.name} ` + after;
    setCommentText(newText);
    setShowMentionPicker(false);
    setTimeout(() => {
      const newCursor = atIdx + member.name.length + 2;
      textarea.setSelectionRange(newCursor, newCursor);
      textarea.focus();
    }, 0);
  };

  const filteredMentionMembers = members.filter(m =>
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6);

  const DEP_TYPE_LABELS: Record<string, string> = {
    finish_to_start: '完成後才能開始',
    start_to_start: '開始後才能開始',
    finish_to_finish: '完成後才能完成',
  };

  const blockedBy = dependencies.filter(d => String(d.taskId) === String(task?.id));
  const blocks = dependencies.filter(d => String(d.dependsOnTaskId) === String(task?.id));

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(17,17,17,.34)',
          backdropFilter: 'blur(2px)',
          zIndex: 1090,
        }}
        onClick={onClose}
      />

      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(560px, 100vw)',
          background: `linear-gradient(180deg, ${BRAND.white} 0%, ${BRAND.surface} 100%)`,
          borderLeft: `1px solid ${BRAND.line}`,
          boxShadow: 'var(--xc-shadow-strong)',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          animation: 'taskDetailPanelSlide .22s ease',
        }}
      >
        <div
          style={{
            padding: '22px 24px 20px',
            background: `linear-gradient(135deg, ${BRAND.ink} 0%, ${BRAND.crimsonDeep} 50%, ${BRAND.crimson} 100%)`,
            color: BRAND.white,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.12)',
                    border: '1px solid rgba(255,255,255,.16)',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Task Detail
                </span>
                <span
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: statusTone.bg,
                    color: statusTone.color,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {statusTone.label}
                </span>
              </div>

              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setIsEditingTitle(false);
                    }
                    if (event.key === 'Escape') {
                      setTitle(task.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: BRAND.white,
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1.08,
                    letterSpacing: '-0.04em',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: BRAND.white,
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1.08,
                    letterSpacing: '-0.04em',
                    cursor: 'text',
                    textAlign: 'left',
                  }}
                >
                  {title || '未命名任務'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {(onSubscribe || onUnsubscribe) && (
                <button
                  type="button"
                  onClick={() => void handleSubscribeToggle()}
                  disabled={subscribing}
                  title={isSubscribed ? '取消追蹤通知' : '追蹤此任務'}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    border: isSubscribed ? '1.5px solid rgba(255,255,255,.6)' : '1px solid rgba(255,255,255,.2)',
                    background: isSubscribed ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)',
                    color: BRAND.white,
                    cursor: subscribing ? 'wait' : 'pointer',
                    fontSize: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  {isSubscribed ? '🔔' : '🔕'}
                  {subscriberCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{subscriberCount}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.2)',
                  background: 'rgba(255,255,255,.1)',
                  color: BRAND.white,
                  cursor: 'pointer',
                  fontSize: 18,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>
                負責人
              </div>
              {assignee ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Avatar user={assignee} size={28} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{assignee.name}</span>
                </div>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.92)' }}>
                  未指派
                </span>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>
                截止日期
              </div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {formatHumanDate(dueDate || task.dueDate)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
          <Section kicker="Properties" title="任務屬性">
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.muted }}>
                  負責人
                </label>
                <select
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  style={inputStyle}
                >
                  <option value="">未指派</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.muted }}>
                  日期
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.muted }}>
                    專案歸屬
                  </label>
                  {projectOptions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowProjectPicker((current) => !current)}
                    style={{
                        border: `1px solid ${BRAND.line}`,
                        background: BRAND.white,
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: BRAND.carbon,
                        cursor: 'pointer',
                      }}
                    >
                      + 加入專案
                    </button>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {activeProjects.map((project) => (
                    <ProjectTag
                      key={project.id}
                      project={project}
                      removable={activeProjects.length > 1 && !lockedProjectKeys.has(toKey(project.id))}
                      onRemove={(projectId) =>
                        setSelectedProjectIds((current) =>
                          current.filter((id) => id !== toKey(projectId))
                        )
                      }
                    />
                  ))}
                </div>

                {showProjectPicker ? (
                  <select
                    value=""
                    onChange={(event) => {
                      const nextId = event.target.value;
                      if (!nextId) return;
                      setSelectedProjectIds((current) => [...current, nextId]);
                      setShowProjectPicker(false);
                    }}
                    style={inputStyle}
                  >
                    <option value="">選擇專案</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          </Section>

          <Section kicker="Custom Fields" title="自定義欄位">
            <div style={{ display: 'grid', gap: 16 }}>
              {customFields.length === 0 ? (
                <div
                  style={{
                    border: `1px dashed ${BRAND.line}`,
                    borderRadius: 18,
                    padding: '18px 16px',
                    background: BRAND.surfaceSoft,
                    fontSize: 13,
                    color: BRAND.muted,
                  }}
                >
                  這個任務目前沒有綁定自定義欄位。
                </div>
              ) : (
                customFields.map((field) => (
                  <div key={field.id} style={{ display: 'grid', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.ink }}>
                        {field.name}
                      </div>
                      {field.description ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted }}>
                          {field.description}
                        </div>
                      ) : null}
                    </div>

                    <CustomFieldControl
                      field={field}
                      members={members}
                      value={customFieldValues[toKey(field.id)]}
                      onChange={(nextValue) =>
                        setCustomFieldValues((current) => ({
                          ...current,
                          [toKey(field.id)]: nextValue,
                        }))
                      }
                    />
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section kicker="Subtasks" title="子任務">
            <div
              style={{
                border: `1px solid ${BRAND.line}`,
                borderRadius: 22,
                background: BRAND.white,
                padding: 18,
                boxShadow: 'var(--xc-shadow)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.ink }}>
                    進度總覽
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted }}>
                    已完成 {subtaskStats.completed} / {subtaskStats.total} 項子任務
                  </div>
                </div>

                <div style={{ fontSize: 24, fontWeight: 900, color: BRAND.crimsonDeep }}>
                  {subtaskStats.progress}%
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  height: 10,
                  borderRadius: 999,
                  background: BRAND.surfaceMuted,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${subtaskStats.progress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${BRAND.crimsonDeep}, ${BRAND.crimson})`,
                    transition: 'width .2s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <input
                  type="text"
                  value={subtaskInput}
                  onChange={(event) => setSubtaskInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleQuickAddSubtask();
                    }
                  }}
                  placeholder="快速新增子任務..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => void handleQuickAddSubtask()}
                  disabled={!subtaskInput.trim() || subtaskPending || !onQuickAddSubtask}
                  style={{
                    border: 'none',
                    borderRadius: 14,
                    padding: '0 16px',
                    background:
                      !subtaskInput.trim() || !onQuickAddSubtask ? 'var(--xc-brand-soft)' : BRAND.crimson,
                    color: BRAND.white,
                    fontSize: 13,
                    fontWeight: 800,
                    cursor:
                      !subtaskInput.trim() || !onQuickAddSubtask ? 'not-allowed' : 'pointer',
                    minWidth: 92,
                  }}
                >
                  {subtaskPending ? '新增中' : '新增'}
                </button>
              </div>

              <div style={{ marginTop: 18 }}>
                {task.subtasks && task.subtasks.length > 0 ? (
                  <SubtaskTree
                    items={task.subtasks}
                    onToggle={
                      onToggleSubtask
                        ? (item) =>
                            void onToggleSubtask({
                              subtaskId: item.id,
                              completed: !item.completed,
                            })
                        : undefined
                    }
                  />
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${BRAND.line}`,
                      borderRadius: 18,
                      padding: '20px 16px',
                      background: BRAND.surfaceSoft,
                      fontSize: 13,
                      color: BRAND.muted,
                    }}
                  >
                    目前還沒有子任務，先加一個開始拆解執行步驟。
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ── Dependencies ──────────────────────────────────────── */}
          <Section kicker="Dependencies" title="任務依賴">
            <div style={{ display: 'grid', gap: 10 }}>
              {blockedBy.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.muted, marginBottom: 6 }}>
                    等待完成（前置任務）
                  </div>
                  {blockedBy.map(dep => (
                    <div key={String(dep.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 12, border: `1px solid ${BRAND.line}`, background: BRAND.white, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: BRAND.ink }}>
                        🔒 {dep.dependsOnTask?.title || `Task #${dep.dependsOnTaskId}`}
                      </span>
                      <span style={{ fontSize: 11, color: BRAND.muted }}>{DEP_TYPE_LABELS[dep.type] || dep.type}</span>
                      {onRemoveDependency && (
                        <button type="button" onClick={() => void onRemoveDependency(dep.id)} style={{ border: 'none', background: 'none', color: BRAND.muted, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {blocks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.muted, marginBottom: 6 }}>
                    完成後解鎖（後續任務）
                  </div>
                  {blocks.map(dep => (
                    <div key={String(dep.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 12, border: `1px solid ${BRAND.line}`, background: BRAND.white, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: BRAND.ink }}>
                        🔓 {dep.task?.title || `Task #${dep.taskId}`}
                      </span>
                      <span style={{ fontSize: 11, color: BRAND.muted }}>{DEP_TYPE_LABELS[dep.type] || dep.type}</span>
                    </div>
                  ))}
                </div>
              )}
              {blockedBy.length === 0 && blocks.length === 0 && (
                <div style={{ fontSize: 13, color: BRAND.muted, padding: '8px 0' }}>尚無任務依賴關係。</div>
              )}
              {onAddDependency && allTasks.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    list="dep-task-list"
                    value={depInput}
                    onChange={e => setDepInput(e.target.value)}
                    placeholder="輸入前置任務名稱..."
                    style={{ flex: 1, borderRadius: 10, border: `1px solid ${BRAND.line}`, background: BRAND.white, color: BRAND.ink, padding: '7px 10px', fontSize: 13 }}
                  />
                  <datalist id="dep-task-list">
                    {allTasks.filter(t => String(t.id) !== String(task?.id)).map(t => (
                      <option key={String(t.id)} value={t.title} />
                    ))}
                  </datalist>
                  <select value={depType} onChange={e => setDepType(e.target.value as typeof depType)} style={{ borderRadius: 10, border: `1px solid ${BRAND.line}`, background: BRAND.white, color: BRAND.ink, padding: '7px 8px', fontSize: 12 }}>
                    <option value="finish_to_start">完成才能開始</option>
                    <option value="start_to_start">開始才能開始</option>
                    <option value="finish_to_finish">完成才能完成</option>
                  </select>
                  <button type="button" onClick={() => void handleAddDep()} disabled={!depInput.trim() || depPending} style={{ borderRadius: 10, border: 'none', background: BRAND.crimson, color: BRAND.white, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: depInput.trim() && !depPending ? 'pointer' : 'not-allowed' }}>
                    {depPending ? '...' : '新增'}
                  </button>
                </div>
              )}
            </div>
          </Section>

          <Section kicker="Activity" title="活動紀錄">
            <div
              style={{
                marginBottom: 18,
                border: `1px solid ${BRAND.line}`,
                borderRadius: 20,
                background: BRAND.white,
                padding: 18,
                boxShadow: 'var(--xc-shadow)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.ink }}>
                新增留言
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
                可直接輸入工作更新，使用 @姓名 提及團隊成員。
              </div>

              <div style={{ position: 'relative' }}>
                <textarea
                  ref={commentTextareaRef}
                  value={commentText}
                  onChange={(event) => handleCommentChange(event.target.value)}
                  onKeyDown={e => {
                    if (showMentionPicker && e.key === 'Escape') {
                      setShowMentionPicker(false);
                      e.stopPropagation();
                    }
                  }}
                  placeholder="輸入留言內容... （輸入 @ 可提及成員）"
                  rows={4}
                  style={{
                    ...inputStyle,
                    marginTop: 14,
                    minHeight: 116,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.7,
                  }}
                />
                {showMentionPicker && filteredMentionMembers.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    zIndex: 9999,
                    background: BRAND.white,
                    border: `1px solid ${BRAND.line}`,
                    borderRadius: 12,
                    boxShadow: 'var(--xc-shadow-strong)',
                    minWidth: 200,
                    overflow: 'hidden',
                  }}>
                    {filteredMentionMembers.map(m => (
                      <button
                        key={String(m.id)}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '8px 14px',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: BRAND.ink,
                          textAlign: 'left',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BRAND.surfaceSoft; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        <Avatar user={m} size={24} />
                        <span style={{ fontWeight: 700 }}>{m.name}</span>
                        {m.email && <span style={{ fontSize: 11, color: BRAND.muted }}>{m.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {commentError ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    background: BRAND.dangerSoft,
                    color: BRAND.crimsonDeep,
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {commentError}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => void handleAddComment()}
                  disabled={!commentText.trim() || commentSaving || !onAddComment}
                  style={{
                    borderRadius: 14,
                    border: 'none',
                    background:
                      !commentText.trim() || !onAddComment || commentSaving ? 'var(--xc-brand-soft)' : BRAND.crimson,
                    color: BRAND.white,
                    padding: '11px 16px',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor:
                      !commentText.trim() || !onAddComment || commentSaving ? 'not-allowed' : 'pointer',
                    minWidth: 118,
                  }}
                >
                  {commentSaving ? '送出中...' : '送出留言'}
                </button>
              </div>
            </div>

            <ActivityTimeline items={activityFeed} />
          </Section>
        </div>

        <div
          style={{
            padding: '18px 24px 24px',
            borderTop: `1px solid ${BRAND.line}`,
            background: BRAND.surface,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => onDelete?.(task.id)}
            disabled={!onDelete}
            style={{
              borderRadius: 14,
              border: `1px solid ${onDelete ? 'color-mix(in srgb, var(--xc-danger) 32%, var(--xc-border))' : BRAND.line}`,
              background: BRAND.dangerSoft,
              color: onDelete ? BRAND.crimsonDeep : BRAND.muted,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 800,
              cursor: onDelete ? 'pointer' : 'not-allowed',
            }}
          >
            刪除任務
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 14,
                border: `1px solid ${BRAND.line}`,
                background: BRAND.white,
                color: BRAND.carbon,
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              取消
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !title.trim()}
              style={{
                borderRadius: 14,
                border: 'none',
                background: saving || !title.trim() ? 'var(--xc-brand-soft)' : BRAND.crimson,
                color: BRAND.white,
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: 900,
                cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
                minWidth: 116,
              }}
            >
              {saving ? '儲存中...' : '儲存變更'}
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes taskDetailPanelSlide {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
