/**
 * ProjectsPage v4 — "How Asana Works" 完整重製
 *
 * Asana 核心架構：組織 → 團隊 → 專案 → 分節 → 任務 → 子任務
 *
 * 功能：
 *  ① 範本選擇器 (Template Picker) — 空白/工程/行銷/產品/設計/人資
 *  ② 專案設定    (Project Setup)  — 名稱、顏色、隱私、視圖
 *  ③ 四種視圖    (4 Views)        — 列表/看板/時間軸/日曆
 *  ④ 色彩識別    (Color Identity) — 每個專案有獨立顏色
 *  ⑤ 健康指標    (Health)         — 順利/有風險/落後
 *  ⑥ 統計看板    (Stats)          — 頂部 KPI 卡片列
 */

import { useState, useEffect, useCallback } from 'react';
import ProjectDetail from './ProjectDetail';
import { useAuth } from '../../context/AuthContext';

// API 使用相對路徑，由 Vite proxy 轉發到後端（見 vite.config.js）
const API = '';
const LS_COLOR   = 'xcloud_project_colors'; // localStorage key

// ══════════════════════════════════════════════════════════════
// Design System
// ══════════════════════════════════════════════════════════════
const C = {
  brand: '#C41230', brandDk: '#8B0020',
  ink: '#111827', ink2: '#374151', ink3: '#6B7280', ink4: '#9CA3AF',
  line: '#E5E7EB', lineL: '#F3F4F6', bg: '#F7F2F2', white: '#FFFFFF',
};

// ── 8 色專案識別色盤 ──────────────────────────────────────
const PALETTE = [
  { id: 'red',    hex: '#C41230', light: '#FFF0F2', name: '緋紅' },
  { id: 'orange', hex: '#EA580C', light: '#FFF7ED', name: '橙色' },
  { id: 'amber',  hex: '#D97706', light: '#FFFBEB', name: '琥珀' },
  { id: 'green',  hex: '#16A34A', light: '#F0FDF4', name: '翠綠' },
  { id: 'teal',   hex: '#0D9488', light: '#F0FDFA', name: '青碧' },
  { id: 'blue',   hex: '#2563EB', light: '#EFF6FF', name: '深藍' },
  { id: 'violet', hex: '#7C3AED', light: '#F5F3FF', name: '紫羅' },
  { id: 'pink',   hex: '#DB2777', light: '#FDF2F8', name: '玫瑰' },
];
const DEFAULT_COLOR = PALETTE[5]; // 深藍

function getPalette(id) { return PALETTE.find(p => p.id === id) || DEFAULT_COLOR; }

// 取/存 localStorage 中的顏色對應
function loadColors()           { try { return JSON.parse(localStorage.getItem(LS_COLOR) || '{}'); } catch { return {}; } }
function saveColor(pid, cid)    { const m = loadColors(); m[pid] = cid; localStorage.setItem(LS_COLOR, JSON.stringify(m)); }
function getProjectColor(pid)   { return getPalette(loadColors()[pid]); }

// ── 範本庫（Asana 範本選擇器）────────────────────────────
const TEMPLATE_CATEGORIES = [
  { id: 'blank', label: '空白' },
  { id: 'engineering', label: '工程' },
  { id: 'marketing',   label: '行銷' },
  { id: 'product',     label: '產品' },
  { id: 'design',      label: '設計' },
  { id: 'hr',          label: '人資' },
];

