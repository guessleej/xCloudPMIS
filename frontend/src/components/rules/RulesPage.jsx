import { useState, useEffect, useCallback } from 'react';

// ─── Brand Colors ───────────────────────────────────────────────────────────
const ACCENT = '#C41230';
const PAGE_BG = '#F7F2F2';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';
const BORDER_COLOR = '#E5E7EB';

// ─── Trigger & Action Metadata ───────────────────────────────────────────────
const TRIGGER_TYPES = [
  { type: 'task_created', label: '任務已建立', icon: '✦', desc: '當有新任務被建立時觸發' },
  { type: 'task_completed', label: '任務已完成', icon: '✔', desc: '當任務被標記為完成時觸發' },
  { type: 'due_date_approaching', label: '截止日期即將到期', icon: '⏰', desc: '在截止日前指定天數觸發' },
  { type: 'status_changed', label: '狀態已變更', icon: '⇄', desc: '當任務狀態發生變化時觸發' },
  { type: 'assignee_changed', label: '負責人已變更', icon: '👤', desc: '當任務指派人更改時觸發' },
  { type: 'field_changed', label: '欄位已變更', icon: '✏️', desc: '當指定欄位數值變化時觸發' },
];

const ACTION_TYPES = [
  { type: 'assign_task', label: '指派任務給', icon: '👤' },
  { type: 'set_status', label: '設定狀態為', icon: '⇄' },
  { type: 'set_priority', label: '設定優先度', icon: '🔺' },
  { type: 'add_comment', label: '新增留言', icon: '💬' },
  { type: 'send_notification', label: '傳送通知', icon: '🔔' },
  { type: 'move_to_section', label: '移至分節', icon: '📁' },
  { type: 'set_due_date', label: '設定截止日期', icon: '📅' },
];

const CONDITION_FIELDS = ['專案', '優先度', '標籤', '負責人', '狀態'];
const OPERATORS = [
  { value: 'equals', label: '等於' },
  { value: 'not_equals', label: '不等於' },
  { value: 'contains', label: '包含' },
  { value: 'greater_than', label: '大於' },
  { value: 'less_than', label: '小於' },
];

const STATUS_OPTIONS = ['未開始', '進行中', '審核中', '已完成', '已封存'];
const PRIORITY_OPTIONS = ['低', '中', '高', '緊急'];
const MEMBER_OPTIONS = ['王小明', '李美玲', '張大衛', '陳志遠', '林佳穎', '專案負責人'];
const SECTION_OPTIONS = ['待辦', '進行中', '審核中', '已完成', '已封存'];

