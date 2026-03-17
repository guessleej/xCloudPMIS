/**
 * DiscoveryPage — Asana「Top Features to Discover」功能探索頁
 *
 * 六大核心功能，全部實作為可互動的 Demo：
 *  1. @提及   — 標記隊友 & 引用工作，@mention 下拉選單
 *  2. 多專案  — 同一任務歸屬多個專案（Multi-homing）
 *  3. 依賴關係— 任務前後順序與等待關係（Dependencies）
 *  4. 自訂欄位— 追蹤優先度/階段/工時等資料（Custom Fields）
 *  5. 表單    — 標準化請求入口，提交即建任務（Forms）
 *  6. 整合    — 跨工具連結（Integrations）
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const API        = '';

// ── Design tokens ─────────────────────────────────────────
const C = {
  brand: '#C41230', brandDk: '#8B0020', brandLt: '#FFF0F2',
  ink: '#111827', ink2: '#374151', ink3: '#6B7280', ink4: '#9CA3AF',
  line: '#E5E7EB', lineL: '#F3F4F6', white: '#FFFFFF',
};

// ── 6 個功能定義 ──────────────────────────────────────────
const FEATURES = [
  { id: 'mention',      no: '01', icon: '@',  label: '@提及',    color: '#2563EB', bg: '#EFF6FF' },
  { id: 'multihome',    no: '02', icon: '⊕',  label: '多專案',   color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'dependency',   no: '03', icon: '→',  label: '依賴關係', color: '#D97706', bg: '#FFFBEB' },
  { id: 'customfields', no: '04', icon: '⊞',  label: '自訂欄位', color: '#0D9488', bg: '#F0FDFA' },
  { id: 'forms',        no: '05', icon: '✎',  label: '表單',     color: C.brand,   bg: C.brandLt },
  { id: 'integrations', no: '06', icon: '⟳',  label: '整合',     color: '#16A34A', bg: '#F0FDF4' },
];

// ════════════════════════════════════════════════════════════
// Demo 1：@提及
// ════════════════════════════════════════════════════════════
const DEMO_MEMBERS = [
  { id: 1, name: '李偉業', role: '系統管理員', avatar: '李' },
  { id: 2, name: '陳志明', role: '專案經理',   avatar: '陳' },
  { id: 3, name: '王小美', role: '設計師',     avatar: '王' },
  { id: 4, name: '張文凱', role: '工程師',     avatar: '張' },
];

function MentionDemo() {
  const [text,     setText]     = useState('');
  const [show,     setShow]     = useState(false);
  const [query,    setQuery]    = useState('');
  const [mentions, setMentions] = useState([]);
  const inputRef = useRef(null);

  const filtered = DEMO_MEMBERS.filter(m => m.name.includes(query));

  const onInput = (e) => {
    const val = e.target.value;
    setText(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && atIdx === val.length - 1) { setShow(true); setQuery(''); }
    else if (atIdx >= 0 && !val.slice(atIdx + 1).includes(' ')) { setShow(true); setQuery(val.slice(atIdx + 1)); }
    else { setShow(false); }
  };

  const select = (m) => {
    const atIdx = text.lastIndexOf('@');
    const newText = text.slice(0, atIdx);
    setText(newText);
    setMentions(prev => [...prev, m]);
    setShow(false);
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {mentions.map((m, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: '#EFF6FF', color: '#2563EB', borderRadius: '99px',
            padding: '3px 10px', fontSize: '12.5px', fontWeight: '600',
          }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#2563EB', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800' }}>
              {m.avatar}
            </span>
            @{m.name}
            <button onClick={() => setMentions(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: '12px', padding: '0 0 0 2px' }}>✕</button>
          </span>
        ))}
      </div>
      <textarea
        ref={inputRef} value={text} onChange={onInput}
        placeholder="輸入 @ 來標記隊友或引用任務、專案…"
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
      />
      {show && (
        <div style={{ position: 'absolute', left: 0, right: 0, background: C.white, border: `1px solid ${C.line}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden', marginTop: '4px' }}>
          <div style={{ padding: '8px 12px 4px', fontSize: '10.5px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>成員</div>
          {filtered.map(m => (
            <div key={m.id} onClick={() => select(m)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseOver={e => e.currentTarget.style.background = '#F0F9FF'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800' }}>{m.avatar}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink }}>{m.name}</div>
                <div style={{ fontSize: '11px', color: C.ink4 }}>{m.role}</div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '12px 14px', fontSize: '13px', color: C.ink4 }}>找不到成員</div>}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Demo 2：多專案歸屬
// ════════════════════════════════════════════════════════════
function MultiHomeDemo() {
  const [projects, setProjects] = useState([
    { id: 1, name: '電商平台重構', color: '#C41230', active: true },
    { id: 2, name: '行動 App 開發', color: '#7C3AED', active: true },
    { id: 3, name: '季度回顧',     color: '#D97706', active: false },
    { id: 4, name: 'Q2 路線圖',    color: '#16A34A', active: false },
  ]);

  const toggle = (id) => setProjects(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  const active = projects.filter(p => p.active);

  return (
    <div>
      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>此任務歸屬於</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {active.map(p => (
            <span key={p.id} style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40`, borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '600' }}>
              📁 {p.name}
            </span>
          ))}
          {active.length === 0 && <span style={{ fontSize: '12px', color: C.ink4 }}>（尚未加入任何專案）</span>}
        </div>
      </div>
      <div style={{ fontSize: '11.5px', color: C.ink3, marginBottom: '8px', fontWeight: '600' }}>Tab+P 加入專案：</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {projects.map(p => (
          <button key={p.id} onClick={() => toggle(p.id)} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
            background: p.active ? `${p.color}12` : C.white,
            border: `1.5px solid ${p.active ? p.color : C.line}`,
            borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: p.active ? '600' : '400', color: p.active ? p.color : C.ink2 }}>{p.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: '14px' }}>{p.active ? '✓' : '+'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Demo 3：依賴關係
// ════════════════════════════════════════════════════════════
function DependencyDemo() {
  const [tasks] = useState([
    { id: 1, title: '複現 Bug #234', status: 'done',        blocker: false },
    { id: 2, title: '確認優先度排序', status: 'in_progress', blocker: false },
    { id: 3, title: '修復錯誤',      status: 'todo',         blocker: true  },
    { id: 4, title: '部署上線',      status: 'todo',         blocker: true  },
  ]);

  const statusStyle = {
    done:        { color: '#16A34A', bg: '#F0FDF4', label: '✓ 已完成' },
    in_progress: { color: '#D97706', bg: '#FFFBEB', label: '⚡ 進行中' },
    todo:        { color: '#6B7280', bg: '#F9FAFB', label: '等待中…'  },
  };

  return (
    <div>
      {tasks.map((t, i) => {
        const st = statusStyle[t.status];
        return (
          <div key={t.id} style={{ position: 'relative' }}>
            {i < tasks.length - 1 && (
              <div style={{ position: 'absolute', left: '20px', top: '100%', width: '2px', height: '10px', background: t.status === 'done' ? '#16A34A' : C.line, zIndex: 0 }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: C.white, border: `1.5px solid ${t.blocker && t.status === 'todo' ? '#FDE68A' : C.line}`,
              borderLeft: `4px solid ${st.color}`,
              borderRadius: '8px', padding: '10px 14px',
              marginBottom: '10px', position: 'relative', zIndex: 1,
              opacity: t.status === 'todo' && t.blocker ? 0.85 : 1,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink }}>{t.title}</div>
                {t.status === 'todo' && t.blocker && (
                  <div style={{ fontSize: '11px', color: '#D97706', marginTop: '2px' }}>
                    🔒 等待前置任務完成才能開始
                  </div>
                )}
              </div>
              <span style={{ fontSize: '11px', background: st.bg, color: st.color, borderRadius: '99px', padding: '3px 9px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                {st.label}
              </span>
            </div>
          </div>
        );
      })}
      <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#A16207' }}>
        💡 「修復錯誤」依賴「確認優先度排序」；「部署上線」依賴「修復錯誤」。前置任務截止日變更時會自動通知。
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Demo 4：自訂欄位
// ════════════════════════════════════════════════════════════
const FIELD_DEFS = [
  { id: 'priority', label: '優先度', type: 'select', options: ['🔴 緊急', '🟠 高', '🟡 中', '⚪ 低'], current: 1 },
  { id: 'stage',    label: '階段',   type: 'select', options: ['探索', '設計', '開發', '測試', '上線'],  current: 2 },
  { id: 'effort',   label: '預估工時', type: 'select', options: ['1h', '2h', '4h', '8h', '16h+'],        current: 2 },
  { id: 'cost',     label: '成本估算', type: 'select', options: ['$1K', '$5K', '$10K', '$50K+'],          current: 0 },
];

function CustomFieldsDemo() {
  const [fields, setFields] = useState(FIELD_DEFS);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const cycle = (id) => setFields(prev => prev.map(f =>
    f.id === id ? { ...f, current: (f.current + 1) % f.options.length } : f
  ));

  const FIELD_COLORS = { priority: '#C41230', stage: '#7C3AED', effort: '#0D9488', cost: '#D97706' };

  return (
    <div>
      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.lineL}`, fontSize: '13.5px', fontWeight: '700', color: C.ink }}>
          📌 首頁重新設計任務
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {fields.map(f => {
            const fc = FIELD_COLORS[f.id] || C.ink3;
            return (
              <button key={f.id} onClick={() => cycle(f.id)} title="點擊切換值" style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px',
                background: `${fc}12`, color: fc, border: `1px solid ${fc}30`,
                borderRadius: '6px', fontSize: '11.5px', fontWeight: '600',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>{f.label}</span>
                <span>{f.options[f.current]}</span>
              </button>
            );
          })}
          {adding ? (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="欄位名稱" autoFocus
                style={{ border: `1px solid ${C.line}`, borderRadius: '5px', padding: '3px 8px', fontSize: '12px', width: '90px', outline: 'none' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newName.trim()) {
                    setFields(prev => [...prev, { id: Date.now().toString(), label: newName, type: 'select', options: ['選項1', '選項2', '選項3'], current: 0 }]);
                    setNewName(''); setAdding(false);
                  }
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink4, fontSize: '14px' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ padding: '4px 10px', background: C.lineL, color: C.ink3, border: `1px dashed ${C.line}`, borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ＋ 新增欄位
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: C.ink3 }}>
        💡 點擊欄位標籤可循環切換值。自訂欄位會套用到專案中所有任務，也可跨專案篩選搜尋。
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Demo 5：表單（真實可提交）
// ════════════════════════════════════════════════════════════
function FormsDemo() {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', projectId: '', requester: '' });
  const [status, setStatus] = useState('idle'); // idle|loading|success|error
  const [msg,    setMsg]    = useState('');

  useEffect(() => {
    fetch(`${API}/api/projects?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(d => setProjects((d.data || []).filter(p => p.status === 'active').slice(0, 5)))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.projectId) { setMsg('請填寫請求標題並選擇專案'); return; }
    setStatus('loading');
    try {
      const res = await fetch(`${API}/api/projects/${form.projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       `[表單] ${form.title}`,
          description: `請求人：${form.requester || '匿名'}\n\n${form.description}`,
          priority:    form.priority,
          status:      'todo',
        }),
      });
      if (!res.ok) throw new Error('建立失敗');
      setStatus('success');
      setMsg('✅ 請求已成功提交，任務已建立到專案中！');
      setForm({ title: '', description: '', priority: 'medium', projectId: form.projectId, requester: '' });
      setTimeout(() => { setStatus('idle'); setMsg(''); }, 4000);
    } catch (err) {
      setStatus('error');
      setMsg(`❌ ${err.message}`);
      setTimeout(() => { setStatus('idle'); setMsg(''); }, 4000);
    }
  };

  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: '12px', overflow: 'hidden' }}>
      {/* 表單頭部 */}
      <div style={{ padding: '14px 18px', background: `${C.brand}0D`, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: 32, height: 32, borderRadius: '8px', background: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>✎</div>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: '700', color: C.ink }}>工作請求表單</div>
          <div style={{ fontSize: '11.5px', color: C.ink3 }}>提交後自動建立任務 · 任何人均可填寫</div>
        </div>
      </div>

      <form onSubmit={submit} style={{ padding: '18px' }}>
        {[
          { label: '請求標題 *',  key: 'title',       type: 'input',  placeholder: '例如：更新首頁 Banner 設計' },
          { label: '請求人',      key: 'requester',   type: 'input',  placeholder: '你的姓名（可選）' },
          { label: '詳細說明',    key: 'description', type: 'textarea',placeholder: '說明需求背景、驗收標準…' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} rows={3}
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '7px', padding: '8px 10px', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
            ) : (
              <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '7px', padding: '8px 10px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }} />
            )}
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>優先度</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}
              style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: '7px', padding: '8px 10px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', background: C.white }}>
              <option value="urgent">🔴 緊急</option>
              <option value="high">🟠 高</option>
              <option value="medium">🟡 中</option>
              <option value="low">⚪ 低</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>歸屬專案 *</label>
            <select value={form.projectId} onChange={e => set('projectId', e.target.value)}
              style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: '7px', padding: '8px 10px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', background: C.white }}>
              <option value="">— 選擇專案 —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px', background: status === 'success' ? '#F0FDF4' : '#FEF2F2', color: status === 'success' ? '#15803D' : '#B91C1C' }}>
            {msg}
          </div>
        )}

        <button type="submit" disabled={status === 'loading'} style={{
          width: '100%', padding: '10px', background: status === 'loading' ? C.line : C.brand,
          color: status === 'loading' ? C.ink3 : 'white', border: 'none', borderRadius: '8px',
          fontSize: '14px', fontWeight: '700', cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>
          {status === 'loading' ? '提交中…' : '🚀 提交請求'}
        </button>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Demo 6：整合
// ════════════════════════════════════════════════════════════
const INTEGRATIONS = [
  { name: 'Microsoft 365', desc: 'Outlook + Teams + SharePoint', icon: '🏢', color: '#0078D4', connected: true  },
  { name: 'Slack',          desc: '即時通知與任務指派',           icon: '💬', color: '#4A154B', connected: false },
  { name: 'Google Workspace',desc: 'Gmail + Drive + Calendar',   icon: '🔷', color: '#4285F4', connected: false },
  { name: 'Adobe CC',       desc: 'Illustrator / Photoshop',     icon: '🎨', color: '#FF0000', connected: false },
  { name: 'GitHub',         desc: 'PR 與 Issue 雙向同步',        icon: '⚙️', color: '#24292F', connected: false },
  { name: 'Zapier',         desc: '自動化任何工具連接',           icon: '⚡', color: '#FF4A00', connected: false },
];

function IntegrationsDemo() {
  const [items, setItems] = useState(INTEGRATIONS);
  const toggle = (name) => setItems(prev => prev.map(i => i.name === name ? { ...i, connected: !i.connected } : i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {items.map(intg => (
        <div key={intg.name} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px', background: C.white, border: `1.5px solid ${intg.connected ? intg.color : C.line}`,
          borderRadius: '10px', transition: 'all 0.2s',
        }}>
          <span style={{ fontSize: '22px', flexShrink: 0 }}>{intg.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: '700', color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{intg.name}</div>
            <div style={{ fontSize: '10.5px', color: C.ink4, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{intg.desc}</div>
          </div>
          <button onClick={() => toggle(intg.name)} style={{
            padding: '4px 10px', borderRadius: '6px', border: 'none',
            background: intg.connected ? '#F0FDF4' : C.lineL,
            color: intg.connected ? '#16A34A' : C.ink3,
            fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}>
            {intg.connected ? '✓ 已連接' : '連接'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：DiscoveryPage
// ════════════════════════════════════════════════════════════
const FEATURE_CONTENT = {
  mention: {
    title: '用 @提及 標記隊友與引用工作',
    subtitle: '輸入 @ 即可在任務描述或留言中連結到任務、專案或隊友',
    usecases: [
      '連結背景資訊 — 引用其他任務或專案，讓脈絡即刻可見',
      '標記相關任務 — 讓隊友知道有其他相關工作同步進行',
      '指定評論對象 — @隊友將其加為追蹤者，系統自動通知',
    ],
    demo: <MentionDemo />,
  },
  multihome: {
    title: '多專案歸屬，杜絕重複工作',
    subtitle: '同一個任務可加入多個專案，任何更新都即時同步，資訊永不重複',
    usecases: [
      '會議討論 — 把任務加入會議專案，同時保留在原始專案',
      '跨團隊協作 — 兩個團隊都能追蹤進度，資訊只有一份',
      '高階目標追蹤 — 把里程碑連結到目標專案與執行專案',
    ],
    demo: <MultiHomeDemo />,
  },
  dependency: {
    title: '依賴關係，確保工作按正確順序開始',
    subtitle: '標記任務的前後順序，讓隊友清楚誰在等待、誰被阻擋',
    usecases: [
      '產品發布 — 「全面上線」等待「整合 Beta 回饋」',
      '內容日曆 — 「排入 Staging」等待「完成文案修訂」',
      '活動規劃 — 「確認場地」等待「預算核准」',
      '錯誤追蹤 — 「排定修復優先度」等待「複現 Bug」',
    ],
    demo: <DependencyDemo />,
  },
  customfields: {
    title: '自訂欄位，追蹤任何維度的工作資訊',
    subtitle: '為專案新增自訂欄位，用結構化資料追蹤優先度、進度、成本與工作量',
    usecases: [
      '想要為所有任務加上統一的資料格式',
      '需要跨專案追蹤相同欄位（優先度、工時、階段）',
      '確保隊友填寫必要資訊',
      '需要依據特定欄位篩選或產生報表',
    ],
    demo: <CustomFieldsDemo />,
  },
  forms: {
    title: '表單，標準化工作請求流程',
    subtitle: '建立表單取代混亂的 Email 請求，提交後自動轉為任務並追蹤',
    usecases: [
      '任何人都可以填寫（不需要帳號）',
      '提交即自動建立任務並放入指定專案',
      '統一收集必要資訊，避免來回確認',
      '可分享表單連結給外部協作夥伴',
    ],
    demo: <FormsDemo />,
  },
  integrations: {
    title: '整合，連結所有工具讓工作流順暢',
    subtitle: '透過整合讓 xCloudPMIS 與你常用的工具雙向連動，減少切換成本',
    usecases: [
      'Gmail / Outlook — 把郵件直接轉成任務',
      'Slack / Teams — 在對話中指派任務、收通知',
      'GitHub — PR 與 Issue 自動同步任務狀態',
      'Adobe CC — 設計師可在 Illustrator 中直接查看任務',
    ],
    demo: <IntegrationsDemo />,
  },
};

export default function DiscoveryPage() {
  const { user } = useAuth();
  const COMPANY_ID = user?.companyId;

  const [active, setActive] = useState('mention');
  const feat    = FEATURES.find(f => f.id === active);
  const content = FEATURE_CONTENT[active];

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── 左側導覽 ── */}
      <div style={{
        width: '220px', flexShrink: 0,
        borderRight: `1px solid ${C.line}`,
        background: '#FAFAFA',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* 頭部 */}
        <div style={{ padding: '20px 16px 14px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: C.ink }}>功能探索</div>
          <div style={{ fontSize: '11px', color: C.ink4, marginTop: '2px' }}>Top Features to Discover</div>
        </div>

        {/* 功能列表 */}
        <nav style={{ padding: '8px' }}>
          {FEATURES.map(f => (
            <button key={f.id} onClick={() => setActive(f.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', border: 'none',
              background: active === f.id ? `${f.color}15` : 'transparent',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              marginBottom: '2px', transition: 'all 0.15s',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0,
                background: active === f.id ? f.color : C.lineL,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '800',
                color: active === f.id ? 'white' : C.ink3,
                transition: 'all 0.15s',
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: active === f.id ? '700' : '500', color: active === f.id ? f.color : C.ink2 }}>
                  {f.no} {f.label}
                </div>
              </div>
            </button>
          ))}
        </nav>

        {/* 底部說明 */}
        <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: `1px solid ${C.line}`, fontSize: '11px', color: C.ink4, lineHeight: '1.5' }}>
          以上功能已整合至 xCloudPMIS，參照 Asana Top Features to Discover 文件實作。
        </div>
      </div>

      {/* ── 右側內容 ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* 功能頭部橫幅 */}
        <div style={{ padding: '28px 32px 24px', borderBottom: `1px solid ${C.line}`, background: `${feat.color}08` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
              background: feat.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', fontWeight: '900', color: 'white',
              boxShadow: `0 4px 14px ${feat.color}44`,
            }}>
              {feat.icon}
            </div>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', color: feat.color, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>
                Feature {feat.no}
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '800', color: C.ink, lineHeight: '1.2' }}>
                {content.title}
              </h2>
              <p style={{ margin: 0, fontSize: '13.5px', color: C.ink3, lineHeight: '1.6', maxWidth: '560px' }}>
                {content.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'start' }}>

          {/* 左：適用情境 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '800', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>
              適用情境
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {content.usecases.map((uc, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    background: `${feat.color}18`, color: feat.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: '800', marginTop: '1px',
                  }}>
                    {i + 1}
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: C.ink2, lineHeight: '1.5' }}>{uc}</p>
                </div>
              ))}
            </div>

            {/* 前後切換 */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '28px' }}>
              {(() => {
                const idx  = FEATURES.findIndex(f => f.id === active);
                const prev = FEATURES[idx - 1];
                const next = FEATURES[idx + 1];
                return (
                  <>
                    {prev && (
                      <button onClick={() => setActive(prev.id)} style={{
                        padding: '8px 14px', background: C.white, border: `1px solid ${C.line}`,
                        borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer', color: C.ink2,
                        fontFamily: 'inherit', fontWeight: '500',
                      }}>
                        ← {prev.label}
                      </button>
                    )}
                    {next && (
                      <button onClick={() => setActive(next.id)} style={{
                        padding: '8px 14px', background: feat.color, border: 'none',
                        borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer', color: 'white',
                        fontFamily: 'inherit', fontWeight: '600', marginLeft: prev ? 'auto' : 0,
                      }}>
                        下一個：{next.label} →
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* 右：互動 Demo */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '800', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>
              互動示範
            </div>
            <div style={{ background: C.lineL, borderRadius: '12px', padding: '16px' }}>
              {content.demo}
            </div>
          </div>
        </div>

        {/* 底部：功能全覽 */}
        <div style={{ padding: '0 32px 32px' }}>
          <div style={{ height: '1px', background: C.line, marginBottom: '24px' }} />
          <div style={{ fontSize: '12px', fontWeight: '800', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>
            全部功能一覽
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {FEATURES.map(f => (
              <button key={f.id} onClick={() => setActive(f.id)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
                background: active === f.id ? `${f.color}12` : C.white,
                border: `1.5px solid ${active === f.id ? f.color : C.line}`,
                borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                  background: active === f.id ? f.color : f.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '15px', fontWeight: '900',
                  color: active === f.id ? 'white' : f.color,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: '700', color: active === f.id ? f.color : C.ink }}>{f.label}</div>
                  <div style={{ fontSize: '10.5px', color: C.ink4 }}>Feature {f.no}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