const TEMPLATES = {
  blank: [
    { id: 'blank', name: '空白專案', desc: '從零開始，自由建立你的工作流程', icon: '📄', color: 'blue', sections: [] },
  ],
  engineering: [
    { id: 'sprint',    name: '敏捷衝刺',   desc: 'Sprint 規劃、執行與回顧的完整循環', icon: '⚡', color: 'blue',   sections: ['待辦 Backlog', '進行中 In Progress', '測試中 Testing', '已完成 Done'] },
    { id: 'bugtrack',  name: '錯誤追蹤',   desc: '系統化管理 Bug 回報、確認與修復',   icon: '🐛', color: 'red',    sections: ['新回報', '已確認', '修復中', '已關閉'] },
    { id: 'devops',    name: 'DevOps 流程', desc: 'CI/CD、部署與維運任務管理',          icon: '🔧', color: 'teal',   sections: ['待部署', '部署中', '監控中', '已完成'] },
  ],
  marketing: [
    { id: 'campaign',  name: '行銷活動',   desc: '從策略規劃到成效分析的完整活動流程', icon: '📢', color: 'orange', sections: ['策略規劃', '內容製作', '審核發布', '成效分析'] },
    { id: 'content',   name: '內容日曆',   desc: '社群媒體、部落格與影音內容排程',     icon: '📅', color: 'pink',   sections: ['構思中', '撰寫中', '待審核', '已發布'] },
  ],
  product: [
    { id: 'roadmap',   name: '產品路線圖', desc: '功能規劃、優先排序與版本里程碑',     icon: '🗺️', color: 'violet', sections: ['探索 Discovery', '規劃 Planning', '開發 Building', '已上線 Launched'] },
    { id: 'launch',    name: '產品發布',   desc: '新功能發布的跨部門協作清單',         icon: '🚀', color: 'green',  sections: ['發布前準備', '行銷素材', '技術部署', '上線後追蹤'] },
  ],
  design: [
    { id: 'design',    name: '設計專案',   desc: 'UX 研究、設計稿、評審與交付流程',    icon: '🎨', color: 'pink',   sections: ['研究 Research', '設計 Design', '評審 Review', '交付 Handoff'] },
  ],
  hr: [
    { id: 'onboarding', name: '員工入職',  desc: '新員工入職流程的標準化清單',          icon: '👋', color: 'green',  sections: ['到職前準備', '第一週', '第一個月', '試用期結束'] },
    { id: 'recruit',    name: '人才招募',  desc: '職缺發布、面試到錄取的完整流程',      icon: '🔍', color: 'amber',  sections: ['職缺規劃', '初篩', '面試中', '已錄取'] },
  ],
};

// ── 狀態與健康定義 ───────────────────────────────────────
const STATUS = {
  planning:  { bg: '#EDE9FE', color: '#5B21B6', dot: '#7C3AED', label: '規劃中', colBg: '#FAF5FF' },
  active:    { bg: '#DCFCE7', color: '#15803D', dot: '#16A34A', label: '進行中', colBg: '#F0FDF4' },
  on_hold:   { bg: '#FEF9C3', color: '#A16207', dot: '#D97706', label: '暫停中', colBg: '#FFFBEB' },
  completed: { bg: '#F1F5F9', color: '#475569', dot: '#64748B', label: '已完成', colBg: '#F8FAFC' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C', dot: '#DC2626', label: '已取消', colBg: '#FEF2F2' },
};

const HEALTH = {
  on_track:  { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: '順利' },
  at_risk:   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: '有風險' },
  off_track: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: '落後' },
  completed: { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', label: '完成' },
};

function getHealth(p) {
  if (p.status === 'completed' || p.status === 'cancelled') return 'completed';
  const now = new Date(), end = p.endDate ? new Date(p.endDate) : null, start = p.startDate ? new Date(p.startDate) : null;
  if (!end) return 'on_track';
  if (now > end && (p.completion || 0) < 100) return 'off_track';
  if (start && end) {
    const exp = Math.min(100, ((now - start) / (end - start)) * 100);
    if (exp - (p.completion || 0) > 25) return 'at_risk';
  }
  return 'on_track';
}

// ── Helpers ──────────────────────────────────────────────
const initials = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '—';
const daysLeft = (iso) => iso ? Math.ceil((new Date(iso) - new Date()) / 864e5) : null;

// ── 共用樣式 ─────────────────────────────────────────────
const inputSt = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 12px', fontSize: '13.5px', color: C.ink, outline: 'none', background: C.white, fontFamily: 'inherit' };
const btnP    = { background: C.brand, color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };
const btnO    = { background: C.white, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };
const btnD    = { background: '#DC2626', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };

// ══════════════════════════════════════════════════════════════
// 小元件
// ══════════════════════════════════════════════════════════════

function ProgressRing({ pct, size = 36, stroke = 3.5, colorHex }) {
  const r = (size - stroke * 2) / 2, circ = 2 * Math.PI * r;
  const off = circ - (Math.min(pct, 100) / 100) * circ;
  const sc = colorHex || (pct >= 100 ? '#16A34A' : pct >= 60 ? C.brand : pct >= 30 ? '#D97706' : '#DC2626');
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.lineL} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={sc} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s' }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: size < 34 ? '8px' : '9.5px', fontWeight: '700', fill: C.ink2 }}>
        {pct}%
      </text>
    </svg>
  );
}