// ─── Default Rules ───────────────────────────────────────────────────────────
const DEFAULT_RULES = [
  {
    id: 'rule-1',
    name: '任務完成自動通知',
    description: '當任務完成時，自動傳送通知給負責人',
    enabled: true,
    trigger: { type: 'task_completed', config: {} },
    conditions: [],
    actions: [{ type: 'send_notification', config: { recipient: '負責人' } }],
    createdAt: '2026-03-01T08:00:00Z',
    lastTriggered: '2026-03-14T15:30:00Z',
    triggerCount: 47,
  },
  {
    id: 'rule-2',
    name: '高優先任務自動指派',
    description: '新建立的高優先度任務自動指派給專案負責人',
    enabled: true,
    trigger: { type: 'task_created', config: {} },
    conditions: [{ field: '優先度', operator: 'equals', value: '高' }],
    actions: [{ type: 'assign_task', config: { member: '專案負責人' } }],
    createdAt: '2026-03-02T09:00:00Z',
    lastTriggered: '2026-03-13T11:20:00Z',
    triggerCount: 23,
  },
  {
    id: 'rule-3',
    name: '逾期提醒',
    description: '截止日前 3 天自動傳送提醒通知',
    enabled: true,
    trigger: { type: 'due_date_approaching', config: { daysBefore: 3 } },
    conditions: [],
    actions: [{ type: 'send_notification', config: { recipient: '負責人' } }],
    createdAt: '2026-03-03T10:00:00Z',
    lastTriggered: '2026-03-15T08:00:00Z',
    triggerCount: 89,
  },
  {
    id: 'rule-4',
    name: '新任務自動標記',
    description: '新建立的任務自動設定狀態為進行中',
    enabled: false,
    trigger: { type: 'task_created', config: {} },
    conditions: [],
    actions: [{ type: 'set_status', config: { status: '進行中' } }],
    createdAt: '2026-03-04T11:00:00Z',
    lastTriggered: null,
    triggerCount: 0,
  },
  {
    id: 'rule-5',
    name: '完成任務歸檔',
    description: '任務完成後自動移至「已完成」分節',
    enabled: true,
    trigger: { type: 'task_completed', config: {} },
    conditions: [],
    actions: [{ type: 'move_to_section', config: { section: '已完成' } }],
    createdAt: '2026-03-05T12:00:00Z',
    lastTriggered: '2026-03-14T16:45:00Z',
    triggerCount: 34,
  },
  {
    id: 'rule-6',
    name: '狀態同步通知',
    description: '狀態變更時自動新增留言說明變更原因',
    enabled: true,
    trigger: { type: 'status_changed', config: {} },
    conditions: [],
    actions: [{ type: 'add_comment', config: { text: '狀態已更新，請查看最新進度。' } }],
    createdAt: '2026-03-06T13:00:00Z',
    lastTriggered: '2026-03-15T10:15:00Z',
    triggerCount: 61,
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────
function getTriggerLabel(triggerType) {
  const found = TRIGGER_TYPES.find(t => t.type === triggerType);
  return found ? found.label : triggerType;
}

function getActionSummary(actions) {
  if (!actions || actions.length === 0) return '無動作';
  const first = actions[0];
  const meta = ACTION_TYPES.find(a => a.type === first.type);
  const label = meta ? meta.label : first.type;
  let detail = '';
  if (first.config) {
    if (first.config.member) detail = first.config.member;
    else if (first.config.status) detail = first.config.status;
    else if (first.config.priority) detail = first.config.priority;
    else if (first.config.section) detail = first.config.section;
    else if (first.config.recipient) detail = first.config.recipient;
  }
  const suffix = detail ? ` ${detail}` : '';
  const more = actions.length > 1 ? ` +${actions.length - 1}` : '';
  return `→ ${label}${suffix}${more}`;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '從未觸發';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return '剛剛';
  if (diffMins < 60) return `${diffMins} 分鐘前`;
  if (diffHours < 24) return `${diffHours} 小時前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-TW');
}

function generateId() {
  return 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER_COLOR}`,
      borderRadius: 10,
      padding: '16px 20px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || TEXT_PRIMARY }}>{value}</div>
      <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!checked); }}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? ACCENT : '#D1D5DB',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: 2,
        left: checked ? 20 : 2,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

function RuleCard({ rule, onToggle, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: CARD_BG,
        border: `1px solid ${hovered ? ACCENT : BORDER_COLOR}`,
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? '0 2px 12px rgba(196,18,48,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: 'default',
      }}
    >
      {/* Toggle */}
      <div style={{ paddingTop: 2 }}>
        <Toggle checked={rule.enabled} onChange={v => onToggle(rule.id, v)} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 15,
            fontWeight: 600,
            color: rule.enabled ? TEXT_PRIMARY : TEXT_SECONDARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{rule.name}</span>
          {!rule.enabled && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#9CA3AF',
              background: '#F3F4F6',
              borderRadius: 4,
              padding: '1px 6px',
            }}>已停用</span>
          )}
        </div>

        <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 8 }}>
          {rule.description}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: ACCENT,
            background: '#FFF1F3',
            borderRadius: 5,
            padding: '2px 8px',
            border: `1px solid #FECDD3`,
          }}>⚡ {getTriggerLabel(rule.trigger.type)}</span>

          {rule.conditions.length > 0 && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#7C3AED',
              background: '#F5F3FF',
              borderRadius: 5,
              padding: '2px 8px',
              border: '1px solid #DDD6FE',
            }}>◈ {rule.conditions.length} 個條件</span>
          )}

          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#059669',
            background: '#ECFDF5',
            borderRadius: 5,
            padding: '2px 8px',
            border: '1px solid #A7F3D0',
          }}>{getActionSummary(rule.actions)}</span>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: TEXT_SECONDARY }}>
          <span>🕐 {formatRelativeTime(rule.lastTriggered)}</span>
          <span>🔁 已觸發 {rule.triggerCount} 次</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(rule); }}
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            color: TEXT_SECONDARY,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER_COLOR; e.currentTarget.style.color = TEXT_SECONDARY; }}
        >編輯</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(rule.id); }}
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            color: TEXT_SECONDARY,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER_COLOR; e.currentTarget.style.color = TEXT_SECONDARY; }}
        >刪除</button>
      </div>
    </div>
  );
}

