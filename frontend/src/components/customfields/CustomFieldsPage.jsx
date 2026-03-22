/**
 * CustomFieldsPage — 自訂欄位管理頁面
 *
 * 功能：
 *   - 瀏覽 / 搜尋 / 篩選自訂欄位（卡片 & 表格 兩種視圖）
 *   - 新增 / 編輯 / 刪除欄位
 *   - localStorage 持久化（key: 'xcloud-custom-fields'）
 *   - 從 API 取得專案列表供選擇應用專案
 *
 * 設計令牌：
 *   accent  : #C41230  (xCloud red)
 *   pageBg  : #F7F2F2
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

// ── 常數 ────────────────────────────────────────────────────────
const API_BASE   = '';
const LS_KEY     = 'xcloud-custom-fields';
const T = {
  pageBg: 'var(--xc-bg)',
  surface: 'var(--xc-surface)',
  surfaceSoft: 'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  surfaceStrong: 'var(--xc-surface-strong)',
  border: 'var(--xc-border)',
  borderStrong: 'var(--xc-border-strong)',
  text: 'var(--xc-text)',
  textSoft: 'var(--xc-text-soft)',
  textMuted: 'var(--xc-text-muted)',
  shadow: 'var(--xc-shadow)',
  shadowStrong: 'var(--xc-shadow-strong)',
  brand: 'var(--xc-brand)',
  brandSoft: 'var(--xc-brand-soft)',
};

// ── 欄位類型定義 ─────────────────────────────────────────────────
const FIELD_TYPES = [
  { value: 'text',     label: '文字',   icon: 'T',  color: '#3b82f6', bg: '#eff6ff' },
  { value: 'number',   label: '數字',   icon: '#',  color: '#10b981', bg: '#ecfdf5' },
  { value: 'select',   label: '下拉',   icon: '▾',  color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'date',     label: '日期',   icon: '📅', color: '#f97316', bg: '#fff7ed' },
  { value: 'checkbox', label: '勾選',   icon: '✓',  color: '#14b8a6', bg: '#f0fdfa' },
  { value: 'currency', label: '貨幣',   icon: '$',  color: '#eab308', bg: '#fefce8' },
  { value: 'people',   label: '人員',   icon: '👤', color: '#ef4444', bg: '#fef2f2' },
];

const TYPE_MAP = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t]));

const TYPE_FILTER_TABS = [
  { value: 'all',      label: '全部' },
  { value: 'text',     label: '文字' },
  { value: 'number',   label: '數字' },
  { value: 'select',   label: '下拉' },
  { value: 'date',     label: '日期' },
  { value: 'people',   label: '人員' },
];

// ── 種子資料 ──────────────────────────────────────────────────────
function buildSeedData() {
  const now = new Date().toISOString();
  return [
    {
      id: 'cf-1',
      name: '優先層級',
      type: 'select',
      description: '任務的優先等級',
      options: ['緊急', '高', '中', '低'],
      global: true,
      usedInProjects: [],   // 使用真實專案 ID（由用戶在 Modal 中選擇）
      createdAt: now,
      createdBy: '',
    },
    {
      id: 'cf-2',
      name: '預估工時',
      type: 'number',
      description: '完成任務所需的預估小時數',
      options: [],
      global: false,
      usedInProjects: [],
      createdAt: now,
      createdBy: '',
    },
    {
      id: 'cf-3',
      name: '客戶公司',
      type: 'text',
      description: '',
      options: [],
      global: false,
      usedInProjects: [],
      createdAt: now,
      createdBy: '',
    },
    {
      id: 'cf-4',
      name: '負責部門',
      type: 'select',
      description: '負責執行此任務的部門',
      options: ['工程部', '設計部', '行銷部', '業務部', 'PM部'],
      global: true,
      usedInProjects: [],
      createdAt: now,
      createdBy: '',
    },
    {
      id: 'cf-5',
      name: '截止預算',
      type: 'currency',
      description: '',
      options: [],
      global: false,
      usedInProjects: [],
      createdAt: now,
      createdBy: '',
    },
    {
      id: 'cf-6',
      name: '審核人員',
      type: 'people',
      description: '負責審核此任務結果的人員',
      options: [],
      global: true,
      usedInProjects: [],
      createdAt: now,
      createdBy: '',
    },
  ];
}

function loadFields() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 遷移：如果 usedInProjects 含有字串名稱（舊格式），清空為空陣列
      const migrated = parsed.map(f => ({
        ...f,
        usedInProjects: (f.usedInProjects || []).filter(v => typeof v === 'number' || /^\d+$/.test(String(v))),
      }));
      return migrated;
    }
  } catch (_) { /* ignore */ }
  const seed = buildSeedData();
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}