function Avatar({ name, size = 26, color = C.brand }) {
  return (
    <div title={name || '未指派'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: name ? `linear-gradient(135deg, ${color}, ${C.brandDk})` : C.lineL,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: name ? 'white' : C.ink4, fontSize: size < 28 ? '10px' : '12px', fontWeight: '700',
      border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {name ? initials(name) : '?'}
    </div>
  );
}

function HealthDot({ project }) {
  const h = HEALTH[getHealth(project)];
  return <div style={{ width: 9, height: 9, borderRadius: '50%', background: h.color, flexShrink: 0 }} title={h.label} />;
}

// ══════════════════════════════════════════════════════════════
// ① 範本選擇器 Modal（Asana 最具代表的 UI 元素）
// ══════════════════════════════════════════════════════════════
function TemplatePickerModal({ onSelect, onClose }) {
  const [cat, setCat] = useState('blank');
  const templates = TEMPLATES[cat] || [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: '18px', width: '860px', maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

        {/* 頭部 */}
        <div style={{ padding: '22px 28px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: C.ink }}>新增專案</h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: C.ink4 }}>選擇範本或從空白開始</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: C.ink4 }}>✕</button>
        </div>

        {/* 主體：左側分類 + 右側範本 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* 左側分類列 */}
          <div style={{ width: '150px', flexShrink: 0, borderRight: `1px solid ${C.line}`, padding: '12px 8px', background: '#FAFAFA' }}>
            <div style={{ fontSize: '10.5px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.6px', padding: '0 8px', marginBottom: '8px' }}>
              分類
            </div>
            {TEMPLATE_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '7px',
                border: 'none', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer',
                background: cat === c.id ? `${C.brand}15` : 'transparent',
                color: cat === c.id ? C.brand : C.ink2,
                fontWeight: cat === c.id ? '600' : '400',
              }}>
                {c.label}
              </button>
            ))}
          </div>

          {/* 右側範本卡片 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
              {templates.map(tpl => {
                const pal = getPalette(tpl.color);
                return (
                  <div key={tpl.id} onClick={() => onSelect(tpl)}
                    style={{
                      border: `1.5px solid ${C.line}`, borderRadius: '12px', overflow: 'hidden',
                      cursor: 'pointer', transition: 'all 0.15s', background: C.white,
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = pal.hex; e.currentTarget.style.boxShadow = `0 4px 16px ${pal.hex}22`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    {/* 色帶預覽 */}
                    <div style={{ height: '8px', background: pal.hex }} />
                    <div style={{ padding: '16px' }}>
                      <div style={{ fontSize: '26px', marginBottom: '8px' }}>{tpl.icon}</div>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: C.ink, marginBottom: '6px' }}>{tpl.name}</div>
                      <div style={{ fontSize: '12px', color: C.ink3, lineHeight: '1.5', marginBottom: '12px' }}>{tpl.desc}</div>
                      {tpl.sections.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {tpl.sections.slice(0, 3).map(s => (
                            <span key={s} style={{ fontSize: '10px', background: pal.light, color: pal.hex, borderRadius: '4px', padding: '2px 6px', fontWeight: '500' }}>
                              {s}
                            </span>
                          ))}
                          {tpl.sections.length > 3 && (
                            <span style={{ fontSize: '10px', color: C.ink4, padding: '2px 4px' }}>+{tpl.sections.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ② 專案設定 Modal（含顏色選擇器）
// ══════════════════════════════════════════════════════════════
function ProjectFormModal({ users, project, template, onClose, onSaved }) {
  const { user, authFetch } = useAuth();
  const COMPANY_ID = user?.companyId;
  const isEdit = !!project;
  const defColor = project ? loadColors()[project.id] || 'blue' : (template?.color || 'blue');

  const [form, setForm] = useState({
    name:        project?.name        || (template && template.id !== 'blank' ? template.name : ''),
    description: project?.description || template?.desc || '',
    status:      project?.status      || 'planning',
    budget:      project?.budget      ? String(project.budget) : '',
    startDate:   project?.startDate   ? project.startDate.slice(0, 10) : '',
    endDate:     project?.endDate     ? project.endDate.slice(0, 10)   : '',
    ownerId:     project?.owner?.id   ? String(project.owner.id)       : '',
    colorId:     defColor,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pal = getPalette(form.colorId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('請輸入專案名稱'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `${API}/api/projects/${project.id}` : `${API}/api/projects`;
      const res  = await authFetch(url, {
        method:  isEdit ? 'PATCH' : 'POST',
        body:    JSON.stringify({ ...form, companyId: COMPANY_ID }),
      });
      const json = await res.json();
      if (!json.success && !res.ok) throw new Error(json.error || '操作失敗');
      const saved = json.data || json;
      saveColor(saved.id, form.colorId);
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: '18px', width: '540px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>

        {/* 色帶頭部 */}
        <div style={{ height: '6px', background: pal.hex, borderRadius: '18px 18px 0 0' }} />

        <div style={{ padding: '24px 28px 28px' }}>
          {/* 標題 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ fontSize: '28px' }}>{template?.icon || '📁'}</div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: C.ink }}>
                {isEdit ? '編輯專案' : template?.name || '新專案'}
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: C.ink4 }}>
                {isEdit ? '修改專案詳細資訊' : '設定你的新專案'}
              </p>
            </div>
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: C.ink4 }}>✕</button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* 專案名稱（大輸入框）*/}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                專案名稱 *
              </label>
              <input
                value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="例如：電商平台 2.0 重構" autoFocus
                style={{ ...inputSt, fontSize: '16px', padding: '10px 14px', fontWeight: '600' }}
              />
            </div>

            {/* 顏色選擇器 */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                專案顏色
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PALETTE.map(p => (
                  <button
                    key={p.id} type="button" onClick={() => set('colorId', p.id)}
                    title={p.name}
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%', border: 'none',
                      background: p.hex, cursor: 'pointer',
                      outline: form.colorId === p.id ? `3px solid ${p.hex}` : '3px solid transparent',
                      outlineOffset: '2px',
                      transform: form.colorId === p.id ? 'scale(1.2)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* 描述 */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                目標說明
              </label>
              <textarea
                value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="此專案的目的、範圍與預期成果…"
                rows={3} style={{ ...inputSt, resize: 'vertical' }}
              />
            </div>

            {/* 2欄：負責人 + 狀態 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>負責人</label>
                <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)} style={inputSt}>
                  <option value="">— 未指派 —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>狀態</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inputSt}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            {/* 2欄：日期 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>開始日期</label>
                <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>截止日期</label>
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputSt} />
              </div>
            </div>

            {/* 預算 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>預算（元）</label>
              <input type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="例如：1,500,000" style={inputSt} />
            </div>

            {/* 範本分節預覽 */}
            {template?.sections?.length > 0 && !isEdit && (
              <div style={{ background: `${pal.hex}0D`, border: `1px solid ${pal.hex}30`, borderRadius: '10px', padding: '12px 14px', marginBottom: '18px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: '700', color: pal.hex, marginBottom: '8px' }}>
                  📋 範本將自動建立以下分節
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {template.sections.map((s, i) => (
                    <span key={i} style={{ fontSize: '11px', background: pal.light, color: pal.hex, borderRadius: '5px', padding: '3px 8px', fontWeight: '500' }}>
                      {i + 1}. {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px' }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={btnO}>取消</button>
              <button type="submit" disabled={saving} style={{ ...btnP, background: pal.hex, opacity: saving ? 0.6 : 1 }}>
                {saving ? (isEdit ? '儲存中…' : '建立中…') : (isEdit ? '💾 儲存變更' : '🚀 建立專案')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ③ 刪除確認
// ══════════════════════════════════════════════════════════════
function DeleteModal({ project, onClose, onDeleted }) {
  const [del, setDel] = useState(false), [err, setErr] = useState('');
  const go = async () => {
    setDel(true); setErr('');
    try {
      const res = await fetch(`${API}/api/projects/${project.id}`, { method: 'DELETE' });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error || '刪除失敗');
      onDeleted(project.id);
    } catch (e) { setErr(e.message); setDel(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: '16px', padding: '32px', width: '420px', maxWidth: '92vw', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#FEE2E2', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🗑️</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: C.ink }}>確認刪除專案？</h2>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.ink3 }}>
          「<strong>{project.name}</strong>」將被封存（軟刪除，可復原）
        </p>
        {project.taskTotal > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '9px 12px', fontSize: '12.5px', color: '#A16207', marginBottom: '14px', textAlign: 'left' }}>
            ⚠️ 此專案含 <strong>{project.taskTotal}</strong> 個任務，將一併封存。
          </div>
        )}
        {err && <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', padding: '9px', fontSize: '13px', marginBottom: '12px' }}>❌ {err}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onClose} style={btnO} disabled={del}>取消</button>
          <button onClick={go} disabled={del} style={{ ...btnD, opacity: del ? 0.6 : 1 }}>{del ? '刪除中…' : '確認刪除'}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ④-A 列表視圖（Asana 表格樣式）
// ══════════════════════════════════════════════════════════════
function ListView({ projects, onOpen, onEdit, onDelete }) {
  return (
    <div style={{ background: C.white }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '14px 16px 1fr 110px 90px 70px 80px 62px 80px',
        padding: '8px 18px', borderBottom: `2px solid ${C.line}`,
        position: 'sticky', top: 0, background: '#FAFAFA', zIndex: 5, gap: '8px',
      }}>
        {['', '', '專案名稱', '負責人', '狀態', '進度', '截止日', '任務', '操作'].map((h, i) => (
          <div key={i} style={{ fontSize: '10.5px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
        ))}
      </div>
      {projects.map((p, i) => {
        const pal = getProjectColor(p.id);
        const dl  = daysLeft(p.endDate);
        const dlC = dl === null ? C.ink4 : dl < 0 ? '#DC2626' : dl <= 7 ? '#D97706' : C.ink3;
        const st  = STATUS[p.status] || STATUS.active;
        const [hov, setHov] = useState(false);
        return (
          <div key={p.id}
            onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}
            style={{
              display: 'grid', gridTemplateColumns: '14px 16px 1fr 110px 90px 70px 80px 62px 80px',
              padding: '9px 18px', borderBottom: i < projects.length - 1 ? `1px solid ${C.lineL}` : 'none',
              background: hov ? '#FAFAFA' : C.white, transition: 'background 0.1s', gap: '8px',
              alignItems: 'center',
            }}>
            {/* 顏色條 */}
            <div style={{ width: '3px', height: '28px', borderRadius: '99px', background: pal.hex }} />
            {/* 健康點 */}
            <HealthDot project={p} />
            {/* 名稱 */}
            <div onClick={() => onOpen(p)} style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: '13.5px', fontWeight: '600', color: C.ink }}>{p.name}</div>
              {p.description && (
                <div style={{ fontSize: '11.5px', color: C.ink4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>{p.description}</div>
              )}
            </div>
            {/* 負責人 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Avatar name={p.owner?.name} size={22} color={pal.hex} />
              <span style={{ fontSize: '12px', color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70px' }}>{p.owner?.name || '—'}</span>
            </div>
            {/* 狀態 */}
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: st.color, background: st.bg, borderRadius: '99px', padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}>{st.label}</span>
            {/* 進度 */}
            <ProgressRing pct={p.completion || 0} size={34} stroke={3} colorHex={pal.hex} />
            {/* 截止日 */}
            <div style={{ fontSize: '12px', color: dlC, fontWeight: dl !== null && dl <= 7 ? '600' : '400', whiteSpace: 'nowrap' }}>
              {dl === null ? '—' : dl < 0 ? `逾期${Math.abs(dl)}天` : dl === 0 ? '今天' : fmtDate(p.endDate)}
            </div>
            {/* 任務數 */}
            <div style={{ fontSize: '12px', color: C.ink3 }}>{p.taskDone ?? 0}/{p.taskTotal ?? 0}</div>
            {/* 操作 */}
            <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', opacity: hov ? 1 : 0, transition: 'opacity 0.15s' }}>
              <button onClick={() => onEdit(p)} style={{ padding: '4px 8px', background: C.white, border: `1px solid ${C.line}`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit' }}>編輯</button>
              <button onClick={() => onDelete(p)} style={{ padding: '4px 8px', background: C.white, border: '1px solid #FECACA', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}>刪除</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ④-B 看板視圖（Kanban by Status）
// ══════════════════════════════════════════════════════════════
function BoardView({ projects, onOpen, onEdit, onDelete }) {
  const cols = Object.entries(STATUS).filter(([k]) => k !== 'cancelled');
  return (
    <div style={{ display: 'flex', gap: '14px', padding: '20px 24px', overflowX: 'auto', alignItems: 'flex-start', minHeight: '400px' }}>
      {cols.map(([key, st]) => {
        const col = projects.filter(p => p.status === key);
        return (
          <div key={key} style={{ width: '240px', flexShrink: 0 }}>
            {/* 欄位標題 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '9px 12px', marginBottom: '10px',
              background: st.colBg, borderRadius: '8px',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.dot }} />
              <span style={{ fontSize: '12.5px', fontWeight: '700', color: st.color }}>{st.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', background: 'white', color: st.color, borderRadius: '99px', padding: '1px 8px', fontWeight: '600' }}>
                {col.length}
              </span>
            </div>
            {/* 卡片 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {col.map(p => {
                const pal = getProjectColor(p.id);
                const dl  = daysLeft(p.endDate);
                const dlC = dl === null ? C.ink4 : dl < 0 ? '#DC2626' : dl <= 7 ? '#D97706' : C.ink4;
                return (
                  <div key={p.id}
                    style={{ background: C.white, border: `1px solid ${C.line}`, borderLeft: `4px solid ${pal.hex}`, borderRadius: '8px', padding: '12px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                    onClick={() => onOpen(p)}
                    onMouseOver={e => e.currentTarget.style.boxShadow = `0 4px 14px rgba(0,0,0,0.1)`}
                    onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink, marginBottom: '8px', lineHeight: '1.3' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                      <ProgressRing pct={p.completion || 0} size={30} stroke={3} colorHex={pal.hex} />
                      <span style={{ fontSize: '11.5px', color: C.ink3 }}>{p.taskDone ?? 0}/{p.taskTotal ?? 0} 任務</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Avatar name={p.owner?.name} size={22} color={pal.hex} />
                      {dl !== null && (
                        <span style={{ fontSize: '11px', color: dlC, fontWeight: dl <= 7 ? '600' : '400' }}>
                          {dl < 0 ? `逾期${Math.abs(dl)}d` : dl === 0 ? '今天截止' : `${dl}天`}
                        </span>
                      )}
                    </div>
                    {/* 操作按鈕（懸停時） */}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => onEdit(p)} style={{ padding: '3px 8px', background: C.white, border: `1px solid ${C.line}`, borderRadius: '4px', fontSize: '10px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit' }}>編輯</button>
                      <button onClick={() => onDelete(p)} style={{ padding: '3px 8px', background: C.white, border: '1px solid #FECACA', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', color: '#DC2626', fontFamily: 'inherit' }}>刪除</button>
                    </div>
                  </div>
                );
              })}
              {col.length === 0 && (
                <div style={{ border: `2px dashed ${C.line}`, borderRadius: '8px', padding: '20px', textAlign: 'center', color: C.ink4, fontSize: '12px' }}>
                  無專案
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ④-C 日曆視圖（月曆，顯示專案截止日）
// ══════════════════════════════════════════════════════════════
function CalendarView({ projects }) {
  const now     = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const firstDay  = new Date(year, month, 1).getDay();  // 0=Sun
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells     = Array.from({ length: Math.ceil((firstDay + daysCount) / 7) * 7 }, (_, i) => {
    const d = i - firstDay + 1;
    return d > 0 && d <= daysCount ? d : null;
  });
  const WDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  // 為每個日期收集專案
  const projectsByDay = {};
  projects.forEach(p => {
    if (!p.endDate) return;
    const d = new Date(p.endDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!projectsByDay[day]) projectsByDay[day] = [];
      projectsByDay[day].push(p);
    }
  });

  const prev = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const next = () => { if (month === 11) { setYear(y => y+1); setMonth(0);  } else setMonth(m => m+1); };

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 月曆導覽 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <button onClick={prev} style={{ ...btnO, padding: '6px 12px', fontSize: '12px' }}>‹ 上月</button>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: C.ink }}>
          {year} 年 {month + 1} 月
        </h3>
        <button onClick={next} style={{ ...btnO, padding: '6px 12px', fontSize: '12px' }}>下月 ›</button>
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: C.ink4 }}>
          本月截止：{Object.values(projectsByDay).flat().length} 個專案
        </span>
      </div>

      {/* 星期標題 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WDAYS.map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: '11px', fontWeight: '700', color: i === 0 || i === 6 ? '#DC2626' : C.ink4, padding: '4px 0' }}>{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((d, ci) => {
          const isToday = d === now.getDate() && year === now.getFullYear() && month === now.getMonth();
          const dayProjects = d ? (projectsByDay[d] || []) : [];
          return (
            <div key={ci} style={{
              minHeight: '72px', borderRadius: '8px', padding: '6px',
              background: d ? C.white : 'transparent',
              border: d ? `1px solid ${C.line}` : 'none',
              outline: isToday ? `2px solid ${C.brand}` : 'none',
            }}>
              {d && (
                <>
                  <div style={{
                    fontSize: '12px', fontWeight: isToday ? '800' : '500',
                    color: isToday ? C.brand : ci % 7 === 0 || ci % 7 === 6 ? '#DC2626' : C.ink,
                    marginBottom: '4px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: isToday ? `${C.brand}15` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{d}</div>
                  {dayProjects.slice(0, 2).map(p => {
                    const pal = getProjectColor(p.id);
                    return (
                      <div key={p.id} style={{
                        fontSize: '10px', background: pal.hex, color: 'white',
                        borderRadius: '4px', padding: '2px 5px', marginBottom: '2px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: '500',
                      }} title={p.name}>{p.name}</div>
                    );
                  })}
                  {dayProjects.length > 2 && (
                    <div style={{ fontSize: '10px', color: C.ink4 }}>+{dayProjects.length - 2} 個</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主元件：ProjectsPage
// ══════════════════════════════════════════════════════════════
export default function ProjectsPage() {
  const { user, authFetch } = useAuth();
  const COMPANY_ID = user?.companyId;

  const [projects,      setProjects]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [filter,        setFilter]        = useState('all');
  const [view,          setView]          = useState('list');  // list|board|calendar
  const [toast,         setToast]         = useState('');
  // 建立流程（2步驟）
  const [showTplPicker, setShowTplPicker] = useState(false);
  const [selectedTpl,   setSelectedTpl]   = useState(null);   // 選定範本後進入 form
  const [editProject,   setEditProject]   = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pR, uR] = await Promise.all([
        authFetch(`${API}/api/projects?companyId=${COMPANY_ID}`),
        authFetch(`${API}/api/users?companyId=${COMPANY_ID}`).catch(() => ({ json: async () => ({ data: [] }) })),
      ]);
      const pD = await pR.json();
      setProjects(pD.data || []);
      try { const uD = await uR.json(); setUsers(uD.data || []); } catch { /**/ }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreated  = (saved) => { setSelectedTpl(null); load(); showToast('✅ 專案已建立'); };
  const onEdited   = (upd)   => { setEditProject(null); setProjects(prev => prev.map(p => p.id !== upd.id ? p : { ...p, ...upd })); showToast('✅ 已更新'); };
  const onDeleted  = (id)    => { setDeleteProject(null); setProjects(prev => prev.filter(p => p.id !== id)); showToast('🗑️ 已刪除'); };

  if (activeProject) {
    return <ProjectDetail projectId={activeProject.id} projectName={activeProject.name} onBack={() => setActiveProject(null)} />;
  }

  // 篩選
  const filtered = projects.filter(p => {
    if (filter === 'all')     return true;
    if (filter === 'at_risk') return ['at_risk', 'off_track'].includes(getHealth(p));
    return p.status === filter;
  });

  // 統計
  const stats = {
    total:     projects.length,
    active:    projects.filter(p => p.status === 'active').length,
    at_risk:   projects.filter(p => ['at_risk', 'off_track'].includes(getHealth(p))).length,
    completed: projects.filter(p => p.status === 'completed').length,
    planning:  projects.filter(p => p.status === 'planning').length,
  };

  const FILTERS = [
    { key: 'all',       label: '全部',   count: stats.total },
    { key: 'active',    label: '進行中', count: stats.active },
    { key: 'planning',  label: '規劃中', count: stats.planning },
    { key: 'at_risk',   label: '有風險', count: stats.at_risk },
    { key: 'completed', label: '已完成', count: stats.completed },
  ];

  const VIEWS = [
    { key: 'list',     icon: '☰',  label: '列表' },
    { key: 'board',    icon: '⊞',  label: '看板' },
    { key: 'calendar', icon: '🗓', label: '日曆' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, background: '#1E293B', color: 'white', padding: '12px 20px', borderRadius: '10px', fontSize: '13.5px', fontWeight: '500', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      {/* ── 頁首 ── */}
      <div style={{ padding: '18px 24px 14px', background: C.white, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        {/* 標題行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.ink }}>專案管理</h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: C.ink4 }}>
              How Asana Works · {stats.total} 個專案
            </p>
          </div>
          {/* 新增按鈕 → 開範本選擇器 */}
          <button onClick={() => setShowTplPicker(true)} style={btnP}>
            ＋ 新增專案
          </button>
        </div>

        {/* KPI 統計列 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {[
            { label: '全部專案', value: stats.total,     bg: C.lineL,   vc: C.ink2,    dot: C.ink3 },
            { label: '進行中',   value: stats.active,    bg: '#F0FDF4', vc: '#15803D', dot: '#16A34A' },
            { label: '有風險',   value: stats.at_risk,   bg: '#FFFBEB', vc: '#B45309', dot: '#D97706' },
            { label: '已完成',   value: stats.completed, bg: '#F8FAFC', vc: '#475569', dot: '#64748B' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '21px', fontWeight: '800', color: s.vc, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '10.5px', color: C.ink4, marginTop: '2px' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 篩選 + 視圖切換 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '4px', flex: 1, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                background: filter === f.key ? C.ink : C.white,
                color: filter === f.key ? 'white' : C.ink2,
                border: `1px solid ${filter === f.key ? C.ink : C.line}`,
                borderRadius: '99px', padding: '5px 13px',
                fontSize: '12.5px', fontWeight: '500', cursor: 'pointer',
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}>
                {f.label}
                <span style={{ marginLeft: '5px', fontSize: '10.5px', background: filter === f.key ? 'rgba(255,255,255,0.2)' : C.lineL, color: filter === f.key ? 'white' : C.ink4, borderRadius: '99px', padding: '1px 6px' }}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
          {/* 視圖切換 */}
          <div style={{ display: 'flex', background: C.lineL, borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)} title={v.label} style={{
                padding: '5px 11px', borderRadius: '6px', border: 'none',
                background: view === v.key ? C.white : 'transparent',
                color: view === v.key ? C.ink : C.ink4, cursor: 'pointer',
                fontSize: '14px',
                boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}>{v.icon}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 內容區 ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: view === 'board' || view === 'calendar' ? C.bg : C.white }}>
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: '34px', height: '34px', border: `3px solid ${C.brand}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: '14px', color: C.ink4 }}>載入專案中…</div>
          </div>
        ) : error ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>😢</div>
            <div style={{ color: '#DC2626', fontWeight: '700', marginBottom: '8px' }}>載入失敗</div>
            <div style={{ color: C.ink4, fontSize: '13px', marginBottom: '16px' }}>{error}</div>
            <button onClick={load} style={btnP}>重試</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: C.ink, marginBottom: '8px' }}>
              {filter === 'all' ? '還沒有任何專案' : '沒有符合條件的專案'}
            </div>
            {filter === 'all' && (
              <>
                <div style={{ fontSize: '13px', color: C.ink4, marginBottom: '18px' }}>
                  選擇範本或從空白開始，建立你的第一個專案
                </div>
                <button onClick={() => setShowTplPicker(true)} style={btnP}>🚀 選擇範本</button>
              </>
            )}
          </div>
        ) : view === 'list' ? (
          <ListView projects={filtered} onOpen={setActiveProject} onEdit={setEditProject} onDelete={setDeleteProject} />
        ) : view === 'board' ? (
          <BoardView projects={filtered} onOpen={setActiveProject} onEdit={setEditProject} onDelete={setDeleteProject} />
        ) : (
          <CalendarView projects={filtered} />
        )}
      </div>

      {/* ── Modals ── */}
      {/* 步驟 1：範本選擇器 */}
      {showTplPicker && (
        <TemplatePickerModal
          onSelect={tpl => { setShowTplPicker(false); setSelectedTpl(tpl); }}
          onClose={() => setShowTplPicker(false)}
        />
      )}
      {/* 步驟 2：專案設定 */}
      {selectedTpl && (
        <ProjectFormModal users={users} project={null} template={selectedTpl} onClose={() => setSelectedTpl(null)} onSaved={onCreated} />
      )}
      {editProject && (
        <ProjectFormModal users={users} project={editProject} template={null} onClose={() => setEditProject(null)} onSaved={onEdited} />
      )}
      {deleteProject && (
        <DeleteModal project={deleteProject} onClose={() => setDeleteProject(null)} onDeleted={onDeleted} />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
