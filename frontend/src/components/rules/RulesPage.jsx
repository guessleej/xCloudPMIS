import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

// ─── Brand Colors ───────────────────────────────────────────────────────────
const RULES_API = '/api/rules';
const ACCENT = '#C70018';
const PAGE_BG = '#F4EEE9';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#141414';
const TEXT_SECONDARY = '#6B6461';
const BORDER_COLOR = '#E7DED8';

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
    projectIds: [],
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
    projectIds: [],
    trigger: { type: 'task_created', config: {} },
    conditions: [{ field: '優先度', operator: 'equals', value: '高' }],
    actions: [{ type: 'assign_task', config: { member: '' } }],
    createdAt: '2026-03-02T09:00:00Z',
    lastTriggered: '2026-03-13T11:20:00Z',
    triggerCount: 23,
  },
  {
    id: 'rule-3',
    name: '逾期提醒',
    description: '截止日前 3 天自動傳送提醒通知',
    enabled: true,
    projectIds: [],
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
    projectIds: [],
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
    projectIds: [],
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
    projectIds: [],
    trigger: { type: 'status_changed', config: {} },
    conditions: [],
    actions: [{ type: 'add_comment', config: { text: '狀態已更新，請查看最新進度。' } }],
    createdAt: '2026-03-06T13:00:00Z',
    lastTriggered: '2026-03-15T10:15:00Z',
    triggerCount: 61,
  },
];