function saveFields(fields) {
  localStorage.setItem(LS_KEY, JSON.stringify(fields));
}

function genId() {
  return 'cf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════════
// 子元件
// ════════════════════════════════════════════════════════════════

/** TypeIcon：顯示欄位類型的圓形圖示 */
function TypeIcon({ type, size = 36 }) {
  const def = TYPE_MAP[type] || TYPE_MAP.text;
  return (
    <div style={{
      width:          size,
      height:         size,
      borderRadius:   size / 2,
      background:     def.bg,
      border:         `2px solid ${def.color}22`,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontSize:       size * 0.4,
      color:          def.color,
      fontWeight:     700,
      flexShrink:     0,
      userSelect:     'none',
    }}>
      {def.icon}
    </div>
  );
}

/** TypeBadge：小型類型標籤 */
function TypeBadge({ type }) {
  const def = TYPE_MAP[type] || TYPE_MAP.text;
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          4,
      padding:      '2px 8px',
      borderRadius: 99,
      background:   def.bg,
      color:        def.color,
      fontSize:     12,
      fontWeight:   600,
    }}>
      <span style={{ fontSize: 10 }}>{def.icon}</span>
      {def.label}
    </span>
  );
}

/**
 * ProjectLinks — 可點擊的專案標籤列
 * 直接顯示專案名稱（非 hover），點擊跳轉到對應專案看板
 */
function ProjectLinks({ linkedProjects = [], onGoToProject }) {
  if (linkedProjects.length === 0) {
    return (
      <span style={{
        fontSize: 12, color: T.textMuted,
        fontStyle: 'italic', display: 'inline-block',
      }}>未套用至任何專案</span>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {linkedProjects.map(p => (
        <button
          key={p.id}
          onClick={() => onGoToProject(p.id)}
          title={`前往「${p.name}」任務看板`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 99,
            background: 'var(--xc-info-soft)', border: `1px solid ${T.borderStrong}`,
            color: 'var(--xc-info)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = T.surfaceMuted;
            e.currentTarget.style.borderColor = T.borderStrong;
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'var(--xc-info-soft)';
            e.currentTarget.style.borderColor = T.borderStrong;
          }}
        >
          📁 {p.name}
          <span style={{ fontSize: 10, opacity: 0.6 }}>↗</span>
        </button>
      ))}
    </div>
  );
}

/** OptionChip */
function OptionChip({ label, onRemove }) {
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          4,
      padding:      '2px 8px',
      borderRadius: 99,
      background:   T.surfaceMuted,
      color:        T.textSoft,
      fontSize:     12,
      fontWeight:   500,
    }}>
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border:     'none',
            padding:    0,
            cursor:     'pointer',
            color:      T.textMuted,
            fontSize:   14,
            lineHeight: 1,
            display:    'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// 欄位類型 → 使用位置描述
const FIELD_LOCATION = {
  text:     '任務詳情 · 文字輸入',
  number:   '任務詳情 · 數值輸入',
  select:   '任務詳情 · 下拉選單',
  date:     '任務詳情 · 日期選擇',
  checkbox: '任務詳情 · 勾選框',
  currency: '任務詳情 · 金額輸入',
  people:   '任務詳情 · 人員指派',
};