// ─── Rule Builder Modal ───────────────────────────────────────────────────────

function TriggerCard({ triggerMeta, selected, onClick }) {
  return (
    <div
      onClick={() => onClick(triggerMeta.type)}
      style={{
        border: `2px solid ${selected ? ACCENT : BORDER_COLOR}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        background: selected ? '#FFF1F3' : CARD_BG,
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{triggerMeta.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? ACCENT : TEXT_PRIMARY }}>{triggerMeta.label}</div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 3 }}>{triggerMeta.desc}</div>
      </div>
    </div>
  );
}

function TriggerConfig({ trigger, onChange }) {
  if (trigger.type === 'due_date_approaching') {
    return (
      <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: `1px solid ${BORDER_COLOR}` }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>提前幾天觸發</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            min={1}
            max={30}
            value={trigger.config.daysBefore || 3}
            onChange={e => onChange({ ...trigger, config: { ...trigger.config, daysBefore: parseInt(e.target.value) || 1 } })}
            style={{
              width: 70,
              padding: '6px 10px',
              border: `1px solid ${BORDER_COLOR}`,
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>天前觸發</span>
        </div>
      </div>
    );
  }
  if (trigger.type === 'status_changed') {
    return (
      <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: `1px solid ${BORDER_COLOR}` }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>狀態變更設定（可選）</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select
            value={trigger.config.from || ''}
            onChange={e => onChange({ ...trigger, config: { ...trigger.config, from: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none' }}
          >
            <option value="">任意狀態</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ color: TEXT_SECONDARY }}>→</span>
          <select
            value={trigger.config.to || ''}
            onChange={e => onChange({ ...trigger, config: { ...trigger.config, to: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none' }}
          >
            <option value="">任意狀態</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    );
  }
  if (trigger.type === 'field_changed') {
    return (
      <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: `1px solid ${BORDER_COLOR}` }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>選擇監控欄位</label>
        <select
          value={trigger.config.field || ''}
          onChange={e => onChange({ ...trigger, config: { ...trigger.config, field: e.target.value } })}
          style={{ marginTop: 8, width: '100%', padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none' }}
        >
          <option value="">請選擇欄位</option>
          {CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
    );
  }
  return null;
}

function ConditionRow({ condition, index, onChange, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={condition.field}
        onChange={e => onChange(index, { ...condition, field: e.target.value })}
        style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1, minWidth: 100 }}
      >
        <option value="">選擇欄位</option>
        {CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <select
        value={condition.operator}
        onChange={e => onChange(index, { ...condition, operator: e.target.value })}
        style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1, minWidth: 80 }}
      >
        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      <input
        value={condition.value}
        onChange={e => onChange(index, { ...condition, value: e.target.value })}
        placeholder="輸入值"
        style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, flex: 1, minWidth: 80, outline: 'none' }}
      />
      <button
        onClick={() => onRemove(index)}
        style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
      >×</button>
    </div>
  );
}

function ActionRow({ action, index, onChange, onRemove }) {
  const meta = ACTION_TYPES.find(a => a.type === action.type);

  const renderConfig = () => {
    switch (action.type) {
      case 'assign_task':
        return (
          <select
            value={action.config.member || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, member: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1 }}
          >
            <option value="">選擇成員</option>
            {MEMBER_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        );
      case 'set_status':
        return (
          <select
            value={action.config.status || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, status: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1 }}
          >
            <option value="">選擇狀態</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case 'set_priority':
        return (
          <select
            value={action.config.priority || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, priority: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1 }}
          >
            <option value="">選擇優先度</option>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        );
      case 'add_comment':
        return (
          <input
            value={action.config.text || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, text: e.target.value } })}
            placeholder="留言內容"
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, flex: 1, outline: 'none' }}
          />
        );
      case 'send_notification':
        return (
          <select
            value={action.config.recipient || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, recipient: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1 }}
          >
            <option value="">選擇接收人</option>
            {MEMBER_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        );
      case 'move_to_section':
        return (
          <select
            value={action.config.section || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, section: e.target.value } })}
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, background: '#fff', outline: 'none', flex: 1 }}
          >
            <option value="">選擇分節</option>
            {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case 'set_due_date':
        return (
          <input
            type="number"
            value={action.config.daysOffset || ''}
            onChange={e => onChange(index, { ...action, config: { ...action.config, daysOffset: parseInt(e.target.value) || 0 } })}
            placeholder="天數偏移（正=延後，負=提前）"
            style={{ padding: '6px 10px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 6, fontSize: 13, flex: 1, outline: 'none' }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{
        padding: '5px 10px',
        background: '#ECFDF5',
        border: '1px solid #A7F3D0',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        color: '#059669',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {meta ? `${meta.icon} ${meta.label}` : action.type}
      </div>
      {renderConfig()}
      <button
        onClick={() => onRemove(index)}
        style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
      >×</button>
    </div>
  );
}

function RuleBuilderModal({ editingRule, onSave, onClose }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(editingRule?.name || '');
  const [description, setDescription] = useState(editingRule?.description || '');
  const [trigger, setTrigger] = useState(editingRule?.trigger || { type: '', config: {} });
  const [conditions, setConditions] = useState(editingRule?.conditions || []);
  const [actions, setActions] = useState(editingRule?.actions || []);
  const [error, setError] = useState('');
  const [actionPickerOpen, setActionPickerOpen] = useState(false);

  const isEditing = !!editingRule;

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) { setError('請輸入規則名稱'); return; }
      if (!trigger.type) { setError('請選擇觸發器'); return; }
    }
    if (step === 3) {
      if (actions.length === 0) { setError('請至少新增一個動作'); return; }
    }
    setError('');
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(s => s - 1);
  };

  const handleSave = () => {
    if (actions.length === 0) { setError('請至少新增一個動作'); return; }
    setError('');
    const ruleData = {
      id: editingRule?.id || generateId(),
      name: name.trim(),
      description: description.trim(),
      enabled: editingRule?.enabled ?? true,
      trigger,
      conditions,
      actions,
      createdAt: editingRule?.createdAt || new Date().toISOString(),
      lastTriggered: editingRule?.lastTriggered || null,
      triggerCount: editingRule?.triggerCount || 0,
    };
    onSave(ruleData);
  };

  const addCondition = () => {
    setConditions(prev => [...prev, { field: '', operator: 'equals', value: '' }]);
  };
  const updateCondition = (i, val) => setConditions(prev => prev.map((c, idx) => idx === i ? val : c));
  const removeCondition = (i) => setConditions(prev => prev.filter((_, idx) => idx !== i));

  const addAction = (type) => {
    setActions(prev => [...prev, { type, config: {} }]);
    setActionPickerOpen(false);
  };
  const updateAction = (i, val) => setActions(prev => prev.map((a, idx) => idx === i ? val : a));
  const removeAction = (i) => setActions(prev => prev.filter((_, idx) => idx !== i));

  const STEP_LABELS = ['選擇觸發器', '新增條件', '選擇動作'];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: CARD_BG,
          borderRadius: 14,
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY }}>
              {isEditing ? '編輯規則' : '建立自動化規則'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: TEXT_SECONDARY }}>
              設定觸發條件與自動動作
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: TEXT_SECONDARY, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>

        {/* Step Indicator */}
        <div style={{ padding: '16px 24px 0', display: 'flex', gap: 0 }}>
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={stepNum} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isDone ? ACCENT : isActive ? ACCENT : '#E5E7EB',
                    color: (isDone || isActive) ? '#fff' : TEXT_SECONDARY,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {isDone ? '✓' : stepNum}
                  </div>
                  <span style={{ fontSize: 11, color: isActive ? ACCENT : TEXT_SECONDARY, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isDone ? ACCENT : '#E5E7EB', margin: '0 6px', marginBottom: 20 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Basic Info (always shown) */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 6 }}>規則名稱 *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：高優先任務自動指派"
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 6, marginTop: 14 }}>說明（可選）</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="描述這條規則的用途"
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Step 1: Trigger */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 12 }}>選擇觸發器 *</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {TRIGGER_TYPES.map(t => (
                  <TriggerCard
                    key={t.type}
                    triggerMeta={t}
                    selected={trigger.type === t.type}
                    onClick={type => setTrigger({ type, config: {} })}
                  />
                ))}
              </div>
              {trigger.type && <TriggerConfig trigger={trigger} onChange={setTrigger} />}
            </div>
          )}

          {/* Step 2: Conditions */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>新增條件（可選）</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 14 }}>
                條件讓規則只在特定情況下觸發，不加條件表示每次觸發器啟動時都執行。
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conditions.map((c, i) => (
                  <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: `1px solid ${BORDER_COLOR}` }}>
                    <ConditionRow condition={c} index={i} onChange={updateCondition} onRemove={removeCondition} />
                  </div>
                ))}
              </div>
              <button
                onClick={addCondition}
                style={{
                  marginTop: 12,
                  background: 'transparent',
                  border: `1px dashed ${BORDER_COLOR}`,
                  borderRadius: 8,
                  padding: '9px 16px',
                  fontSize: 13,
                  color: TEXT_SECONDARY,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER_COLOR; e.currentTarget.style.color = TEXT_SECONDARY; }}
              >+ 新增條件</button>
            </div>
          )}

          {/* Step 3: Actions */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>選擇動作 *</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 14 }}>
                可新增多個動作，觸發時將依序執行。
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actions.map((a, i) => (
                  <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: `1px solid ${BORDER_COLOR}` }}>
                    <ActionRow action={a} index={i} onChange={updateAction} onRemove={removeAction} />
                  </div>
                ))}
              </div>

              {/* Action picker */}
              {actionPickerOpen ? (
                <div style={{
                  marginTop: 10,
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 10,
                  background: CARD_BG,
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, background: '#F9FAFB', borderBottom: `1px solid ${BORDER_COLOR}` }}>
                    選擇動作類型
                  </div>
                  {ACTION_TYPES.map(at => (
                    <div
                      key={at.type}
                      onClick={() => addAction(at.type)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: TEXT_PRIMARY,
                        borderBottom: `1px solid ${BORDER_COLOR}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FFF1F3'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{at.icon}</span>
                      <span>{at.label}</span>
                    </div>
                  ))}
                  <div
                    onClick={() => setActionPickerOpen(false)}
                    style={{ padding: '8px 14px', fontSize: 12, color: TEXT_SECONDARY, cursor: 'pointer', textAlign: 'center' }}
                  >取消</div>
                </div>
              ) : (
                <button
                  onClick={() => setActionPickerOpen(true)}
                  style={{
                    marginTop: 12,
                    background: 'transparent',
                    border: `1px dashed ${BORDER_COLOR}`,
                    borderRadius: 8,
                    padding: '9px 16px',
                    fontSize: 13,
                    color: TEXT_SECONDARY,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER_COLOR; e.currentTarget.style.color = TEXT_SECONDARY; }}
                >+ 新增動作</button>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, color: '#DC2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${BORDER_COLOR}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={step === 1 ? onClose : handleBack}
            style={{
              background: 'transparent',
              border: `1px solid ${BORDER_COLOR}`,
              borderRadius: 8,
              padding: '9px 20px',
              fontSize: 14,
              color: TEXT_SECONDARY,
              cursor: 'pointer',
            }}
          >{step === 1 ? '取消' : '上一步'}</button>

          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: step === s ? ACCENT : '#D1D5DB',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          {step < 3 ? (
            <button
              onClick={handleNext}
              style={{
                background: ACCENT,
                border: 'none',
                borderRadius: 8,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
              }}
            >下一步 →</button>
          ) : (
            <button
              onClick={handleSave}
              style={{
                background: ACCENT,
                border: 'none',
                borderRadius: 8,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
              }}
            >{isEditing ? '儲存變更' : '建立規則'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: CARD_BG,
          borderRadius: 12,
          padding: '28px 32px',
          maxWidth: 380,
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: TEXT_PRIMARY }}>確認刪除規則？</h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: TEXT_SECONDARY }}>此操作無法復原，規則將永久刪除。</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{ background: 'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, padding: '9px 20px', fontSize: 14, color: TEXT_SECONDARY, cursor: 'pointer' }}
          >取消</button>
          <button
            onClick={onConfirm}
            style={{ background: '#EF4444', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
          >確認刪除</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const STORAGE_KEY = 'xcloud-rules';

  const [rules, setRules] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return DEFAULT_RULES;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'enabled' | 'disabled'
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch (_) {}
  }, [rules]);

  // Stats
  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const weeklyTriggers = rules.reduce((sum, r) => {
    if (!r.lastTriggered) return sum;
    const diff = Date.now() - new Date(r.lastTriggered).getTime();
    return diff < 7 * 24 * 3600 * 1000 ? sum + Math.min(r.triggerCount, 30) : sum;
  }, 0);
  const savedMinutes = weeklyTriggers * 5;

  // Filtered list
  const filteredRules = rules.filter(r => {
    const matchSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter =
      filterTab === 'all' ||
      (filterTab === 'enabled' && r.enabled) ||
      (filterTab === 'disabled' && !r.enabled);
    return matchSearch && matchFilter;
  });

  const handleToggle = useCallback((id, value) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: value } : r));
  }, []);

  const handleEdit = useCallback((rule) => {
    setEditingRule(rule);
    setShowModal(true);
  }, []);

  const handleDelete = useCallback((id) => {
    setDeleteTargetId(id);
  }, []);

  const confirmDelete = useCallback(() => {
    setRules(prev => prev.filter(r => r.id !== deleteTargetId));
    setDeleteTargetId(null);
  }, [deleteTargetId]);

  const handleSaveRule = useCallback((ruleData) => {
    setRules(prev => {
      const exists = prev.find(r => r.id === ruleData.id);
      if (exists) return prev.map(r => r.id === ruleData.id ? ruleData : r);
      return [...prev, ruleData];
    });
    setShowModal(false);
    setEditingRule(null);
  }, []);

  const handleOpenCreate = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  const FILTER_TABS = [
    { key: 'all', label: '全部', count: totalRules },
    { key: 'enabled', label: '已啟用', count: enabledRules },
    { key: 'disabled', label: '已停用', count: totalRules - enabledRules },
  ];

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, padding: '28px 32px', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: TEXT_PRIMARY, letterSpacing: -0.5 }}>
              自動化規則
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: TEXT_SECONDARY }}>
              當特定條件觸發時，自動執行動作
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            style={{
              background: ACCENT,
              border: 'none',
              borderRadius: 9,
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: '0 2px 8px rgba(196,18,48,0.3)',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(196,18,48,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(196,18,48,0.3)'; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            建立規則
          </button>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label="總規則數" value={totalRules} />
          <StatCard label="已啟用" value={enabledRules} color={ACCENT} />
          <StatCard label="本週觸發次數" value={weeklyTriggers} sub="近 7 天統計" />
          <StatCard
            label="預估節省工時"
            value={savedMinutes >= 60 ? `${(savedMinutes / 60).toFixed(1)}h` : `${savedMinutes}m`}
            sub="每次估 5 分鐘"
            color="#059669"
          />
        </div>

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: TEXT_SECONDARY, fontSize: 15, pointerEvents: 'none' }}>🔍</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋規則名稱或說明..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: 9,
                fontSize: 13,
                outline: 'none',
                background: CARD_BG,
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = ACCENT; }}
              onBlur={e => { e.currentTarget.style.borderColor = BORDER_COLOR; }}
            />
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', background: CARD_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: 9, padding: 3, gap: 2 }}>
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                style={{
                  background: filterTab === tab.key ? ACCENT : 'transparent',
                  border: 'none',
                  borderRadius: 7,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: filterTab === tab.key ? '#fff' : TEXT_SECONDARY,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                <span style={{
                  marginLeft: 5,
                  background: filterTab === tab.key ? 'rgba(255,255,255,0.25)' : '#F3F4F6',
                  color: filterTab === tab.key ? '#fff' : TEXT_SECONDARY,
                  borderRadius: 10,
                  padding: '0 6px',
                  fontSize: 11,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Rules List */}
        {filteredRules.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: TEXT_SECONDARY,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: TEXT_PRIMARY }}>
              {searchQuery ? '找不到符合的規則' : '尚無自動化規則'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              {searchQuery ? '嘗試使用不同的關鍵字搜尋' : '建立第一條規則，讓重複工作自動化'}
            </div>
            {!searchQuery && (
              <button
                onClick={handleOpenCreate}
                style={{
                  background: ACCENT,
                  border: 'none',
                  borderRadius: 9,
                  padding: '10px 22px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >+ 建立規則</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredRules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Footer info */}
        {filteredRules.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: TEXT_SECONDARY }}>
            顯示 {filteredRules.length} / {totalRules} 條規則
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <RuleBuilderModal
          editingRule={editingRule}
          onSave={handleSaveRule}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
        />
      )}
      {deleteTargetId && (
        <DeleteConfirmModal
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
}