const SYSTEM_RULE = {
  name: '拖曳到已完成欄位',
  description: '當使用者把任務拖進「已完成」欄位時，立即觸發系統規則。',
  triggerLabel: 'task.status.changed -> Completed',
  actions: [
    '將任務狀態標準化為 Completed / done',
    '沿著 subtask 鏈回填所有上層任務進度條',
    '通知追蹤該專案的成員與相關負責人',
  ],
};

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
      borderRadius: 18,
      padding: '18px 20px',
      flex: 1,
      minWidth: 120,
      boxShadow: '0 10px 24px rgba(20,20,20,0.05)',
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || TEXT_PRIMARY }}>{value}</div>
      <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SystemRuleSpotlight({ projectCount, rule }) {
  const spotlightRule = rule || {
    name: SYSTEM_RULE.name,
    description: SYSTEM_RULE.description,
    trigger: { type: 'status_changed', config: {} },
    triggerCount: 0,
    lastTriggered: null,
  };

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 24,
      padding: '22px 22px 20px',
      background: 'linear-gradient(135deg, #161112 0%, #6E0615 44%, #C70018 100%)',
      color: '#fff',
      boxShadow: '0 20px 48px rgba(20,20,20,0.18)',
    }}>
      <div style={{
        position: 'absolute',
        top: -70,
        right: -50,
        width: 210,
        height: 210,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,.2) 0%, rgba(255,255,255,0) 70%)',
      }} />
      <div style={{ position: 'relative', display: 'flex', gap: 18, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 240 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.74)' }}>
            Built-in Rule
          </div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {spotlightRule.name}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,.82)' }}>
            {spotlightRule.description}
          </div>
          <div style={{
            marginTop: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 999,
            background: 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.16)',
            fontSize: 12,
            fontWeight: 700,
          }}>
            <span>⚡</span>
            <span>{SYSTEM_RULE.triggerLabel}</span>
          </div>
        </div>

        <div style={{
          flex: '0 1 320px',
          minWidth: 240,
          background: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 18,
          padding: '16px 16px 14px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>
            執行結果
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {SYSTEM_RULE.actions.map(item => (
              <div key={item} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,.84)' }}>
                <span style={{ color: '#FFD9DE', fontWeight: 800 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,.12)',
            fontSize: 12,
            color: 'rgba(255,255,255,.76)',
          }}>
            目前可作用在 {projectCount || 0} 個專案的看板拖曳流程。
            <span style={{ marginLeft: 8 }}>
              已觸發 {spotlightRule.triggerCount || 0} 次
            </span>
            <span style={{ marginLeft: 8 }}>
              {spotlightRule.lastTriggered ? `最近：${formatRelativeTime(spotlightRule.lastTriggered)}` : '尚未觸發'}
            </span>
          </div>
        </div>
      </div>
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

function RuleCard({ rule, projects, onToggle, onEdit, onDelete }) {
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

        {/* Project scope badges */}
        {rule.projectIds && rule.projectIds.length > 0 && (() => {
          const linked = (rule.projects && rule.projects.length > 0
            ? rule.projects
            : rule.projectIds.map(pid => projects.find(p => String(p.id) === String(pid))).filter(Boolean));
          return linked.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {linked.map(p => (
                <span key={p.id} style={{
                  fontSize: 10, fontWeight: 500,
                  color: '#374151', background: '#F3F4F6',
                  borderRadius: 4, padding: '1px 7px',
                  border: '1px solid #D1D5DB',
                }}>📁 {p.name}</span>
              ))}
            </div>
          ) : null;
        })()}

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

function ActionRow({ action, index, onChange, onRemove, members }) {
  const meta = ACTION_TYPES.find(a => a.type === action.type);
  const memberList = members && members.length > 0
    ? members
    : MEMBER_OPTIONS.map(m => ({ id: m, name: m }));

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
            {memberList.map(m => (
              <option key={m.id ?? m.name} value={m.name}>{m.name}</option>
            ))}
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

function RuleBuilderModal({ editingRule, onSave, onClose, projects, members }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(editingRule?.name || '');
  const [description, setDescription] = useState(editingRule?.description || '');
  const [projectIds, setProjectIds] = useState((editingRule?.projectIds || []).map(String));
  const [trigger, setTrigger] = useState(editingRule?.trigger || { type: '', config: {} });
  const [conditions, setConditions] = useState(editingRule?.conditions || []);
  const [actions, setActions] = useState(editingRule?.actions || []);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);

  function toggleProject(pid) {
    const key = String(pid);
    setProjectIds(prev =>
      prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
    );
  }

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

  const handleSave = async () => {
    if (actions.length === 0) { setError('請至少新增一個動作'); return; }
    setError('');
    const ruleData = {
      ...(editingRule?.id ? { id: editingRule.id } : {}),
      name: name.trim(),
      description: description.trim(),
      enabled: editingRule?.enabled ?? true,
      projectIds,
      trigger,
      conditions,
      actions,
    };
    try {
      setSubmitting(true);
      await onSave(ruleData);
    } catch (saveError) {
      setError(saveError.message || '規則儲存失敗');
    } finally {
      setSubmitting(false);
    }
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

            {/* Project scope */}
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 6, marginTop: 14 }}>
              套用專案（可多選，不選則套用所有專案）
            </label>
            {projects.length === 0 ? (
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, fontStyle: 'italic' }}>載入中…</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {projects.map(p => {
                  const checked = projectIds.includes(String(p.id));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      style={{
                        padding: '4px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        border: `1.5px solid ${checked ? ACCENT : BORDER_COLOR}`,
                        background: checked ? '#FFF1F3' : '#F9FAFB',
                        color: checked ? ACCENT : TEXT_SECONDARY,
                        fontWeight: checked ? 600 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {checked ? '✓ ' : ''}{p.name}
                    </button>
                  );
                })}
              </div>
            )}
            {projectIds.length === 0 && projects.length > 0 && (
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 5 }}>
                ℹ️ 未選擇專案時，規則將套用至公司所有專案
              </div>
            )}
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
                    <ActionRow action={a} index={i} onChange={updateAction} onRemove={removeAction} members={members} />
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
            disabled={submitting}
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
              disabled={submitting}
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
                opacity: submitting ? 0.7 : 1,
              }}
              disabled={submitting}
            >{submitting ? '儲存中...' : (isEditing ? '儲存變更' : '建立規則')}</button>
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
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [rules, setRules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers]   = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'enabled' | 'disabled'
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const fetchRules = useCallback(async () => {
    if (!companyId) {
      setRules([]);
      setRulesLoading(false);
      return;
    }
    setRulesLoading(true);
    setRulesError('');

    try {
      const res = await fetch(`${RULES_API}?companyId=${companyId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '規則載入失敗');
      }
      setRules(data.data || []);
    } catch (error) {
      setRules([]);
      setRulesError(error.message);
    } finally {
      setRulesLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Fetch real projects
  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/projects?companyId=${companyId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const list = Array.isArray(data) ? data : (data.projects || data.data || []);
        setProjects(list);
      })
      .catch(() => setProjects([]));
  }, [companyId]);

  // Fetch real team members
  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/projects/users?companyId=${companyId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const list = Array.isArray(data) ? data : (data.users || data.data || []);
        setMembers(list);
      })
      .catch(() => setMembers([]));
  }, [companyId]);

  // Stats
  const systemRule = rules.find(r => r.isSystem) || null;
  const customRules = rules.filter(r => !r.isSystem);
  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const customRuleCount = customRules.length;
  const customEnabledRules = customRules.filter(r => r.enabled).length;
  const weeklyTriggers = rules.reduce((sum, r) => {
    if (!r.lastTriggered) return sum;
    const diff = Date.now() - new Date(r.lastTriggered).getTime();
    return diff < 7 * 24 * 3600 * 1000 ? sum + Math.min(r.triggerCount, 30) : sum;
  }, 0);
  const savedMinutes = weeklyTriggers * 5;

  // Filtered list
  const filteredRules = customRules.filter(r => {
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
    (async () => {
      try {
        const res = await fetch(`${RULES_API}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            enabled: value,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || '規則更新失敗');
        }
        await fetchRules();
      } catch (error) {
        alert(`規則更新失敗：${error.message}`);
      }
    })();
  }, [companyId, fetchRules]);

  const handleEdit = useCallback((rule) => {
    setEditingRule(rule);
    setShowModal(true);
  }, []);

  const handleDelete = useCallback((id) => {
    setDeleteTargetId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId) return;

    try {
      const res = await fetch(`${RULES_API}/${deleteTargetId}?companyId=${companyId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '規則刪除失敗');
      }
      setDeleteTargetId(null);
      await fetchRules();
    } catch (error) {
      alert(`規則刪除失敗：${error.message}`);
    }
  }, [companyId, deleteTargetId, fetchRules]);

  const handleSaveRule = useCallback(async (ruleData) => {
    const isEditing = Boolean(ruleData.id);
    const url = isEditing ? `${RULES_API}/${ruleData.id}` : RULES_API;
    const method = isEditing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        ...ruleData,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '規則儲存失敗');
    }

    setShowModal(false);
    setEditingRule(null);
    await fetchRules();
  }, [companyId, fetchRules]);

  const handleOpenCreate = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  const FILTER_TABS = [
    { key: 'all', label: '全部', count: customRuleCount },
    { key: 'enabled', label: '已啟用', count: customEnabledRules },
    { key: 'disabled', label: '已停用', count: customRuleCount - customEnabledRules },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #13090A 0%, #2A0C11 18%, #F4EEE9 18%, #F4EEE9 100%)',
      padding: '28px 32px 36px',
      boxSizing: 'border-box',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        <div style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          padding: '26px 28px',
          background: 'linear-gradient(135deg, #151112 0%, #6F0615 42%, #C70018 100%)',
          color: '#fff',
          boxShadow: '0 24px 56px rgba(20,20,20,.24)',
          marginBottom: 18,
        }}>
          <div style={{
            position: 'absolute',
            top: -90,
            right: -40,
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 70%)',
          }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 560px' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {['Rules', 'Automation', 'System Flow'].map((chip) => (
                  <span key={chip} style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.1)',
                    border: '1px solid rgba(255,255,255,.15)',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}>
                    {chip}
                  </span>
                ))}
              </div>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06 }}>
                自動化規則，現在有一條真正落地的系統級流程。
              </h1>
              <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,.82)', maxWidth: 680 }}>
                規則頁不再只是靜態設定表單。它現在會明確呈現當前內建規則如何接住看板拖曳事件，並把完成、父任務進度與通知三段動作串成同一條執行鏈。
              </p>
            </div>

            <button
              onClick={handleOpenCreate}
              style={{
                alignSelf: 'flex-start',
                background: '#fff',
                border: 'none',
                borderRadius: 999,
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 800,
                color: ACCENT,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                boxShadow: '0 14px 28px rgba(20,20,20,.18)',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              建立規則
            </button>
          </div>

          <div style={{ position: 'relative', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            <div style={{
              minWidth: 140,
              flex: '1 1 140px',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', textTransform: 'uppercase', letterSpacing: '.08em' }}>總規則數</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{totalRules}</div>
            </div>
            <div style={{
              minWidth: 140,
              flex: '1 1 140px',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', textTransform: 'uppercase', letterSpacing: '.08em' }}>已啟用</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{enabledRules}</div>
            </div>
            <div style={{
              minWidth: 140,
              flex: '1 1 140px',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', textTransform: 'uppercase', letterSpacing: '.08em' }}>本週觸發</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{weeklyTriggers}</div>
            </div>
            <div style={{
              minWidth: 140,
              flex: '1 1 140px',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', textTransform: 'uppercase', letterSpacing: '.08em' }}>節省工時</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>
                {savedMinutes >= 60 ? `${(savedMinutes / 60).toFixed(1)}h` : `${savedMinutes}m`}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SystemRuleSpotlight projectCount={projects.length} rule={systemRule} />
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="總規則數" value={totalRules} />
          <StatCard label="已啟用" value={enabledRules} color={ACCENT} />
          <StatCard label="本週觸發次數" value={weeklyTriggers} sub="近 7 天統計" />
          <StatCard
            label="預估節省工時"
            value={savedMinutes >= 60 ? `${(savedMinutes / 60).toFixed(1)}h` : `${savedMinutes}m`}
            sub="每次估 5 分鐘"
            color="#0D7A47"
          />
        </div>

        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '16px 18px',
          background: 'rgba(255,255,255,.8)',
          border: `1px solid ${BORDER_COLOR}`,
          borderRadius: 20,
          boxShadow: '0 12px 30px rgba(20,20,20,0.05)',
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: TEXT_SECONDARY, fontSize: 15, pointerEvents: 'none' }}>🔍</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋規則名稱或說明..."
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: 12,
                fontSize: 13,
                outline: 'none',
                background: CARD_BG,
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = ACCENT; }}
              onBlur={e => { e.currentTarget.style.borderColor = BORDER_COLOR; }}
            />
          </div>

          <div style={{ display: 'flex', background: CARD_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: 12, padding: 3, gap: 2 }}>
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                style={{
                  background: filterTab === tab.key ? ACCENT : 'transparent',
                  border: 'none',
                  borderRadius: 9,
                  padding: '7px 15px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: filterTab === tab.key ? '#fff' : TEXT_SECONDARY,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                <span style={{
                  marginLeft: 5,
                  background: filterTab === tab.key ? 'rgba(255,255,255,0.22)' : '#F3F0EC',
                  color: filterTab === tab.key ? '#fff' : TEXT_SECONDARY,
                  borderRadius: 10,
                  padding: '0 6px',
                  fontSize: 11,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {rulesError ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 20px',
            color: '#991B1B',
            background: '#FFF1F2',
            borderRadius: 24,
            border: '1px solid #FECDD3',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{rulesError}</div>
            <button
              onClick={fetchRules}
              style={{
                background: ACCENT,
                border: 'none',
                borderRadius: 999,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              重新載入規則
            </button>
          </div>
        ) : rulesLoading ? (
          <div style={{
            textAlign: 'center',
            padding: '56px 20px',
            color: TEXT_SECONDARY,
            background: 'rgba(255,255,255,.78)',
            borderRadius: 24,
            border: `1px solid ${BORDER_COLOR}`,
          }}>
            載入規則中...
          </div>
        ) : filteredRules.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '64px 20px',
            color: TEXT_SECONDARY,
            background: 'rgba(255,255,255,.78)',
            borderRadius: 24,
            border: `1px solid ${BORDER_COLOR}`,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: TEXT_PRIMARY }}>
              {searchQuery ? '找不到符合的規則' : '尚無自訂自動化規則'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              {searchQuery ? '嘗試使用不同的關鍵字搜尋' : '系統規則已落庫，你可以再建立自己的自訂規則'}
            </div>
            {!searchQuery && (
              <button
                onClick={handleOpenCreate}
                style={{
                  background: ACCENT,
                  border: 'none',
                  borderRadius: 999,
                  padding: '10px 22px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >+ 建立規則</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredRules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                projects={projects}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!rulesLoading && !rulesError && filteredRules.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: TEXT_SECONDARY }}>
            顯示 {filteredRules.length} / {customRuleCount} 條自訂規則
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <RuleBuilderModal
          editingRule={editingRule}
          onSave={handleSaveRule}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
          projects={projects}
          members={members}
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