/** FieldCard — 卡片視圖的單一欄位卡 */
function FieldCard({ field, onEdit, onDelete, projects = [], onGoToProject }) {
  const linkedProjects = field.usedInProjects
    .map(pid => projects.find(p => String(p.id) === String(pid)))
    .filter(Boolean);
  const [hovered, setHovered] = useState(false);
  const def = TYPE_MAP[field.type] || TYPE_MAP.text;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   T.surface,
        borderRadius: 12,
        border:       `1.5px solid ${hovered ? def.color + '55' : T.border}`,
        padding:      20,
        display:      'flex',
        flexDirection: 'column',
        gap:          12,
        cursor:       'default',
        transition:   'border-color 0.2s, box-shadow 0.2s',
        boxShadow:    hovered
          ? `0 4px 20px ${def.color}18`
          : T.shadow,
        position:     'relative',
      }}
    >
      {/* 全域標記 */}
      {field.global && (
        <span style={{
          position:     'absolute',
          top:          12,
          right:        12,
          padding:      '2px 7px',
          borderRadius: 99,
          background:   '#fef3c7',
          color:        '#92400e',
          fontSize:     11,
          fontWeight:   600,
        }}>
          全域
        </span>
      )}

      {/* 標頭：圖示 + 名稱 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TypeIcon type={field.type} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight:   700,
            fontSize:     15,
            color:        T.text,
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
          }}>
            {field.name}
          </div>
          <TypeBadge type={field.type} />
        </div>
      </div>

      {/* 說明 */}
      {field.description && (
        <p style={{
          margin:       0,
          fontSize:     13,
          color:        T.textSoft,
          lineHeight:   1.5,
          display:      '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:     'hidden',
        }}>
          {field.description}
        </p>
      )}

      {/* Select 選項預覽 */}
      {field.type === 'select' && field.options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {field.options.slice(0, 3).map(opt => (
            <OptionChip key={opt} label={opt} />
          ))}
          {field.options.length > 3 && (
              <span style={{ fontSize: 12, color: T.textMuted, alignSelf: 'center' }}>
              +{field.options.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 套用專案區塊 */}
      <div style={{
        marginTop: 'auto',
        paddingTop: 10,
        borderTop: `1px solid ${T.border}`,
      }}>
        {/* 使用位置標示 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.textSoft,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>使用位置</span>
          <span style={{
            fontSize: 11, color: T.textMuted,
            background: T.surfaceMuted, borderRadius: 4, padding: '1px 6px',
          }}>
            {FIELD_LOCATION[field.type] || '任務詳情'}
          </span>
        </div>

        {/* 套用的專案（可點擊跳轉） */}
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: T.textSoft,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5,
          }}>套用專案</div>
          <ProjectLinks linkedProjects={linkedProjects} onGoToProject={onGoToProject} />
        </div>

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <ActionBtn label="編輯" onClick={() => onEdit(field)} color="#3b82f6" />
          <ActionBtn label="刪除" onClick={() => onDelete(field)} color="#ef4444" />
        </div>
      </div>
    </div>
  );
}

