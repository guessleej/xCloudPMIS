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

import { useState, useEffect, useCallback, useRef } from 'react';
import ProjectDetail from './ProjectDetail';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';
import { usePermissions } from '../../hooks/usePermissions';

// API 使用相對路徑，由 Vite proxy 轉發到後端（見 vite.config.js）
const API = '';
const LS_COLOR   = 'xcloud_project_colors'; // localStorage key

// ══════════════════════════════════════════════════════════════
// Design System
// ══════════════════════════════════════════════════════════════
const C = {
  brand: 'var(--xc-brand)', brandDk: 'var(--xc-brand-dark)',
  ink: 'var(--xc-text)', ink2: 'var(--xc-text-soft)', ink3: 'var(--xc-text-muted)', ink4: 'var(--xc-text-muted)',
  line: 'var(--xc-border)', lineL: 'var(--xc-surface-muted)', bg: 'var(--xc-bg)', white: 'var(--xc-surface-strong)',
  surface: 'var(--xc-surface)', surfaceSoft: 'var(--xc-surface-soft)', surfaceMuted: 'var(--xc-surface-muted)',
  successSoft: 'var(--xc-success-soft)', warningSoft: 'var(--xc-warning-soft)', dangerSoft: 'var(--xc-danger-soft)', infoSoft: 'var(--xc-info-soft)',
  shadow: 'var(--xc-shadow)', shadowStrong: 'var(--xc-shadow-strong)',
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

function isHexColor(value) { return /^#[0-9A-F]{6}$/i.test(value || ''); }
function getPalette(id) {
  if (isHexColor(id)) {
    return {
      id,
      hex: id,
      light: `color-mix(in srgb, ${id} 12%, var(--xc-surface))`,
      name: id.toUpperCase(),
    };
  }
  return PALETTE.find(p => p.id === id) || DEFAULT_COLOR;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsl(hex) {
  if (!isHexColor(hex)) return { h: 217, s: 82, l: 53 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 217, s: 0, l: l * 100 };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

function colorFromWheelPointer(event, el) {
  const rect = el.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const radius = rect.width / 2;
  const distance = Math.min(Math.sqrt(x * x + y * y), radius);
  const hue = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
  const saturation = Math.round((distance / radius) * 100);
  const lightness = Math.round(50 + (1 - saturation / 100) * 48);
  return hslToHex(hue, saturation, lightness);
}

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

// ── 狀態與健康定義（使用 color-mix 自動適應深淺色主題）────────
const STATUS = {
  planning:  { bg: 'color-mix(in srgb,#7C3AED 14%,var(--xc-surface))', color: '#8B5CF6', dot: '#8B5CF6', label: '規劃中', colBg: 'color-mix(in srgb,#7C3AED 7%,var(--xc-bg))' },
  active:    { bg: 'color-mix(in srgb,#16A34A 14%,var(--xc-surface))', color: '#16A34A', dot: '#16A34A', label: '進行中', colBg: 'color-mix(in srgb,#16A34A 7%,var(--xc-bg))' },
  on_hold:   { bg: 'color-mix(in srgb,#D97706 14%,var(--xc-surface))', color: '#D97706', dot: '#D97706', label: '暫停中', colBg: 'color-mix(in srgb,#D97706 7%,var(--xc-bg))' },
  completed: { bg: 'var(--xc-surface-muted)',                           color: 'var(--xc-text-muted)', dot: 'var(--xc-text-muted)', label: '已完成', colBg: 'var(--xc-bg-soft)' },
  cancelled: { bg: 'color-mix(in srgb,#DC2626 14%,var(--xc-surface))', color: '#EF4444', dot: '#EF4444', label: '已取消', colBg: 'color-mix(in srgb,#DC2626 7%,var(--xc-bg))' },
};

const HEALTH = {
  on_track:  { color: '#16A34A', bg: 'color-mix(in srgb,#16A34A 14%,var(--xc-surface))', border: 'color-mix(in srgb,#16A34A 28%,var(--xc-border))', label: '順利' },
  at_risk:   { color: '#D97706', bg: 'color-mix(in srgb,#D97706 14%,var(--xc-surface))', border: 'color-mix(in srgb,#D97706 28%,var(--xc-border))', label: '有風險' },
  off_track: { color: '#EF4444', bg: 'color-mix(in srgb,#EF4444 14%,var(--xc-surface))', border: 'color-mix(in srgb,#EF4444 28%,var(--xc-border))', label: '落後' },
  completed: { color: 'var(--xc-text-muted)', bg: 'var(--xc-surface-muted)', border: 'var(--xc-border)', label: '完成' },
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
const riskRank = (project) => ({ off_track: 0, at_risk: 1, on_track: 2, completed: 3 }[getHealth(project)] ?? 4);
const dateValue = (iso) => iso ? new Date(iso).getTime() : 0;
const isOverdueProject = (p) => { const dl = daysLeft(p.endDate); return dl !== null && dl < 0 && (p.completion || 0) < 100; };
const isDueSoonProject = (p) => { const dl = daysLeft(p.endDate); return dl !== null && dl >= 0 && dl <= 7 && (p.completion || 0) < 100; };
function nextAction(project) {
  const health = getHealth(project);
  const dl = daysLeft(project.endDate);
  if (isOverdueProject(project)) return { label: `逾期 ${Math.abs(dl)} 天，優先處理`, color: '#DC2626', bg: 'color-mix(in srgb,#DC2626 10%,var(--xc-surface))' };
  if (health === 'off_track') return { label: '進度落後，檢查阻塞', color: '#DC2626', bg: 'color-mix(in srgb,#DC2626 10%,var(--xc-surface))' };
  if (health === 'at_risk') return { label: '有風險，更新計畫', color: '#D97706', bg: 'color-mix(in srgb,#D97706 12%,var(--xc-surface))' };
  if (isDueSoonProject(project)) return { label: dl === 0 ? '今天截止' : `${dl} 天內截止`, color: '#2563EB', bg: 'color-mix(in srgb,#2563EB 10%,var(--xc-surface))' };
  if (!project.owner && !project.members?.length) return { label: '尚未指派負責人', color: '#64748B', bg: 'var(--xc-surface-muted)' };
  return { label: '開啟任務清單', color: 'var(--xc-text-soft)', bg: 'var(--xc-surface-soft)' };
}

// ── 共用樣式 ─────────────────────────────────────────────
const inputSt = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 12px', fontSize: '15px', color: C.ink, outline: 'none', background: C.white, fontFamily: 'inherit' };
const btnP    = { background: 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };
const btnO    = { background: C.white, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };
const btnD    = { background: '#DC2626', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' };

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
      border: `2px solid ${C.surface}`, boxShadow: C.shadow,
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
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.ink }}>新增專案</h2>
            <p style={{ margin: '3px 0 0', fontSize: '14px', color: C.ink4 }}>選擇範本或從空白開始</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: C.ink4 }}>✕</button>
        </div>

        {/* 主體：左側分類 + 右側範本 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* 左側分類列 */}
          <div style={{ width: '150px', flexShrink: 0, borderRight: `1px solid ${C.line}`, padding: '12px 8px', background: C.surfaceSoft }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.6px', padding: '0 8px', marginBottom: '8px' }}>
              分類
            </div>
            {TEMPLATE_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '7px',
                border: 'none', fontFamily: 'inherit', fontSize: '15px', cursor: 'pointer',
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
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{tpl.icon}</div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: C.ink, marginBottom: '6px' }}>{tpl.name}</div>
                      <div style={{ fontSize: '14px', color: C.ink3, lineHeight: '1.5', marginBottom: '12px' }}>{tpl.desc}</div>
                      {tpl.sections.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {tpl.sections.slice(0, 3).map(s => (
                            <span key={s} style={{ fontSize: '12px', background: pal.light, color: pal.hex, borderRadius: '4px', padding: '2px 6px', fontWeight: '500' }}>
                              {s}
                            </span>
                          ))}
                          {tpl.sections.length > 3 && (
                            <span style={{ fontSize: '12px', color: C.ink4, padding: '2px 4px' }}>+{tpl.sections.length - 3}</span>
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
  const isMobile = useIsMobile();
  const COMPANY_ID = user?.companyId;
  const isEdit = !!project;
  const defColor = project ? loadColors()[project.id] || 'blue' : (template?.color || 'blue');

  // ── localStorage 暫存 key ──────────────────────────────────
  const DRAFT_KEY = `xcloud_project_draft_${isEdit ? project.id : 'new'}`;

  // 初始化成員清單：編輯模式讀取 project.members，無則用 owner 單人
  const initMemberIds = () => {
    if (project?.members?.length > 0) return project.members.map(m => m.id);
    if (project?.owner?.id)           return [project.owner.id];
    return [];
  };

  // 嘗試從 localStorage 恢復暫存草稿
  const getInitialForm = () => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        // 驗證草稿資料的基本結構
        if (parsed && typeof parsed === 'object' && 'name' in parsed) {
          return parsed;
        }
      }
    } catch { /* 草稿解析失敗，使用預設值 */ }

    return {
      name:        project?.name        || (template && template.id !== 'blank' ? template.name : ''),
      description: project?.description || template?.desc || '',
      status:      project?.status      || 'planning',
      budget:      project?.budget      ? String(project.budget) : '',
      startDate:   project?.startDate   ? project.startDate.slice(0, 10) : '',
      endDate:     project?.endDate     ? project.endDate.slice(0, 10)   : '',
      memberIds:   initMemberIds(),
      ownerId:     project?.owner?.id || project?.ownerId || project?.createdById || (!isEdit ? user?.id : null) || (project?.members?.[0]?.id ?? null),
      colorId:     defColor,
    };
  };

  const [form, setForm] = useState(getInitialForm);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const memberRef = useRef(null);
  const colorRef  = useRef(null);
  const colorWheelRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pal = getPalette(form.colorId);
  const selectedHsl = hexToHsl(pal.hex);
  const selectedSat = Math.min(100, Math.max(0, selectedHsl.s));
  const selectedAngle = (selectedHsl.h - 90) * Math.PI / 180;
  const selectedRadius = (selectedSat / 100) * 88;
  const selectedX = 100 + Math.cos(selectedAngle) * selectedRadius;
  const selectedY = 100 + Math.sin(selectedAngle) * selectedRadius;

  const selectWheelColor = (event) => {
    if (!colorWheelRef.current) return;
    set('colorId', colorFromWheelPointer(event, colorWheelRef.current));
  };

  // 點擊顏色選擇器外部關閉
  useEffect(() => {
    const handler = (e) => {
      if (colorRef.current && !colorRef.current.contains(e.target)) {
        setColorPickerOpen(false);
      }
    };
    if (colorPickerOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerOpen]);

  // ── 自動暫存至 localStorage ─────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
  }, [form, DRAFT_KEY]);

  // ── 關閉前確認（避免點空白區域遺失資料）──────────────────
  const handleClose = () => {
    const hasContent = form.name.trim() || form.description.trim() || form.budget || form.startDate || form.endDate || form.memberIds.length > 0;
    if (hasContent) {
      if (window.confirm('表單內容已暫存，確定要關閉嗎？下次開啟時會自動恢復。')) {
        onClose();
      }
    } else {
      // 沒有任何內容，直接關閉並清除草稿
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      onClose();
    }
  };

  // 點擊下拉外部關閉
  useEffect(() => {
    const handler = (e) => {
      if (memberRef.current && !memberRef.current.contains(e.target)) {
        setMemberDropdownOpen(false);
      }
    };
    if (memberDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [memberDropdownOpen]);

  const toggleMember = (uid) => {
    setForm(f => {
      const ids = f.memberIds.includes(uid)
        ? f.memberIds.filter(id => id !== uid)
        : [...f.memberIds, uid];
      return { ...f, memberIds: ids };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('請輸入專案名稱'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `${API}/api/projects/${project.id}` : `${API}/api/projects`;
      const payload = {
        ...form,
        companyId: COMPANY_ID,
        ownerId: form.ownerId || null,
        memberIds: form.memberIds,
      };
      const res  = await authFetch(url, {
        method:  isEdit ? 'PATCH' : 'POST',
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success && !res.ok) throw new Error(json.error || '操作失敗');
      const saved = json.data || json;
      saveColor(saved.id, form.colorId);
      // 儲存成功，清除暫存草稿
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={{ background: C.white, borderRadius: '18px', width: '540px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>

        {/* 色帶頭部 */}
        <div style={{ height: '6px', background: pal.hex, borderRadius: '18px 18px 0 0' }} />

        <div style={{ padding: isMobile ? '14px 16px 12px' : '24px 28px 28px' }}>
          {/* 標題 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: C.ink }}>
                {isEdit ? '編輯專案' : template?.name || '新專案'}
              </h2>
              <p style={{ margin: 0, fontSize: '14px', color: C.ink4 }}>
                {isEdit ? '修改專案詳細資訊' : '設定你的新專案'}
              </p>
            </div>
            <button onClick={handleClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: C.ink4 }}>✕</button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* 專案名稱（大輸入框）*/}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                專案名稱 *
              </label>
              <input
                value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="例如：電商平台 2.0 重構" autoFocus
                style={{ ...inputSt, fontSize: '17px', padding: '10px 14px', fontWeight: '600' }}
              />
            </div>

            {/* 顏色選擇器 */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                專案顏色
              </label>
              {/* 可收折圓形色環 */}
              <div ref={colorRef} style={{ position: 'relative', display: 'inline-block' }}>
                {/* 觸發按鈕：顯示目前顏色 */}
                <button
                  type="button"
                  onClick={() => setColorPickerOpen(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${pal.hex}44`,
                    background: pal.light,
                    transition: 'all .15s',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: pal.hex, flexShrink: 0,
                    boxShadow: `0 0 0 2px ${pal.hex}33`,
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: pal.hex }}>{pal.name}</span>
                  <span style={{ fontSize: 11, color: pal.hex, opacity: 0.7, marginLeft: 2 }}>
                    {colorPickerOpen ? '▴' : '▾'}
                  </span>
                </button>

                {/* 展開的 360° 色環圓盤 */}
                {colorPickerOpen && (
                  <div style={{
                    position: 'absolute', top: '110%', left: 0,
                    zIndex: 300, background: C.white, border: `1px solid ${C.line}`,
                    borderRadius: 16, padding: '16px',
                    boxShadow: '0 12px 36px rgba(0,0,0,.18)',
                    animation: 'fadeDown .15s ease',
                    overflow: 'visible',
                  }}>
                    <style>{`@keyframes fadeDown { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }`}</style>
                    {/* 色彩圓盤：角度 = 色相、離中心距離 = 飽和度 */}
                    <div
                      ref={colorWheelRef}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        selectWheelColor(event);
                      }}
                      onPointerMove={(event) => {
                        if (event.buttons === 1) selectWheelColor(event);
                      }}
                      style={{ position: 'relative', width: 200, height: 200, cursor: 'crosshair', touchAction: 'none' }}
                    >
                      <div style={{
                        width: 200, height: 200, borderRadius: '50%',
                        background: 'radial-gradient(circle, #fff 0%, rgba(255,255,255,.92) 10%, rgba(255,255,255,0) 62%), conic-gradient(from -90deg, #ff004c, #ff7a00, #ffd400, #00c853, #00bcd4, #2962ff, #7c4dff, #ff00aa, #ff004c)',
                        position: 'absolute', inset: 0,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)',
                      }} />
                      {/* 目前選取位置 */}
                      <div style={{
                        position: 'absolute',
                        left: selectedX - 10,
                        top: selectedY - 10,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: pal.hex,
                        border: '3px solid white',
                        boxShadow: `0 0 0 2px ${pal.hex}, 0 2px 8px rgba(0,0,0,.32)`,
                        pointerEvents: 'none',
                      }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: pal.hex,
                        boxShadow: `0 0 0 2px ${pal.hex}33`,
                        flexShrink: 0,
                      }} />
                      <input
                        type="text"
                        value={pal.hex}
                        onChange={(event) => {
                          const next = event.target.value.trim();
                          if (isHexColor(next)) set('colorId', next.toUpperCase());
                        }}
                        style={{ ...inputSt, width: 112, padding: '6px 8px', fontSize: 13, fontWeight: 700, color: pal.hex }}
                      />
                      <button
                        type="button"
                        onClick={() => setColorPickerOpen(false)}
                        style={{ ...btnP, padding: '6px 12px', fontSize: 13 }}
                      >完成</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 描述 */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                目標說明
              </label>
              <textarea
                value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="此專案的目的、範圍與預期成果…"
                rows={3} style={{ ...inputSt, resize: 'vertical' }}
              />
            </div>

            {/* 負責人 */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>負責人</label>
              <select
                value={form.ownerId || ''}
                onChange={e => set('ownerId', e.target.value ? Number(e.target.value) : null)}
                style={inputSt}
              >
                <option value=''>— 未指派 —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* 2欄：成員指派 + 狀態 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div ref={memberRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  專案成員
                </label>
                {/* 已選成員 chips */}
                <div
                  onClick={() => setMemberDropdownOpen(v => !v)}
                  style={{
                    ...inputSt, cursor: 'pointer', minHeight: '38px',
                    display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center',
                    padding: '4px 10px',
                  }}
                >
                  {form.memberIds.filter(uid => uid !== form.ownerId && uid !== Number(form.ownerId)).length === 0 && (
                    <span style={{ color: C.ink4, fontSize: '14px', lineHeight: '28px' }}>— 點擊指派成員 —</span>
                  )}
                  {form.memberIds.filter(uid => uid !== form.ownerId && uid !== Number(form.ownerId)).map((uid) => {
                    const u = users.find(x => x.id === uid);
                    if (!u) return null;
                    return (
                      <span key={uid} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: C.surfaceSoft,
                        border: `1px solid ${C.line}`,
                        borderRadius: '99px', padding: '2px 8px 2px 4px', fontSize: '13px', fontWeight: '500', color: C.ink,
                      }}>
                        <Avatar name={u.name} size={20} color={C.brand} />
                        {u.name}
                        <span
                          onClick={e => { e.stopPropagation(); toggleMember(uid); }}
                          style={{ cursor: 'pointer', marginLeft: '2px', color: C.ink4, fontWeight: '700', fontSize: '14px', lineHeight: 1 }}
                        >×</span>
                      </span>
                    );
                  })}
                </div>
                {/* 下拉選單 */}
                {memberDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: C.white, border: `1px solid ${C.line}`, borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto',
                    marginTop: '4px',
                  }}>
                    {users.map(u => {
                      const selected = form.memberIds.includes(u.id);
                      return (
                        <div key={u.id}
                          onClick={() => toggleMember(u.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '7px 12px', cursor: 'pointer',
                            background: selected ? `${pal.hex}0D` : 'transparent',
                            transition: 'background 0.1s',
                          }}
                          onMouseOver={e => { if (!selected) e.currentTarget.style.background = C.surfaceSoft; }}
                          onMouseOut={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '4px',
                            border: `2px solid ${selected ? pal.hex : C.line}`,
                            background: selected ? pal.hex : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {selected && <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700' }}>✓</span>}
                          </div>
                          <Avatar name={u.name} size={22} color={C.brand} />
                          <span style={{ fontSize: '14px', color: C.ink }}>{u.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>狀態</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={inputSt}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            {/* 2欄：日期 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>開始日期</label>
                <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>截止日期</label>
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputSt} />
              </div>
            </div>

            {/* 預算 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>預算（元）</label>
              <input type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="例如：1,500,000" style={inputSt} />
            </div>

            {/* 範本分節預覽 */}
            {template?.sections?.length > 0 && !isEdit && (
              <div style={{ background: `${pal.hex}0D`, border: `1px solid ${pal.hex}30`, borderRadius: '10px', padding: '12px 14px', marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: pal.hex, marginBottom: '8px' }}>
                  範本將自動建立以下分節
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {template.sections.map((s, i) => (
                    <span key={i} style={{ fontSize: '13px', background: pal.light, color: pal.hex, borderRadius: '5px', padding: '3px 8px', fontWeight: '500' }}>
                      {i + 1}. {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && <div style={{ background: C.dangerSoft, color: '#B91C1C', borderRadius: '8px', padding: '10px 14px', fontSize: '15px', marginBottom: '14px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleClose} style={btnO}>取消</button>
              <button type="submit" disabled={saving} style={{ ...btnP, background: pal.hex, opacity: saving ? 0.6 : 1 }}>
                {saving ? (isEdit ? '儲存中…' : '建立中…') : (isEdit ? '儲存變更' : '建立專案')}
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
function DeleteModal({ project, onClose, onDeleted, authFetch }) {
  const [del, setDel] = useState(false), [err, setErr] = useState('');
  const go = async () => {
    setDel(true); setErr('');
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API}/api/projects/${project.id}`, { method: 'DELETE' });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error || '刪除失敗');
      onDeleted(project.id);
    } catch (e) { setErr(e.message); setDel(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: '16px', padding: '32px', width: '420px', maxWidth: '92vw', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.dangerSoft, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🗑️</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: '700', color: C.ink }}>確認刪除專案？</h2>
        <p style={{ margin: '0 0 12px', fontSize: '15px', color: C.ink3 }}>
          「<strong>{project.name}</strong>」將被封存（軟刪除，可復原）
        </p>
        {project.taskTotal > 0 && (
          <div style={{ background: C.warningSoft, border: '1px solid #FDE68A', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#A16207', marginBottom: '14px', textAlign: 'left' }}>
            ⚠️ 此專案含 <strong>{project.taskTotal}</strong> 個任務，將一併封存。
          </div>
        )}
        {err && <div style={{ background: C.dangerSoft, color: '#B91C1C', borderRadius: '8px', padding: '9px', fontSize: '15px', marginBottom: '12px' }}>❌ {err}</div>}
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

/** 單行元件 — 各行獨立管理 hover 狀態，避免在 map 中使用 hooks */
function ListRow({ p, isLast, onOpen, onEdit, onComplete, onDelete }) {
  const isMobile = useIsMobile();
  const [hov, setHov] = useState(false);
  const pal = getProjectColor(p.id);
  const dl  = daysLeft(p.endDate);
  const dlC = dl === null ? C.ink4 : dl < 0 ? '#DC2626' : dl <= 7 ? '#D97706' : C.ink3;
  const st  = STATUS[p.status] || STATUS.active;
  const action = nextAction(p);
  return (
    <div
      onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '14px 16px minmax(240px,1fr) 110px 90px 70px 92px 62px 160px', minWidth: isMobile ? '860px' : undefined,
        padding: '10px 18px', borderBottom: isLast ? 'none' : `1px solid ${C.lineL}`,
        background: hov ? C.surfaceSoft : C.surface, transition: 'background 0.1s', gap: '8px',
        alignItems: 'center',
      }}>
      {/* 顏色條 */}
      <div style={{ width: '3px', height: '28px', borderRadius: '99px', background: pal.hex }} />
      {/* 健康點 */}
      <HealthDot project={p} />
      {/* 名稱 */}
      <div onClick={() => onOpen(p)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }} style={{ cursor: 'pointer', minWidth: 0, padding: '3px 0' }} title="點擊進入專案看板">
        <div style={{ fontSize: '15px', fontWeight: '600', color: C.ink }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: action.color, background: action.bg, borderRadius: 999, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>{action.label}</span>
          {p.description && (
            <span style={{ fontSize: '13px', color: C.ink4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>{p.description}</span>
          )}
        </div>
      </div>
      {/* 成員 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {(p.members?.length > 0 ? p.members : p.owner ? [{ id: p.owner.id, name: p.owner.name }] : []).slice(0, 3).map((m, i) => (
          <Avatar key={m.id} name={m.name} size={22} color={i === 0 ? pal.hex : C.brand} />
        ))}
        {(p.members?.length || 0) > 3 && <span style={{ fontSize: '11px', color: C.ink4, fontWeight: '600', marginLeft: '2px' }}>+{p.members.length - 3}</span>}
        {!p.members?.length && !p.owner && <span style={{ fontSize: '14px', color: C.ink4 }}>—</span>}
      </div>
      {/* 狀態 */}
      <span style={{ fontSize: '12px', fontWeight: '600', color: st.color, background: st.bg, borderRadius: '99px', padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}>{st.label}</span>
      {/* 進度 */}
      <ProgressRing pct={p.completion || 0} size={34} stroke={3} colorHex={pal.hex} />
      {/* 截止日 */}
      <div style={{ fontSize: '14px', color: dlC, fontWeight: dl !== null && dl <= 7 ? '600' : '400', whiteSpace: 'nowrap' }}>
        {dl === null ? '—' : dl < 0 ? `逾期${Math.abs(dl)}天` : dl === 0 ? '今天' : fmtDate(p.endDate)}
      </div>
      {/* 任務數 */}
      <div style={{ fontSize: '14px', color: C.ink3 }}>{p.taskDone ?? 0}/{p.taskTotal ?? 0}</div>
      {/* 操作（admin/pm 可管理全部；成員可管理自己的專案） */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center', whiteSpace: 'nowrap' }}>
        {onComplete?.can(p) && <button onClick={() => onComplete(p)} style={{ padding: '5px 9px', background: '#16A34A', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#fff', fontWeight: 700, fontFamily: 'inherit' }}>完成</button>}
        {onEdit?.can(p) && <button onClick={() => onEdit(p)} style={{ padding: '5px 9px', background: C.surface, border: `1px solid ${C.line}`, borderRadius: 7, fontSize: '13px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit' }}>編輯</button>}
        {onDelete?.can(p) && <button onClick={() => onDelete(p)} title="封存專案" style={{ padding: '5px 8px', background: C.surface, border: '1px solid #FECACA', borderRadius: 7, fontSize: '13px', cursor: 'pointer', color: 'var(--xc-danger)', fontFamily: 'inherit' }}>封存</button>}
      </div>
    </div>
  );
}

function ListView({ projects, onOpen, onEdit, onComplete, onDelete }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding: isMobile ? '14px' : '20px 24px' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflowX: isMobile ? 'auto' : 'visible', overflowY: 'hidden', boxShadow: C.shadow }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '14px 16px minmax(240px,1fr) 110px 90px 70px 92px 62px 160px', minWidth: isMobile ? '860px' : undefined,
          padding: '8px 18px', borderBottom: `2px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.surfaceSoft, zIndex: 5, gap: '8px',
        }}>
          {['', '', '專案名稱', '成員', '狀態', '進度', '截止日', '任務', '操作'].map((h, i) => (
            <div key={i} style={{ fontSize: '12px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: i === 8 ? 'center' : 'left' }}>{h}</div>
          ))}
        </div>
        {projects.map((p, i) => (
          <ListRow key={p.id} p={p} isLast={i === projects.length - 1} onOpen={onOpen} onEdit={onEdit} onComplete={onComplete} onDelete={onDelete} />
        ))}
      </div>
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
              <span style={{ fontSize: '14px', fontWeight: '700', color: st.color }}>{st.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '13px', background: C.surface, color: st.color, borderRadius: '99px', padding: '1px 8px', fontWeight: '600' }}>
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
                    <div style={{ fontSize: '15px', fontWeight: '600', color: C.ink, marginBottom: '8px', lineHeight: '1.3' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                      <ProgressRing pct={p.completion || 0} size={30} stroke={3} colorHex={pal.hex} />
                      <span style={{ fontSize: '13px', color: C.ink3 }}>{p.taskDone ?? 0}/{p.taskTotal ?? 0} 任務</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        {(p.members?.length > 0 ? p.members : p.owner ? [{ id: p.owner.id, name: p.owner.name }] : []).slice(0, 3).map((m, i) => (
                          <Avatar key={m.id} name={m.name} size={22} color={i === 0 ? pal.hex : C.brand} />
                        ))}
                        {(p.members?.length || 0) > 3 && <span style={{ fontSize: '11px', color: C.ink4, fontWeight: '600' }}>+{p.members.length - 3}</span>}
                      </div>
                      {dl !== null && (
                        <span style={{ fontSize: '13px', color: dlC, fontWeight: dl <= 7 ? '600' : '400' }}>
                          {dl < 0 ? `逾期${Math.abs(dl)}d` : dl === 0 ? '今天截止' : `${dl}天`}
                        </span>
                      )}
                    </div>
                    {/* 操作按鈕（admin/pm 可管理全部；成員可管理自己的專案） */}
                    {((onEdit && onEdit.can(p)) || (onDelete && onDelete.can(p))) && <div style={{ marginTop: '8px', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}
                      onClick={e => e.stopPropagation()}>
                      {onEdit?.can(p) && <button onClick={() => onEdit(p)} style={{ padding: '3px 8px', background: C.surface, border: `1px solid ${C.line}`, borderRadius: '4px', fontSize: '12px', cursor: 'pointer', color: C.ink2, fontFamily: 'inherit' }}>編輯</button>}
                      {onDelete?.can(p) && <button onClick={() => onDelete(p)} style={{ padding: '3px 8px', background: C.surface, border: '1px solid #FECACA', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', color: 'var(--xc-danger)', fontFamily: 'inherit' }}>刪除</button>}
                    </div>}
                  </div>
                );
              })}
              {col.length === 0 && (
                <div style={{ border: `2px dashed ${C.line}`, borderRadius: '8px', padding: '20px', textAlign: 'center', color: C.ink4, fontSize: '14px' }}>
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
        <button onClick={prev} style={{ ...btnO, padding: '6px 12px', fontSize: '14px' }}>‹ 上月</button>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: C.ink }}>
          {year} 年 {month + 1} 月
        </h3>
        <button onClick={next} style={{ ...btnO, padding: '6px 12px', fontSize: '14px' }}>下月 ›</button>
        <span style={{ marginLeft: 'auto', fontSize: '14px', color: C.ink4 }}>
          本月截止：{Object.values(projectsByDay).flat().length} 個專案
        </span>
      </div>

      {/* 星期標題 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WDAYS.map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: '13px', fontWeight: '700', color: i === 0 || i === 6 ? '#DC2626' : C.ink4, padding: '4px 0' }}>{w}</div>
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
                    fontSize: '14px', fontWeight: isToday ? '800' : '500',
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
                        fontSize: '12px', background: pal.hex, color: 'white',
                        borderRadius: '4px', padding: '2px 5px', marginBottom: '2px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: '500',
                      }} title={p.name}>{p.name}</div>
                    );
                  })}
                  {dayProjects.length > 2 && (
                    <div style={{ fontSize: '12px', color: C.ink4 }}>+{dayProjects.length - 2} 個</div>
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
export default function ProjectsPage({ initialFilter = 'all', pageTitle = '專案管理', pageSubtitle = '集中檢視專案狀態、風險、進度與截止日；可用搜尋、排序與視圖切換快速找到要處理的專案。', navResetKey = 0 }) {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const { canCreateProject, canEditProjectRecord, canDeleteProjectRecord, canPermanentDelete } = usePermissions();
  const COMPANY_ID = user?.companyId;

  const [projects,      setProjects]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [filter,        setFilter]        = useState(initialFilter);
  const [search,        setSearch]        = useState('');
  const [sortBy,        setSortBy]        = useState('risk');
  const [view,          setView]          = useState('list');  // list|board|calendar
  const [toast,         setToast]         = useState('');
  // 建立流程（2步驟）
  const [selectedTpl,   setSelectedTpl]   = useState(null);   // 新增專案：開啟表單
  const [editProject,   setEditProject]   = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);
  // 封存區
  const [showArchived,    setShowArchived]    = useState(false);
  const [showCompletedArea,setShowCompletedArea] = useState(false);
  const [archivedProjects,setArchivedProjects]= useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [restoringId,     setRestoringId]     = useState(null);
  const [permanentDelete,  setPermanentDelete] = useState(null); // 確認硬刪除的專案
  const [hardDeleting,     setHardDeleting]    = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200); };
  const editProjectAction = Object.assign((project) => setEditProject(project), { can: canEditProjectRecord });
  const deleteProjectAction = Object.assign((project) => setDeleteProject(project), { can: canDeleteProjectRecord });

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

  const loadArchived = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const res = await authFetch(`${API}/api/projects?companyId=${COMPANY_ID}&onlyDeleted=true`);
      const json = await res.json();
      setArchivedProjects(json.data || []);
    } catch { setArchivedProjects([]); }
    finally { setLoadingArchived(false); }
  }, []);

  const restoreProject = async (id) => {
    setRestoringId(id);
    try {
      const res = await authFetch(`${API}/api/projects/${id}/restore`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '還原失敗');
      setArchivedProjects(prev => prev.filter(p => p.id !== id));
      load(); // 重新載入主列表
      showToast('✅ 專案已還原');
    } catch (e) { showToast(`❌ ${e.message}`); }
    finally { setRestoringId(null); }
  };

  const hardDeleteProject = async (id) => {
    setHardDeleting(true);
    try {
      const res = await authFetch(`${API}/api/projects/${id}/permanent`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '永久刪除失敗');
      setArchivedProjects(prev => prev.filter(p => p.id !== id));
      setPermanentDelete(null);
      showToast('🗑️ 專案已永久刪除');
    } catch (e) { showToast(`❌ ${e.message}`); }
    finally { setHardDeleting(false); }
  };

  const toggleCompletedArea = () => {
    const next = !showCompletedArea;
    setShowCompletedArea(next);
    setShowArchived(false);
    setFilter(next ? 'completed' : initialFilter);
    setSearch('');
    setSortBy(next ? 'updated' : 'risk');
  };

  const completeProject = async (project) => {
    const previous = projects;
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'completed' } : p));
    try {
      const res = await authFetch(`${API}/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '更新失敗');
      const saved = json.data || json;
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...saved, status: saved.status || 'completed' } : p));
      showToast('✅ 專案已標記完成');
    } catch (e) {
      setProjects(previous);
      showToast(`❌ ${e.message}`);
    }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showArchived) loadArchived(); }, [showArchived, loadArchived]);
  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);
  useEffect(() => {
    setActiveProject(null);
    setShowArchived(false);
    setShowCompletedArea(false);
    setSelectedTpl(null);
    setEditProject(null);
    setDeleteProject(null);
    setPermanentDelete(null);
    setSearch('');
    setFilter(initialFilter);
  }, [navResetKey, initialFilter]);

  const onCreated  = (saved) => { setSelectedTpl(null); load(); showToast('✅ 專案已建立'); };
  const onEdited   = (upd)   => { setEditProject(null); setProjects(prev => prev.map(p => p.id !== upd.id ? p : { ...p, ...upd })); showToast('✅ 已更新'); };
  const onDeleted  = (id)    => { setDeleteProject(null); setProjects(prev => prev.filter(p => p.id !== id)); if (showArchived) loadArchived(); showToast('🗑️ 已封存'); };
  const completeProjectAction = Object.assign((project) => completeProject(project), { can: (project) => canEditProjectRecord(project) && !['completed', 'cancelled'].includes(project.status) });

  // 從工作流程圖跳轉過來時，自動開啟指定專案
  useEffect(() => {
    const pid = sessionStorage.getItem('xcloud-open-project');
    if (!pid || !projects.length) return;
    const target = projects.find(p => String(p.id) === pid);
    if (target) {
      sessionStorage.removeItem('xcloud-open-project');
      setActiveProject(target);
    }
  }, [projects]);

  if (activeProject) {
    return <ProjectDetail projectId={activeProject.id} projectName={activeProject.name} onBack={() => { setActiveProject(null); load(); }} />;
  }

  // 篩選、搜尋、排序
  const searchTerm = search.trim().toLowerCase();
  const matchesSearch = (p) => {
    if (!searchTerm) return true;
    const haystack = [
      p.name,
      p.description,
      STATUS[p.status]?.label,
      HEALTH[getHealth(p)]?.label,
      p.owner?.name,
      ...(p.members || []).map(m => m.name),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  };
  const matchesProjectFilter = (p, key = filter) => {
    const currentUserId = Number(user?.id);
    const isCreatedByMe = Number(p.createdById) === currentUserId;
    const isAssignedToMe = Number(p.owner?.id ?? p.ownerId) === currentUserId || (p.members || []).some(m => Number(m.id) === currentUserId);
    if (key === 'all') return true;
    if (key === 'attention') return isOverdueProject(p) || ['at_risk', 'off_track'].includes(getHealth(p));
    if (key === 'mine') return isCreatedByMe;
    if (key === 'assigned') return !isCreatedByMe && isAssignedToMe;
    return p.status === key;
  };
  const activeProjects = projects.filter(p => p.status !== 'completed');
  const completedProjects = projects.filter(p => p.status === 'completed');
  const visibleProjects = showCompletedArea ? completedProjects : activeProjects;
  const searchedProjects = visibleProjects.filter(matchesSearch);
  const filtered = searchedProjects.filter(p => showCompletedArea ? true : matchesProjectFilter(p)).sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'zh-TW');
    if (sortBy === 'progress') return (b.completion || 0) - (a.completion || 0);
    if (sortBy === 'deadline') return (dateValue(a.endDate) || Infinity) - (dateValue(b.endDate) || Infinity);
    if (sortBy === 'updated') return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt);
    return riskRank(a) - riskRank(b) || (dateValue(a.endDate) || Infinity) - (dateValue(b.endDate) || Infinity);
  });

  // 統計
  const stats = {
    total:     activeProjects.length,
    active:    activeProjects.filter(p => p.status === 'active').length,
    at_risk:   activeProjects.filter(p => ['at_risk', 'off_track'].includes(getHealth(p))).length,
    completed: completedProjects.length,
    planning:  activeProjects.filter(p => p.status === 'planning').length,
  };
  const attentionProjects = activeProjects
    .filter(p => isOverdueProject(p) || ['at_risk', 'off_track'].includes(getHealth(p)) || isDueSoonProject(p))
    .sort((a, b) => riskRank(a) - riskRank(b) || (dateValue(a.endDate) || Infinity) - (dateValue(b.endDate) || Infinity))
    .slice(0, 3);

  const FILTERS = [
    { key: 'all',       label: '全部' },
    { key: 'attention', label: '需處理' },
    { key: 'mine',      label: '我的專案' },
    { key: 'assigned',  label: '被指派' },
  ];

  const VIEWS = [
    { key: 'list',     icon: '☰',  label: '列表' },
    { key: 'board',    icon: '⊞',  label: '看板' },
    { key: 'calendar', icon: '🗓', label: '日曆' },
  ];

  const SORTS = [
    { key: 'risk', label: '風險優先' },
    { key: 'deadline', label: '截止日近到遠' },
    { key: 'progress', label: '進度高到低' },
    { key: 'updated', label: '最近更新' },
    { key: 'name', label: '名稱 A-Z' },
  ];

  const resetFilters = () => {
    setShowCompletedArea(false);
    setFilter(initialFilter);
    setSearch('');
    setSortBy('risk');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, -apple-system, sans-serif', background: C.bg }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, background: '#1E293B', color: 'white', padding: '12px 20px', borderRadius: '10px', fontSize: '15px', fontWeight: '500', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      {/* ── 頁首：現代化專案工作台 ── */}
      <div style={{ padding: isMobile ? '14px 14px 12px' : '20px 24px 16px', background: `linear-gradient(135deg, color-mix(in srgb, var(--xc-brand) 12%, ${C.surface}) 0%, ${C.surface} 46%, ${C.surfaceSoft} 100%)`, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(260px, 1fr) auto', gap: 16, alignItems: 'start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--xc-brand) 10%, var(--xc-surface))', color: C.brand, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
              📁 Project Workspace
            </div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 900, letterSpacing: '-0.04em', color: C.ink }}>{pageTitle}</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: C.ink3, lineHeight: 1.6 }}>
              {pageSubtitle}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: isMobile ? 'stretch' : 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={toggleCompletedArea}
              style={{
                ...btnO,
                background: showCompletedArea ? 'var(--xc-success-soft)' : 'color-mix(in srgb, var(--xc-surface) 82%, transparent)',
                color: showCompletedArea ? '#15803D' : C.ink2,
                border: showCompletedArea ? '1px solid #BBF7D0' : `1px solid ${C.line}`,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: C.shadow,
              }}
            >
              ✓ 完成區
            </button>
            <button
              onClick={() => { setShowCompletedArea(false); setShowArchived(!showArchived); }}
              style={{
                ...btnO,
                background: showArchived ? 'var(--xc-warning-soft)' : 'color-mix(in srgb, var(--xc-surface) 82%, transparent)',
                color: showArchived ? '#A16207' : C.ink2,
                border: showArchived ? '1px solid #FDE68A' : `1px solid ${C.line}`,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: C.shadow,
              }}
            >
              🗄️ 封存區
            </button>
            {canCreateProject && <button onClick={() => setSelectedTpl({ id: 'blank', name: '', color: 'blue', sections: [] })} style={{ ...btnP, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 12, boxShadow: '0 12px 28px color-mix(in srgb, var(--xc-brand) 28%, transparent)' }}>
              ＋ 新增專案
            </button>}
          </div>
        </div>

        {/* KPI 統計列 */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: '全部專案', value: stats.total,     bg: C.surface,      vc: C.ink2,    dot: C.ink3, icon: '📁' },
            { label: '進行中',   value: stats.active,    bg: C.successSoft,  vc: '#15803D', dot: '#16A34A', icon: '▶' },
            { label: '有風險',   value: stats.at_risk,   bg: C.warningSoft,  vc: '#B45309', dot: '#D97706', icon: '⚠' },
            { label: '已完成',   value: stats.completed, bg: C.surfaceSoft,  vc: C.ink3,    dot: '#64748B', icon: '✓' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${C.line}`, borderRadius: 16, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: C.shadow }}>
              <div style={{ width: 34, height: 34, borderRadius: 12, background: s.dot, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.vc, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.ink4, marginTop: 3, fontWeight: 700 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 搜尋、排序、篩選 + 視圖切換 */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 10, boxShadow: C.shadow }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 1fr) 180px auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.ink4, fontSize: 15 }}>🔎</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜尋專案、成員、狀態或說明..."
                style={{ ...inputSt, paddingLeft: 36, height: 40, borderRadius: 12, background: C.surfaceSoft }}
              />
            </div>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={{ ...inputSt, height: 40, borderRadius: 12, background: C.surfaceSoft }}>
              {SORTS.map(option => <option key={option.key} value={option.key}>排序：{option.label}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
              <span style={{ fontSize: 13, color: C.ink4, fontWeight: 700, whiteSpace: 'nowrap' }}>顯示 {filtered.length} / {showCompletedArea ? stats.completed : stats.total}</span>
              {(showCompletedArea || filter !== initialFilter || search || sortBy !== 'risk') && (
                <button type="button" onClick={resetFilters} style={{ ...btnO, padding: '8px 12px', borderRadius: 10, fontSize: 13 }}>
                  重置
                </button>
              )}
              <div style={{ display: 'flex', background: C.lineL, borderRadius: 10, padding: 3, gap: 2 }}>
                {VIEWS.map(v => (
                  <button key={v.key} onClick={() => setView(v.key)} title={v.label} style={{
                    padding: '7px 11px', borderRadius: 8, border: 'none',
                    background: view === v.key ? C.surface : 'transparent',
                    color: view === v.key ? C.ink : C.ink4, cursor: 'pointer',
                    fontSize: 15,
                    boxShadow: view === v.key ? C.shadow : 'none',
                    transition: 'all 0.15s', fontFamily: 'inherit',
                  }}>{v.icon}</button>
                ))}
              </div>
            </div>
          </div>

          {!showCompletedArea && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  background: filter === f.key ? 'var(--xc-text)' : C.surfaceSoft,
                  color: filter === f.key ? 'var(--xc-bg)' : C.ink2,
                  border: `1px solid ${filter === f.key ? 'var(--xc-text)' : C.line}`,
                  borderRadius: 999, padding: '6px 12px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {f.label}
                  <span style={{ marginLeft: 6, fontSize: 12, background: filter === f.key ? 'rgba(128,128,128,0.25)' : C.surfaceMuted, color: filter === f.key ? 'var(--xc-bg)' : C.ink4, borderRadius: 999, padding: '1px 7px' }}>
                    {searchedProjects.filter(p => matchesProjectFilter(p, f.key)).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 操作焦點：先處理最急的專案 ── */}
      {!loading && !showCompletedArea && attentionProjects.length > 0 && (
        <div style={{ padding: isMobile ? '10px 14px' : '12px 24px', background: C.bg, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '150px repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'stretch' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 12px', boxShadow: C.shadow }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.ink }}>下一步</div>
              <div style={{ fontSize: 12, color: C.ink4, marginTop: 4, lineHeight: 1.5 }}>依風險、逾期與截止日自動排序</div>
            </div>
            {attentionProjects.map(project => {
              const pal = getProjectColor(project.id);
              const action = nextAction(project);
              return (
                <button key={project.id} onClick={() => setActiveProject(project)} style={{
                  textAlign: 'left', background: C.surface, border: `1px solid ${C.line}`, borderLeft: `4px solid ${pal.hex}`,
                  borderRadius: 14, padding: '11px 12px', cursor: 'pointer', boxShadow: C.shadow,
                  display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'inherit', minWidth: 0,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: action.color, background: action.bg, borderRadius: 999, padding: '3px 8px', alignSelf: 'flex-start' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 完成區 ── */}
      {showCompletedArea && (
        <div style={{ background: 'var(--xc-success-soft)', borderBottom: '1px solid #BBF7D0', flexShrink: 0 }}>
          <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#15803D' }}>完成區</span>
            <span style={{ fontSize: 13, color: '#166534' }}>（集中放置已完成 {stats.completed} 個專案）</span>
            <button onClick={toggleCompletedArea} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#15803D' }}>✕</button>
          </div>
        </div>
      )}

      {/* ── 封存區 ── */}
      {showArchived && (
        <div style={{ background: 'var(--xc-warning-soft)', borderBottom: `1px solid #FDE68A`, flexShrink: 0 }}>
          <div style={{ padding: isMobile ? '12px 16px' : '14px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: archivedProjects.length > 0 ? '12px' : '0' }}>
              <span style={{ fontSize: '18px' }}>🗄️</span>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#92400E' }}>封存區</span>
              <span style={{ fontSize: '13px', color: '#A16207' }}>（已封存 {archivedProjects.length} 個專案，可隨時還原）</span>
              <button onClick={() => setShowArchived(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#A16207' }}>✕</button>
            </div>
            {loadingArchived ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#A16207', fontSize: '14px' }}>載入中…</div>
            ) : archivedProjects.length === 0 ? (
              <div style={{ padding: '8px 0 4px', textAlign: 'center', color: '#A16207', fontSize: '14px' }}>目前沒有已封存的專案</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {archivedProjects.map(p => {
                  const pal = getProjectColor(p.id);
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: 'var(--xc-surface)', borderRadius: '10px',
                      padding: '10px 16px', border: '1px solid var(--xc-border)',
                    }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: pal.hex, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: C.ink4, marginTop: '2px' }}>
                          封存於 {p.deletedAt ? new Date(p.deletedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                          {p.taskTotal > 0 && ` · ${p.taskTotal} 個任務`}
                        </div>
                      </div>
                      {canDeleteProjectRecord(p) && <button
                        onClick={() => restoreProject(p.id)}
                        disabled={restoringId === p.id}
                        style={{
                          background: '#16A34A', color: 'white', border: 'none',
                          borderRadius: '8px', padding: '6px 16px', fontSize: '14px',
                          fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                          opacity: restoringId === p.id ? 0.6 : 1,
                        }}
                      >
                        {restoringId === p.id ? '還原中…' : '↩ 還原'}
                      </button>}
                      {canPermanentDelete && <button
                        onClick={() => setPermanentDelete(p)}
                        style={{
                          background: 'none', color: '#DC2626', border: '1px solid #FECACA',
                          borderRadius: '8px', padding: '6px 14px', fontSize: '14px',
                          fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        title="永久刪除（不可復原）"
                      >
                        🗑️
                      </button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 內容區 ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: view === 'board' || view === 'calendar' ? C.bg : C.surface }}>
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: '34px', height: '34px', border: `3px solid ${C.brand}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: '14px', color: C.ink4 }}>載入專案中…</div>
          </div>
        ) : error ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '38px', marginBottom: '12px' }}>😢</div>
            <div style={{ color: '#DC2626', fontWeight: '700', marginBottom: '8px' }}>載入失敗</div>
            <div style={{ color: C.ink4, fontSize: '15px', marginBottom: '16px' }}>{error}</div>
            <button onClick={load} style={btnP}>重試</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '50px', marginBottom: '14px' }}>📭</div>
            <div style={{ fontSize: '17px', fontWeight: '700', color: C.ink, marginBottom: '8px' }}>
              {projects.length === 0
                ? '還沒有任何專案'
                : showCompletedArea
                  ? '完成區目前沒有專案'
                  : activeProjects.length === 0
                    ? '目前沒有未完成專案'
                    : '沒有符合條件的專案'}
            </div>
            {projects.length === 0 && canCreateProject ? (
              <>
                <div style={{ fontSize: '15px', color: C.ink4, marginBottom: '18px' }}>
                  點擊下方按鈕建立你的第一個專案
                </div>
                <button onClick={() => setSelectedTpl({ id: 'blank', name: '', color: 'blue', sections: [] })} style={btnP}>＋ 新增專案</button>
              </>
            ) : !showCompletedArea && activeProjects.length === 0 && completedProjects.length > 0 ? (
              <>
                <div style={{ fontSize: '15px', color: C.ink4, marginBottom: '18px' }}>
                  已完成的專案已移到完成區，不會顯示在一般專案管理列表。
                </div>
                <button type="button" onClick={toggleCompletedArea} style={btnP}>前往完成區</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '15px', color: C.ink4, marginBottom: '18px' }}>
                  {showCompletedArea ? '目前完成區搜尋條件沒有符合結果。' : '目前搜尋、快捷篩選或狀態篩選沒有符合結果。'}
                </div>
                <button
                  type="button"
                  onClick={showCompletedArea ? () => { setSearch(''); setSortBy('updated'); } : resetFilters}
                  style={btnP}
                >
                  {showCompletedArea ? '清除完成區搜尋' : '清除所有條件'}
                </button>
              </>
            )}
          </div>
        ) : view === 'list' ? (
          <ListView projects={filtered} onOpen={setActiveProject} onEdit={editProjectAction} onComplete={completeProjectAction} onDelete={deleteProjectAction} />
        ) : view === 'board' ? (
          <BoardView projects={filtered} onOpen={setActiveProject} onEdit={editProjectAction} onDelete={deleteProjectAction} />
        ) : (
          <CalendarView projects={filtered} />
        )}
      </div>

      {/* ── Modals ── */}
      {/* 新增專案表單 */}
      {selectedTpl && (
        <ProjectFormModal users={users} project={null} template={selectedTpl} onClose={() => setSelectedTpl(null)} onSaved={onCreated} />
      )}
      {editProject && (
        <ProjectFormModal users={users} project={editProject} template={null} onClose={() => setEditProject(null)} onSaved={onEdited} />
      )}
      {deleteProject && (
        <DeleteModal project={deleteProject} onClose={() => setDeleteProject(null)} onDeleted={onDeleted} authFetch={authFetch} />
      )}

      {/* 永久刪除確認 */}
      {permanentDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !hardDeleting) setPermanentDelete(null); }}>
          <div style={{ background: C.white, borderRadius: '16px', padding: '32px', width: '440px', maxWidth: '92vw', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.dangerSoft, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⚠️</div>
            <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: '700', color: C.ink }}>確認永久刪除？</h2>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: C.ink3 }}>
              「<strong>{permanentDelete.name}</strong>」將被<span style={{ color: '#DC2626', fontWeight: 700 }}>永久刪除</span>，包含所有任務、留言、時間記錄等資料。
            </p>
            <div style={{ background: C.dangerSoft, border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: '#B91C1C', marginBottom: '16px', textAlign: 'left' }}>
              ⚠️ <strong>此操作不可復原！</strong>刪除後無法恢復任何資料。
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setPermanentDelete(null)} disabled={hardDeleting} style={btnO}>取消</button>
              <button
                onClick={() => hardDeleteProject(permanentDelete.id)}
                disabled={hardDeleting}
                style={{ ...btnD, opacity: hardDeleting ? 0.6 : 1 }}
              >
                {hardDeleting ? '刪除中…' : '☠️ 永久刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
