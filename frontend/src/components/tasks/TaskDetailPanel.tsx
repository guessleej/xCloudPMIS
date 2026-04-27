import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useResponsive';

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

export interface TaskChecklistItem {
  id: EntityId;
  title: string;
  isDone: boolean;
  position: number;
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
  assignees?: TaskPanelMember[];
  planStart?: string | null;
  planEnd?: string | null;
  dueDate?: string | null;
  dueEndDate?: string | null;
  dueTime?: string | null;
  dueEndTime?: string | null;
  projects: TaskPanelProject[];
  customFieldValues?: Record<string, CustomFieldStoredValue | undefined>;
  subtasks?: TaskSubtaskNode[];
  activity?: TaskActivityItem[];
}

export interface TaskDetailSavePayload {
  title: string;
  assigneeIds: EntityId[];
  planStart: string | null;
  planEnd: string | null;
  dueDate: string | null;
  dueEndDate: string | null;
  dueTime: string | null;
  dueEndTime: string | null;
  projectIds: EntityId[];
  customFieldValues: Record<string, CustomFieldStoredValue | undefined>;
}

export interface TaskCommentCreatePayload {
  content: string;
  parentId?: EntityId | null;
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
  onUpdateSubtask?: (input: {
    subtaskId: EntityId;
    title: string;
  }) => Promise<void> | void;
  // Checklist
  checklistItems?: TaskChecklistItem[];
  checklistLoading?: boolean;
  onAddChecklistItem?: (title: string) => Promise<void> | void;
  onToggleChecklistItem?: (itemId: EntityId, isDone: boolean) => Promise<void> | void;
  onUpdateChecklistItem?: (itemId: EntityId, title: string) => Promise<void> | void;
  onDeleteChecklistItem?: (itemId: EntityId) => Promise<void> | void;
  // Approval
  onApprovalAction?: (input: { action: 'approve' | 'reject' | 'request_review'; comment?: string }) => Promise<void> | void;
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
  fontSize: 15,
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
    timeZone: 'Asia/Taipei',
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
  defaultCollapsed = false,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: defaultCollapsed ? 'pointer' : undefined,
          userSelect: defaultCollapsed ? 'none' : undefined,
        }}
        onClick={defaultCollapsed ? () => setCollapsed((c) => !c) : undefined}
      >
        <div>
          <div
            style={{
              fontSize: 13,
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
              fontSize: 20,
              fontWeight: 800,
              color: BRAND.ink,
            }}
          >
            {title}
          </h3>
        </div>
        {defaultCollapsed && (
          <span
            style={{
              fontSize: 18,
              color: BRAND.muted,
              transition: 'transform .2s',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              marginBottom: 8,
            }}
          >
            ▼
          </span>
        )}
      </div>
      {!collapsed && children}
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
        fontSize: 14,
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
            fontSize: 15,
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
              fontSize: 14,
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
                  fontSize: 14,
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
                    fontSize: 14,
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
                      fontSize: 15,
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
  onEdit,
}: {
  items: TaskSubtaskNode[];
  level?: number;
  onToggle?: (item: TaskSubtaskNode) => void;
  onEdit?: (item: TaskSubtaskNode) => void;
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
                fontSize: 13,
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
                  fontSize: 16,
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
                    fontSize: 13,
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
                      fontSize: 13,
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
                      fontSize: 13,
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
                  <SubtaskTree items={item.children} level={level + 1} onToggle={onToggle} onEdit={onEdit} />
                </div>
              ) : null}
            </div>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(item)}
                style={{
                  border: 'none',
                  background: BRAND.surfaceSoft,
                  color: BRAND.carbon,
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '6px 9px',
                  flexShrink: 0,
                }}
                title="編輯子任務名稱"
              >
                編輯
              </button>
            ) : null}
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
          fontSize: 15,
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
                <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>
                  {item.actor.name}
                </span>
                <span
                  style={{
                    fontSize: 13,
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

              <span style={{ fontSize: 13, color: BRAND.muted, fontWeight: 700 }}>
                {formatActivityTime(item.createdAt)}
              </span>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 15,
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
                      fontSize: 13,
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
                      fontSize: 13,
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
  onUpdateSubtask,
  checklistItems = [],
  checklistLoading = false,
  onAddChecklistItem,
  onToggleChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onApprovalAction,
}: TaskDetailPanelProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement | null>(null);
  const [planStart, setPlanStart] = useState('');
  const [planEnd, setPlanEnd] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueEndDate, setDueEndDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [dueEndTime, setDueEndTime] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<TaskCustomFieldValueMap>({});
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskPending, setSubtaskPending] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [checklistInput, setChecklistInput] = useState('');
  const [checklistPending, setChecklistPending] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalPending, setApprovalPending] = useState(false);

  // ── 根本修正：task 物件每次由父層 inline 建立，ref 不同但 id 相同
  //    只在 task.id 真正改變時重設所有欄位，避免父層 re-render 覆蓋使用者編輯中的值
  const cfvFromParentRef = useRef<TaskCustomFieldValueMap | null>(null);

  useEffect(() => {
    if (!open || !task) return;

    setTitle(task.title);
    setAssigneeIds(
      (task.assignees && task.assignees.length > 0)
        ? task.assignees.map((a) => toKey(a.id))
        : task.assignee ? [toKey(task.assignee.id)] : []
    );
    setAssigneeDropdownOpen(false);
    setPlanStart(formatDateInputValue(task.planStart));
    setPlanEnd(formatDateInputValue(task.planEnd));
    setDueDate(formatDateInputValue(task.dueDate));
    setDueEndDate(formatDateInputValue(task.dueEndDate));
    setDueTime(task.dueTime || '');
    setDueEndTime(task.dueEndTime || '');
    setSelectedProjectIds(task.projects.map((project) => toKey(project.id)));
    setCustomFieldValues(task.customFieldValues || {});
    cfvFromParentRef.current = task.customFieldValues || null;
    setSubtaskInput('');
    setCommentText('');
    setChecklistInput('');
    setShowProjectPicker(false);
    setIsEditingTitle(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  // 若面板已開啟後父層才刷新到日期，補進目前仍為空白的日期欄位。
  useEffect(() => {
    if (!open || !task) return;
    const nextPlanStart = formatDateInputValue(task.planStart);
    const nextPlanEnd = formatDateInputValue(task.planEnd || task.dueDate);
    const nextDueDate = formatDateInputValue(task.dueDate || task.planEnd);
    if (!planStart && nextPlanStart) setPlanStart(nextPlanStart);
    if (!planEnd && nextPlanEnd) setPlanEnd(nextPlanEnd);
    if (!dueDate && nextDueDate) setDueDate(nextDueDate);
    if (!dueTime && task.dueTime) setDueTime(task.dueTime);
    if (!dueEndTime && task.dueEndTime) setDueEndTime(task.dueEndTime);
  }, [open, task, task?.planStart, task?.planEnd, task?.dueDate, task?.dueTime, task?.dueEndTime, planStart, planEnd, dueDate, dueTime, dueEndTime]);

  // 當父層非同步載入自訂欄位值時（第一次載入），同步更新本地狀態；
  // 但若使用者已開始編輯（cfvFromParentRef 已經不同），則不覆蓋
  useEffect(() => {
    if (!open || !task) return;
    const incoming = task.customFieldValues;
    // 若 incoming 是同一個 reference，代表沒有新資料，不處理
    if (incoming === cfvFromParentRef.current) return;
    // 只在值真的從 API 載入後（非空）才更新
    if (!incoming || Object.keys(incoming).length === 0) return;
    cfvFromParentRef.current = incoming;
    setCustomFieldValues(incoming);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.customFieldValues]);

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

  // 指派成員 dropdown 點擊外部關閉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setAssigneeDropdownOpen(false);
      }
    };
    if (assigneeDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assigneeDropdownOpen]);

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
  const resolvedAssignees = assigneeIds.map((id) => members.find((m) => toKey(m.id) === id)).filter(Boolean) as TaskPanelMember[];
  const statusTone = STATUS_TONES[task.status || 'todo'] || STATUS_TONES.todo;

  const toggleAssignee = (uid: string) => {
    setAssigneeIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleSave = async () => {
    if (!planStart) { alert('請填入開始日期'); return; }
    if (!planEnd)   { alert('請填入截止日期'); return; }
    if (planEnd < planStart) { alert('截止日期不能早於開始日期'); return; }
    const normalizedValues: TaskCustomFieldValueMap = {};

    customFields.forEach((field) => {
      normalizedValues[toKey(field.id)] = normalizeFieldValue(
        field.type,
        customFieldValues[toKey(field.id)]
      );
    });

    await onSave({
      title: title.trim(),
      assigneeIds: assigneeIds,
      planStart: planStart || null,
      planEnd: planEnd || null,
      dueDate: planEnd || dueDate || null,
      dueEndDate: dueEndDate || null,
      dueTime: dueTime || null,
      dueEndTime: dueEndTime || null,
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

  const handleEditSubtaskTitle = async (item: TaskSubtaskNode) => {
    if (!onUpdateSubtask) return;
    const nextTitle = window.prompt('編輯子任務名稱', item.title)?.trim();
    if (!nextTitle || nextTitle === item.title) return;
    await onUpdateSubtask({ subtaskId: item.id, title: nextTitle });
  };

  const handleEditChecklistTitle = async (item: TaskChecklistItem) => {
    if (!onUpdateChecklistItem) return;
    const nextTitle = window.prompt('編輯待辦項目', item.title)?.trim();
    if (!nextTitle || nextTitle === item.title) return;
    await onUpdateChecklistItem(item.id, nextTitle);
  };

  const handleAddComment = async () => {
    const nextComment = commentText.trim();
    if (!nextComment || !onAddComment) return;

    await onAddComment({ content: nextComment });
    setCommentText('');
  };

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
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(600px, 95vw)',
          maxHeight: '90vh',
          background: `linear-gradient(180deg, ${BRAND.white} 0%, ${BRAND.surface} 100%)`,
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08)',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
                    fontSize: 13,
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
                    fontSize: 13,
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
                    fontSize: 32,
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
                    fontSize: 32,
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
                fontSize: 20,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>
                負責人
              </div>
              {resolvedAssignees.length > 0 ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {resolvedAssignees.slice(0, 3).map((a, i) => (
                    <div key={toKey(a.id)} style={{ marginLeft: i > 0 ? -4 : 0, position: 'relative', zIndex: 3 - i }} title={a.name}>
                      <Avatar user={a} size={28} />
                    </div>
                  ))}
                  <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 4 }}>
                    {resolvedAssignees[0].name}
                    {resolvedAssignees.length > 1 && <span style={{ fontSize: 13, opacity: 0.8 }}> +{resolvedAssignees.length - 1}</span>}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,.92)' }}>
                  未指派
                </span>
              )}
            </div>

            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>
                {(planStart || task.planStart) ? '計劃日期' : '截止日期'}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {(planStart || task.planStart)
                  ? `${formatHumanDate(planStart || task.planStart)} ~ ${formatHumanDate(planEnd || task.planEnd)}`
                  : formatHumanDate(dueDate || task.dueDate)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>

          {/* ── 審核簽核橫幅 ── */}
          {task.status === 'review' && onApprovalAction && (
            <div style={{
              background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
              border: '1px solid #F59E0B',
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>✉️</span>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#92400E' }}>此任務等待審核簽核</span>
                  <div style={{ fontSize: 12, color: '#92400E', opacity: 0.8, marginTop: 2 }}>專案建立者或管理者可進行批准/退回操作</div>
                </div>
              </div>
              <textarea
                value={approvalComment}
                onChange={e => setApprovalComment(e.target.value)}
                placeholder="審核意見（選填）..."
                style={{
                  width: '100%', minHeight: 56, padding: '8px 12px', borderRadius: 8,
                  border: '1px solid #D97706', background: 'rgba(255,255,255,.7)',
                  fontSize: 14, resize: 'vertical', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  disabled={approvalPending}
                  onClick={async () => {
                    setApprovalPending(true);
                    try { await onApprovalAction({ action: 'approve', comment: approvalComment || undefined }); setApprovalComment(''); } finally { setApprovalPending(false); }
                  }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: '#16A34A', color: '#fff', fontSize: 15, fontWeight: 800,
                    cursor: approvalPending ? 'not-allowed' : 'pointer', opacity: approvalPending ? .6 : 1,
                  }}
                >
                  ✅ 批准
                </button>
                <button
                  disabled={approvalPending}
                  onClick={async () => {
                    setApprovalPending(true);
                    try { await onApprovalAction({ action: 'reject', comment: approvalComment || undefined }); setApprovalComment(''); } finally { setApprovalPending(false); }
                  }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 15, fontWeight: 800,
                    cursor: approvalPending ? 'not-allowed' : 'pointer', opacity: approvalPending ? .6 : 1,
                  }}
                >
                  ❌ 退回
                </button>
              </div>
            </div>
          )}

          {/* ── 提交審核按鈕（非 review 狀態時顯示）── */}
          {task.status !== 'review' && task.status !== 'done' && task.status !== 'completed' && onApprovalAction && (
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={async () => {
                  setApprovalPending(true);
                  try { await onApprovalAction({ action: 'request_review' }); } finally { setApprovalPending(false); }
                }}
                disabled={approvalPending}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  border: '1px solid #F59E0B', background: '#FFFBEB',
                  color: '#92400E', fontSize: 14, fontWeight: 700,
                  cursor: approvalPending ? 'not-allowed' : 'pointer',
                  opacity: approvalPending ? .6 : 1,
                }}
              >
                📝 提交審核
              </button>
              <div style={{ fontSize: 12, color: '#92400E', marginTop: 4, textAlign: 'center', opacity: 0.8 }}>
                審核將發送給專案建立者，由其批准或退回
              </div>
            </div>
          )}

          <Section kicker="Properties" title="任務屬性">
            <div style={{ display: 'grid', gap: 16 }}>
              <div ref={assigneeRef} style={{ display: 'grid', gap: 8, position: 'relative' }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: BRAND.muted }}>
                  負責人
                </label>
                <div
                  onClick={() => setAssigneeDropdownOpen((v) => !v)}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    minHeight: 42,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    alignItems: 'center',
                    padding: '6px 10px',
                  }}
                >
                  {assigneeIds.length === 0 && (
                    <span style={{ color: BRAND.muted, fontSize: 14, lineHeight: '28px' }}>
                      — 點擊指派 —
                    </span>
                  )}
                  {resolvedAssignees.map((a, idx) => (
                    <span
                      key={toKey(a.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background:
                          idx === 0
                            ? 'color-mix(in srgb, var(--xc-brand) 12%, transparent)'
                            : BRAND.surfaceSoft,
                        border: `1px solid ${idx === 0 ? 'color-mix(in srgb, var(--xc-brand) 30%, transparent)' : BRAND.line}`,
                        borderRadius: 99,
                        padding: '2px 8px 2px 4px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: BRAND.ink,
                      }}
                    >
                      <Avatar user={a} size={18} />
                      {a.name}
                      {idx === 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: BRAND.crimson,
                            fontWeight: 700,
                            marginLeft: 2,
                          }}
                        >
                          主
                        </span>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAssignee(toKey(a.id));
                        }}
                        style={{
                          cursor: 'pointer',
                          marginLeft: 2,
                          color: BRAND.muted,
                          fontWeight: 700,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
                {assigneeDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      background: BRAND.white,
                      border: `1px solid ${BRAND.line}`,
                      borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                      maxHeight: 200,
                      overflowY: 'auto',
                      marginTop: 4,
                    }}
                  >
                    {members.map((m) => {
                      const sel = assigneeIds.includes(toKey(m.id));
                      return (
                        <div
                          key={m.id}
                          onClick={() => toggleAssignee(toKey(m.id))}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 12px',
                            cursor: 'pointer',
                            background: sel
                              ? 'color-mix(in srgb, var(--xc-brand) 8%, transparent)'
                              : 'transparent',
                            transition: 'background .1s',
                          }}
                          onMouseOver={(e) => {
                            if (!sel) (e.currentTarget as HTMLElement).style.background = BRAND.surfaceSoft;
                          }}
                          onMouseOut={(e) => {
                            if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              border: `2px solid ${sel ? BRAND.crimson : BRAND.line}`,
                              background: sel ? BRAND.crimson : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {sel && (
                              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
                                ✓
                              </span>
                            )}
                          </div>
                          <Avatar user={m} size={22} />
                          <span style={{ fontSize: 14, color: BRAND.ink }}>{m.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: BRAND.muted }}>
                  日期 <span style={{ color: BRAND.crimson, fontWeight: 800 }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="date"
                    value={planStart}
                    required
                    onChange={(event) => setPlanStart(event.target.value)}
                    style={{ ...inputStyle, flex: 1, borderColor: !planStart ? BRAND.crimson : undefined }}
                  />
                  <span style={{ color: BRAND.muted, fontSize: 14, flexShrink: 0 }}>~</span>
                  <input
                    type="date"
                    value={planEnd}
                    min={planStart || undefined}
                    required
                    onChange={(event) => setPlanEnd(event.target.value)}
                    style={{ ...inputStyle, flex: 1, borderColor: !planEnd ? BRAND.crimson : undefined }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: BRAND.muted }}>
                  時間
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(event) => setDueTime(event.target.value)}
                    placeholder="開始"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ color: BRAND.muted, fontSize: 14, flexShrink: 0 }}>~</span>
                  <input
                    type="time"
                    value={dueEndTime}
                    onChange={(event) => setDueEndTime(event.target.value)}
                    placeholder="結束"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
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
                  <label style={{ fontSize: 14, fontWeight: 700, color: BRAND.muted }}>
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
                        fontSize: 14,
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

          <Section kicker="Custom Fields" title="自定義欄位" defaultCollapsed>
            <div style={{ display: 'grid', gap: 16 }}>
              {customFields.length === 0 ? (
                <div
                  style={{
                    border: `1px dashed ${BRAND.line}`,
                    borderRadius: 18,
                    padding: '18px 16px',
                    background: BRAND.surfaceSoft,
                    fontSize: 15,
                    color: BRAND.muted,
                  }}
                >
                  這個任務目前沒有綁定自定義欄位。
                </div>
              ) : (
                customFields.map((field) => (
                  <div key={field.id} style={{ display: 'grid', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>
                        {field.name}
                      </div>
                      {field.description ? (
                        <div style={{ marginTop: 4, fontSize: 14, color: BRAND.muted }}>
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
                  <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>
                    進度總覽
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, color: BRAND.muted }}>
                    已完成 {subtaskStats.completed} / {subtaskStats.total} 項子任務
                  </div>
                </div>

                <div style={{ fontSize: 26, fontWeight: 900, color: BRAND.crimsonDeep }}>
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
                    fontSize: 15,
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
                    onEdit={onUpdateSubtask ? (item) => void handleEditSubtaskTitle(item) : undefined}
                  />
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${BRAND.line}`,
                      borderRadius: 18,
                      padding: '20px 16px',
                      background: BRAND.surfaceSoft,
                      fontSize: 15,
                      color: BRAND.muted,
                    }}
                  >
                    目前還沒有子任務，先加一個開始拆解執行步驟。
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section kicker="Checklist" title="待辦清單">
            <div
              style={{
                border: `1px solid ${BRAND.line}`,
                borderRadius: 22,
                background: BRAND.white,
                padding: 18,
                boxShadow: 'var(--xc-shadow)',
              }}
            >
              {/* 進度列 */}
              {checklistItems.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.carbon }}>
                      完成進度
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.muted }}>
                      {checklistItems.filter(i => i.isDone).length} / {checklistItems.length}
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: BRAND.surfaceMuted, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((checklistItems.filter(i => i.isDone).length / checklistItems.length) * 100)}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${BRAND.crimsonDeep}, ${BRAND.crimson})`,
                        transition: 'width .2s ease',
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {/* 清單項目 */}
              {checklistLoading ? (
                <div style={{ fontSize: 15, color: BRAND.muted, padding: '8px 0' }}>載入中...</div>
              ) : checklistItems.length === 0 ? (
                <div
                  style={{
                    border: `1px dashed ${BRAND.line}`,
                    borderRadius: 14,
                    padding: '14px 12px',
                    background: BRAND.surfaceSoft,
                    fontSize: 15,
                    color: BRAND.muted,
                    marginBottom: 14,
                  }}
                >
                  目前沒有待辦項目，可以把任務拆成小步驟。
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                  {checklistItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `1px solid ${item.isDone ? BRAND.successSoft : BRAND.line}`,
                        background: item.isDone ? BRAND.successSoft : BRAND.surface,
                        transition: 'all .15s',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void onToggleChecklistItem?.(item.id, !item.isDone)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: `1.5px solid ${item.isDone ? BRAND.success : BRAND.line}`,
                          background: item.isDone ? BRAND.success : BRAND.white,
                          color: BRAND.white,
                          fontSize: 13,
                          fontWeight: 900,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {item.isDone ? '✓' : ''}
                      </button>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 15,
                          fontWeight: 600,
                          color: item.isDone ? BRAND.muted : BRAND.ink,
                          textDecoration: item.isDone ? 'line-through' : 'none',
                          opacity: item.isDone ? 0.7 : 1,
                        }}
                      >
                        {item.title}
                      </span>
                      {onUpdateChecklistItem ? (
                        <button
                          type="button"
                          onClick={() => void handleEditChecklistTitle(item)}
                          style={{
                            border: 'none',
                            background: BRAND.surfaceSoft,
                            color: BRAND.carbon,
                            borderRadius: 9,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 800,
                            padding: '5px 8px',
                            flexShrink: 0,
                          }}
                          title="編輯待辦項目"
                        >
                          編輯
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void onDeleteChecklistItem?.(item.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: BRAND.muted,
                          cursor: 'pointer',
                          fontSize: 17,
                          lineHeight: 1,
                          padding: '0 2px',
                          flexShrink: 0,
                        }}
                        title="刪除此項目"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 新增輸入 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={checklistInput}
                  onChange={(event) => setChecklistInput(event.target.value)}
                  onKeyDown={async (event) => {
                    if (event.key === 'Enter' && checklistInput.trim() && onAddChecklistItem) {
                      event.preventDefault();
                      setChecklistPending(true);
                      try { await onAddChecklistItem(checklistInput.trim()); setChecklistInput(''); }
                      finally { setChecklistPending(false); }
                    }
                  }}
                  placeholder="新增待辦項目..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  disabled={!checklistInput.trim() || checklistPending || !onAddChecklistItem}
                  onClick={async () => {
                    if (!checklistInput.trim() || !onAddChecklistItem) return;
                    setChecklistPending(true);
                    try { await onAddChecklistItem(checklistInput.trim()); setChecklistInput(''); }
                    finally { setChecklistPending(false); }
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 14,
                    padding: '0 16px',
                    background: !checklistInput.trim() || !onAddChecklistItem ? 'var(--xc-brand-soft)' : BRAND.crimson,
                    color: BRAND.white,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: !checklistInput.trim() || !onAddChecklistItem ? 'not-allowed' : 'pointer',
                    minWidth: 80,
                  }}
                >
                  {checklistPending ? '...' : '新增'}
                </button>
              </div>
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
              <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>
                新增留言
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: BRAND.muted, lineHeight: 1.6 }}>
                可直接輸入工作更新，使用 @姓名 提及團隊成員。
              </div>

              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="輸入留言內容..."
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

              {commentError ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    background: BRAND.dangerSoft,
                    color: BRAND.crimsonDeep,
                    padding: '10px 12px',
                    fontSize: 14,
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
                    fontSize: 15,
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
              fontSize: 15,
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
                fontSize: 15,
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
                fontSize: 15,
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
            transform: translate(-50%, -50%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </>
  );
}