/** ActionBtn — 小型操作按鈕 */
function ActionBtn({ label, onClick, color }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding:      '4px 10px',
        borderRadius: 6,
        border:       `1px solid ${color}`,
        background:   hov ? color : T.surfaceStrong,
        color:        hov ? '#fff' : color,
        fontSize:     12,
        fontWeight:   600,
        cursor:       'pointer',
        transition:   'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

/** TableView — 表格視圖 */
function TableView({ fields, onEdit, onDelete, projects = [], onGoToProject }) {
  const thStyle = {
    padding:        '10px 14px',
    textAlign:      'left',
    fontSize:       12,
    fontWeight:     600,
    color:          T.textSoft,
    background:     T.surfaceSoft,
    borderBottom:   `1px solid ${T.border}`,
    whiteSpace:     'nowrap',
  };
  const tdStyle = {
    padding:      '12px 14px',
    fontSize:     13,
    color:        T.textSoft,
    borderBottom: `1px solid ${T.border}`,
    verticalAlign: 'middle',
  };

  return (
    <div style={{
      background:   T.surface,
      borderRadius: 12,
      border:       `1px solid ${T.border}`,
      overflow:     'hidden',
      boxShadow:    T.shadow,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>欄位名稱</th>
            <th style={thStyle}>類型</th>
            <th style={thStyle}>說明</th>
            <th style={thStyle}>使用位置</th>
            <th style={thStyle}>套用專案 <span style={{ color: T.textMuted, fontWeight: 400 }}>(可點擊跳轉)</span></th>
            <th style={thStyle}>建立者</th>
            <th style={thStyle}>建立時間</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, idx) => (
            <TableRow
              key={f.id}
              field={f}
              tdStyle={tdStyle}
              onEdit={onEdit}
              onDelete={onDelete}
              isLast={idx === fields.length - 1}
              projects={projects}
              onGoToProject={onGoToProject}
            />
          ))}
          {fields.length === 0 && (
            <tr>
              <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: T.textMuted, padding: 40 }}>
                沒有符合條件的欄位
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({ field, tdStyle, onEdit, onDelete, isLast, projects = [], onGoToProject }) {
  const [hov, setHov] = useState(false);
  const lastStyle = isLast ? { borderBottom: 'none' } : {};
  const linkedProjects = field.usedInProjects
    .map(pid => projects.find(p => String(p.id) === String(pid)))
    .filter(Boolean);

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? T.surfaceSoft : T.surface, transition: 'background 0.15s' }}
    >
      <td style={{ ...tdStyle, ...lastStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TypeIcon type={field.type} size={28} />
          <span style={{ fontWeight: 600, color: T.text }}>{field.name}</span>
          {field.global && (
            <span style={{
              padding:      '1px 6px',
              borderRadius: 99,
              background:   '#fef3c7',
              color:        '#92400e',
              fontSize:     10,
              fontWeight:   600,
            }}>
              全域
            </span>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, ...lastStyle }}>
        <TypeBadge type={field.type} />
      </td>
      <td style={{ ...tdStyle, ...lastStyle, maxWidth: 180 }}>
        <span style={{
          display:      '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:     'hidden',
          color:        field.description ? T.textSoft : T.textMuted,
        }}>
          {field.description || '—'}
        </span>
      </td>
      {/* 使用位置欄 */}
      <td style={{ ...tdStyle, ...lastStyle }}>
        <span style={{
          fontSize: 11, color: T.textSoft,
          background: T.surfaceMuted, borderRadius: 4, padding: '2px 7px',
          whiteSpace: 'nowrap',
        }}>
          {FIELD_LOCATION[field.type] || '任務詳情'}
        </span>
      </td>
      {/* 套用專案欄（可點擊跳轉） */}
      <td style={{ ...tdStyle, ...lastStyle, maxWidth: 240 }}>
        <ProjectLinks linkedProjects={linkedProjects} onGoToProject={onGoToProject} />
      </td>
      <td style={{ ...tdStyle, ...lastStyle, color: T.textSoft }}>{field.createdBy || '—'}</td>
      <td style={{ ...tdStyle, ...lastStyle, color: T.textSoft }}>{formatDate(field.createdAt)}</td>
      <td style={{ ...tdStyle, ...lastStyle, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <ActionBtn label="編輯" onClick={() => onEdit(field)} color="#3b82f6" />
          <ActionBtn label="刪除" onClick={() => onDelete(field)} color="#ef4444" />
        </div>
      </td>
    </tr>
  );
}

/** TagInput — 選項標籤輸入 */
function TagInput({ options, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  function addOption() {
    const val = inputVal.trim();
    if (val && !options.includes(val)) {
      onChange([...options, val]);
    }
    setInputVal('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOption();
    } else if (e.key === 'Backspace' && !inputVal && options.length > 0) {
      onChange(options.slice(0, -1));
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display:     'flex',
        flexWrap:    'wrap',
        gap:         6,
        padding:     '8px 10px',
        borderRadius: 8,
        border:      '1.5px solid #d1d5db',
        background:  '#fff',
        cursor:      'text',
        minHeight:   42,
        alignItems:  'center',
      }}
    >
      {options.map(opt => (
        <OptionChip
          key={opt}
          label={opt}
          onRemove={() => onChange(options.filter(o => o !== opt))}
        />
      ))}
      <input
        ref={inputRef}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addOption}
        placeholder={options.length === 0 ? '輸入選項後按 Enter 新增…' : ''}
        style={{
          border:     'none',
          outline:    'none',
          fontSize:   13,
          padding:    '2px 0',
          flex:       1,
          minWidth:   120,
          background: 'transparent',
          color:      '#111827',
        }}
      />
    </div>
  );
}

/** DeleteConfirmModal */
function DeleteConfirmModal({ field, onConfirm, onCancel }) {
  return (
    <Overlay onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   T.surface,
          borderRadius: 16,
          padding:      32,
          width:        420,
          maxWidth:     '90vw',
          boxShadow:    T.shadowStrong,
          border:       `1px solid ${T.border}`,
          textAlign:    'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: T.text }}>
          刪除自訂欄位
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: T.textSoft, lineHeight: 1.6 }}>
          確定要刪除「<strong style={{ color: T.text }}>{field.name}</strong>」嗎？
          {field.usedInProjects.length > 0 && (
            <><br />此欄位目前應用於 <strong>{field.usedInProjects.length}</strong> 個專案。</>
          )}
          <br />此操作無法復原。
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding:      '9px 22px',
              borderRadius: 8,
              border:       `1.5px solid ${T.border}`,
              background:   T.surfaceStrong,
              color:        T.textSoft,
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding:      '9px 22px',
              borderRadius: 8,
              border:       'none',
              background:   '#ef4444',
              color:        '#fff',
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            確認刪除
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/** Overlay backdrop */
function Overlay({ children, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.45)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          1000,
        backdropFilter:  'blur(2px)',
      }}
    >
      {children}
    </div>
  );
}

/** FieldModal — 新增 / 編輯欄位 Modal */
function FieldModal({ field, projects, onSave, onClose, userName = '我' }) {
  const isEdit = Boolean(field?.id);

  const [name, setName]             = useState(field?.name || '');
  const [type, setType]             = useState(field?.type || 'text');
  const [description, setDesc]      = useState(field?.description || '');
  const [options, setOptions]       = useState(field?.options || []);
  const [global, setGlobal]         = useState(field?.global ?? false);
  const [usedIn, setUsedIn]         = useState(field?.usedInProjects || []);
  const [nameErr, setNameErr]       = useState('');

  function handleTypeChange(newType) {
    setType(newType);
    if (newType !== 'select') setOptions([]);
  }

  // 改用 project ID（不用 name），確保與後端資料一致
  function toggleProject(pId) {
    const id = String(pId);
    setUsedIn(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function handleSave() {
    if (!name.trim()) {
      setNameErr('欄位名稱為必填');
      return;
    }
    const now = new Date().toISOString();
    const saved = {
      id:             field?.id || genId(),
      name:           name.trim(),
      type,
      description:    description.trim(),
      options:        type === 'select' ? options : [],
      global,
      usedInProjects: usedIn,
      createdAt:      field?.createdAt || now,
      createdBy:      field?.createdBy || userName,
    };
    onSave(saved);
  }

  const inputStyle = {
    width:        '100%',
    padding:      '9px 12px',
    borderRadius: 8,
    border:       `1.5px solid ${T.borderStrong}`,
    fontSize:     14,
    color:        T.text,
    outline:      'none',
    boxSizing:    'border-box',
    background:   T.surfaceStrong,
  };

  const labelStyle = {
    display:      'block',
    fontSize:     13,
    fontWeight:   600,
    color:        T.textSoft,
    marginBottom: 6,
  };

  return (
    <Overlay onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   T.surface,
          borderRadius: 16,
          width:        580,
          maxWidth:     '95vw',
          maxHeight:    '90vh',
          overflowY:    'auto',
          boxShadow:    T.shadowStrong,
          border:       `1px solid ${T.border}`,
          display:      'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modal 標頭 */}
        <div style={{
          padding:      '20px 24px 16px',
          borderBottom: `1px solid ${T.border}`,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          position:     'sticky',
          top:          0,
          background:   T.surface,
          zIndex:       1,
          borderRadius: '16px 16px 0 0',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
              {isEdit ? '編輯自訂欄位' : '新增自訂欄位'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: T.textMuted }}>
              {isEdit ? '修改欄位設定' : '建立新的追蹤欄位'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   22,
              color:      T.textMuted,
              lineHeight: 1,
              padding:    4,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal 主體 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 欄位名稱 */}
          <div>
            <label style={labelStyle}>
              欄位名稱 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setNameErr(''); }}
              placeholder="例如：優先層級、預估工時…"
              style={{
                ...inputStyle,
                borderColor: nameErr ? '#ef4444' : '#d1d5db',
              }}
            />
            {nameErr && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{nameErr}</p>
            )}
          </div>

          {/* 欄位類型 */}
          <div>
            <label style={labelStyle}>欄位類型</label>
            <div style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap:                 8,
            }}>
              {FIELD_TYPES.map(ft => {
                const selected = type === ft.value;
                return (
                  <button
                    key={ft.value}
                    onClick={() => handleTypeChange(ft.value)}
                    style={{
                      display:        'flex',
                      flexDirection:  'column',
                      alignItems:     'center',
                      gap:            6,
                      padding:        '10px 6px',
                      borderRadius:   10,
                      border:         `2px solid ${selected ? ft.color : '#e5e7eb'}`,
                      background:     selected ? ft.bg : '#fff',
                      cursor:         'pointer',
                      transition:     'all 0.15s',
                    }}
                  >
                    <span style={{
                      width:          32,
                      height:         32,
                      borderRadius:   16,
                      background:     ft.bg,
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      fontSize:       14,
                      color:          ft.color,
                      fontWeight:     700,
                      border:         `1.5px solid ${ft.color}33`,
                    }}>
                      {ft.icon}
                    </span>
                    <span style={{
                      fontSize:   12,
                      fontWeight: selected ? 700 : 500,
                      color:      selected ? ft.color : '#6b7280',
                    }}>
                      {ft.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 說明 */}
          <div>
            <label style={labelStyle}>說明（選填）</label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="說明此欄位的用途…"
              rows={3}
              style={{
                ...inputStyle,
                resize:     'vertical',
                lineHeight: 1.5,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* 下拉選項 */}
          {type === 'select' && (
            <div>
              <label style={labelStyle}>選項清單</label>
              <TagInput options={options} onChange={setOptions} />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                輸入選項文字後按 Enter 或失焦新增
              </p>
            </div>
          )}

          {/* 應用專案 */}
          {projects.length > 0 && (
            <div>
              <label style={labelStyle}>應用專案（選填）</label>
              <div style={{
                border:       '1.5px solid #e5e7eb',
                borderRadius: 8,
                padding:      12,
                maxHeight:    140,
                overflowY:    'auto',
                display:      'flex',
                flexWrap:     'wrap',
                gap:          8,
              }}>
                {projects.map(p => {
                  const selected = usedIn.includes(String(p.id));
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      style={{
                        padding:      '4px 12px',
                        borderRadius: 99,
                        border:       `1.5px solid ${selected ? T.brand : T.border}`,
                        background:   selected ? 'var(--xc-danger-soft)' : T.surfaceStrong,
                        color:        selected ? T.brand : T.textSoft,
                        fontSize:     13,
                        fontWeight:   selected ? 600 : 400,
                        cursor:       'pointer',
                        transition:   'all 0.15s',
                      }}
                    >
                      {selected && '✓ '}{p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 全域欄位切換 */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'space-between',
            padding:      '14px 16px',
            borderRadius: 10,
            background:   T.surfaceSoft,
            border:       `1px solid ${T.border}`,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                加入全域欄位庫
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                開啟後，所有專案均可使用此欄位
              </div>
            </div>
            <ToggleSwitch checked={global} onChange={setGlobal} />
          </div>
        </div>

        {/* Modal 底部按鈕 */}
        <div style={{
          padding:        '14px 24px',
          borderTop:      `1px solid ${T.border}`,
          display:        'flex',
          justifyContent: 'flex-end',
          gap:            10,
          position:       'sticky',
          bottom:         0,
          background:     T.surface,
          borderRadius:   '0 0 16px 16px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding:      '9px 22px',
              borderRadius: 8,
              border:       `1.5px solid ${T.border}`,
              background:   T.surfaceStrong,
              color:        T.textSoft,
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            style={{
              padding:      '9px 24px',
              borderRadius: 8,
              border:       'none',
              background:   '#C41230',
              color:        '#fff',
              fontSize:     14,
              fontWeight:   700,
              cursor:       'pointer',
            }}
          >
            {isEdit ? '儲存變更' : '建立欄位'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/** ToggleSwitch */
function ToggleSwitch({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width:        44,
        height:       24,
        borderRadius: 12,
        background:   checked ? '#C41230' : T.borderStrong,
        cursor:       'pointer',
        position:     'relative',
        transition:   'background 0.2s',
        flexShrink:   0,
      }}
    >
      <div style={{
        position:   'absolute',
        top:        3,
        left:       checked ? 23 : 3,
        width:      18,
        height:     18,
        borderRadius: 9,
        background: T.surfaceStrong,
        boxShadow:  '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

/** EmptyState */
function EmptyState({ onAdd }) {
  return (
    <div style={{
      textAlign:  'center',
      padding:    '80px 24px',
      color:      T.textMuted,
    }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: T.textSoft }}>
        尚無自訂欄位
      </h3>
      <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }}>
        建立自訂欄位來追蹤優先度、工時、階段等<br />客製化專案資料
      </p>
      <button
        onClick={onAdd}
        style={{
          padding:      '10px 24px',
          borderRadius: 8,
          border:       'none',
          background:   '#C41230',
          color:        '#fff',
          fontSize:     14,
          fontWeight:   700,
          cursor:       'pointer',
        }}
      >
        + 新增第一個欄位
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════════

export default function CustomFieldsPage({ onNavigate }) {
  const { user } = useAuth();
  const COMPANY_ID = user?.companyId;

  // 跳轉到指定專案的看板
  const handleGoToProject = (projectId) => {
    if (projectId) {
      sessionStorage.setItem('xcloud-open-project', String(projectId));
    }
    if (onNavigate) {
      onNavigate('projects');
    } else {
      window.location.hash = '#projects';
    }
  };

  const [fields, setFields]           = useState([]);
  const [projects, setProjects]       = useState([]);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [viewMode, setViewMode]       = useState('card'); // 'card' | 'table'
  const [showModal, setShowModal]     = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── 載入資料 ───────────────────────────────────────────────
  useEffect(() => {
    setFields(loadFields());
  }, []);

  useEffect(() => {
    if (!COMPANY_ID) return;
    fetch(`${API_BASE}/api/projects?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.projects)
          ? data.projects
          : [];
        setProjects(list.map(p => ({ id: p.id, name: p.name })));
      })
      .catch(() => setProjects([]));   // API 不可用時不填入假資料
  }, [COMPANY_ID]);

  // ── 篩選邏輯 ───────────────────────────────────────────────
  const filtered = fields.filter(f => {
    const matchSearch = !search ||
      f.name.includes(search) ||
      f.description.includes(search);
    const matchType = typeFilter === 'all' || f.type === typeFilter;
    return matchSearch && matchType;
  });

  // ── CRUD ───────────────────────────────────────────────────
  function handleSave(saved) {
    setFields(prev => {
      const exists = prev.find(f => f.id === saved.id);
      const next = exists
        ? prev.map(f => f.id === saved.id ? saved : f)
        : [...prev, saved];
      saveFields(next);
      return next;
    });
    setShowModal(false);
    setEditTarget(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    setFields(prev => {
      const next = prev.filter(f => f.id !== deleteTarget.id);
      saveFields(next);
      return next;
    });
    setDeleteTarget(null);
  }

  function openCreate() {
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(field) {
    setEditTarget(field);
    setShowModal(true);
  }

  // ── 渲染 ───────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:  '100vh',
      background: T.pageBg,
      fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
    }}>
      <div style={{
        maxWidth: 1200,
        margin:   '0 auto',
        padding:  '32px 24px 60px',
      }}>

        {/* ── 頁面頂部 ─────────────────────────────────────── */}
        <div style={{
          display:        'flex',
          alignItems:     'flex-end',
          justifyContent: 'space-between',
          marginBottom:   28,
          flexWrap:       'wrap',
          gap:            16,
        }}>
          <div>
            <h1 style={{
              margin:     0,
              fontSize:   26,
              fontWeight: 800,
              color:      T.text,
              letterSpacing: '-0.5px',
            }}>
              自訂欄位
            </h1>
            <p style={{
              margin:   '4px 0 0',
              fontSize: 14,
              color:    T.textMuted,
            }}>
              追蹤優先度 · 階段 · 工時等客製化資料
            </p>
          </div>

          <button
            onClick={openCreate}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          6,
              padding:      '10px 20px',
              borderRadius: 10,
              border:       'none',
              background:   T.brand,
              color:        '#fff',
              fontSize:     14,
              fontWeight:   700,
              cursor:       'pointer',
              boxShadow:    T.shadow,
              whiteSpace:   'nowrap',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            新增欄位
          </button>
        </div>

        {/* ── 篩選列 ───────────────────────────────────────── */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:         12,
          marginBottom: 24,
          flexWrap:    'wrap',
        }}>
          {/* 搜尋框 */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <span style={{
              position:   'absolute',
              left:       12,
              top:        '50%',
              transform:  'translateY(-50%)',
              fontSize:   15,
              color:      T.textMuted,
              pointerEvents: 'none',
            }}>
              🔍
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜尋欄位名稱…"
              style={{
                width:        '100%',
                padding:      '9px 12px 9px 36px',
                borderRadius: 8,
                border:       '1.5px solid #e5e7eb',
                background:   '#fff',
                fontSize:     14,
                color:        '#111827',
                outline:      'none',
                boxSizing:    'border-box',
              }}
            />
          </div>

          {/* 類型篩選 Tabs */}
          <div style={{
            display:     'flex',
            gap:         4,
            background:  '#fff',
            border:      '1.5px solid #e5e7eb',
            borderRadius: 10,
            padding:     4,
          }}>
            {TYPE_FILTER_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setTypeFilter(tab.value)}
                style={{
                  padding:      '6px 12px',
                  borderRadius: 7,
                  border:       'none',
                  background:   typeFilter === tab.value ? '#C41230' : 'transparent',
                  color:        typeFilter === tab.value ? '#fff' : '#6b7280',
                  fontSize:     13,
                  fontWeight:   typeFilter === tab.value ? 700 : 500,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                  whiteSpace:   'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 視圖切換 */}
          <div style={{
            display:     'flex',
            gap:         2,
            background:  '#fff',
            border:      '1.5px solid #e5e7eb',
            borderRadius: 8,
            padding:     3,
            marginLeft:  'auto',
          }}>
            <ViewToggleBtn
              active={viewMode === 'card'}
              onClick={() => setViewMode('card')}
              icon="⊞"
              label="卡片"
            />
            <ViewToggleBtn
              active={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              icon="☰"
              label="表格"
            />
          </div>
        </div>

        {/* ── 統計列 ───────────────────────────────────────── */}
        <div style={{
          display:     'flex',
          gap:         12,
          marginBottom: 20,
          flexWrap:    'wrap',
        }}>
          <StatChip label="全部欄位" value={fields.length} color="#6b7280" />
          <StatChip label="全域欄位" value={fields.filter(f => f.global).length} color="#92400e" bg="#fef3c7" />
          <StatChip label="篩選結果" value={filtered.length} color="#0369a1" bg="#e0f2fe" />
        </div>

        {/* ── 主內容 ───────────────────────────────────────── */}
        {fields.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <p style={{ margin: 0, fontSize: 15 }}>找不到符合條件的欄位</p>
          </div>
        ) : viewMode === 'card' ? (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap:                 16,
          }}>
            {filtered.map(f => (
              <FieldCard
                key={f.id}
                field={f}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                projects={projects}
                onGoToProject={handleGoToProject}
              />
            ))}
          </div>
        ) : (
          <TableView
            fields={filtered}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            projects={projects}
            onGoToProject={handleGoToProject}
          />
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────── */}
      {showModal && (
        <FieldModal
          field={editTarget}
          projects={projects}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          userName={user?.name || '我'}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          field={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/** StatChip */
function StatChip({ label, value, color, bg }) {
  return (
    <div style={{
      padding:      '5px 12px',
      borderRadius: 99,
      background:   bg || '#f3f4f6',
      display:      'flex',
      alignItems:   'center',
      gap:          6,
      fontSize:     13,
    }}>
      <span style={{ fontWeight: 700, color }}>{value}</span>
      <span style={{ color: '#6b7280' }}>{label}</span>
    </div>
  );
}

/** ViewToggleBtn */
function ViewToggleBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            4,
        padding:        '5px 10px',
        borderRadius:   6,
        border:         'none',
        background:     active ? '#C41230' : 'transparent',
        color:          active ? '#fff' : '#6b7280',
        fontSize:       13,
        fontWeight:     active ? 700 : 500,
        cursor:         'pointer',
        transition:     'all 0.15s',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
