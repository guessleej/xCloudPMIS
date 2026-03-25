/**
 * PortfoliosPage — Asana 風格專案組合監控頁面
 *
 * 功能：
 *  ① 左側組合清單（240px）— 新增/切換/全部專案
 *  ② 頂部統計卡片（4 個健康指標）
 *  ③ Asana Portfolio Table — 專案列表含健康度、進度、截止日
 *  ④ 新增組合 Modal — 名稱/說明/顏色/專案多選
 *  ⑤ 狀態更新側面板 — 右側滑入填寫本週報告
 *  ⑥ 欄位管理器 — 顯示/隱藏欄位
 *  ⑦ 行內備註編輯、健康度切換
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';

const API = '';
const LS_PORTFOLIOS = 'xcloud-portfolios';
const LS_CUSTOM_FIELDS = 'xcloud-custom-fields';

// ── Design System ─────────────────────────────────────────────
const C = {
  brand: 'var(--xc-brand)', brandDk: 'var(--xc-brand-dark)',
  ink: 'var(--xc-text)', ink2: 'var(--xc-text-soft)', ink3: 'var(--xc-text-muted)', ink4: 'var(--xc-text-muted)',
  line: 'var(--xc-border)', lineL: 'var(--xc-surface-muted)', bg: 'var(--xc-bg)', white: 'var(--xc-surface-strong)',
  green: 'var(--xc-success)', greenBg: 'var(--xc-success-soft)',
  yellow: 'var(--xc-warning)', yellowBg: 'var(--xc-warning-soft)',
  red: 'var(--xc-danger)', redBg: 'var(--xc-danger-soft)',
};

// ── 色盤（8 色）─────────────────────────────────────────────
const PALETTE = [
  { id: 'red',    hex: '#C41230', name: '緋紅' },
  { id: 'orange', hex: '#EA580C', name: '橙色' },
  { id: 'amber',  hex: '#D97706', name: '琥珀' },
  { id: 'green',  hex: '#16A34A', name: '翠綠' },
  { id: 'teal',   hex: '#0D9488', name: '青碧' },
  { id: 'blue',   hex: '#2563EB', name: '深藍' },
  { id: 'violet', hex: '#7C3AED', name: '紫羅' },
  { id: 'pink',   hex: '#DB2777', name: '玫瑰' },
];

// ── 健康度定義 ───────────────────────────────────────────────
const HEALTH_OPTIONS = [
  { key: 'on_track',  label: '按計劃', emoji: '🟢', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { key: 'at_risk',   label: '有風險', emoji: '🟡', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { key: 'off_track', label: '逾期',   emoji: '🔴', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
];

const HEALTH_MAP = Object.fromEntries(HEALTH_OPTIONS.map(h => [h.key, h]));

// ── 狀態選項 ─────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { key: 'active',    label: '進行中', bg: '#DCFCE7', color: '#15803D' },
  { key: 'completed', label: '已完成', bg: '#F1F5F9', color: '#475569' },
  { key: 'on_hold',   label: '暫停',   bg: '#FEF9C3', color: '#A16207' },
  { key: 'cancelled', label: '取消',   bg: '#FEE2E2', color: '#B91C1C' },
];

const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.key, s]));

// ── Helpers ──────────────────────────────────────────────────
const initials = (n = '') => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '—';
const daysLeft = (iso) => iso ? Math.ceil((new Date(iso) - new Date()) / 864e5) : null;

function calcHealth(p) {
  if (p.status === 'completed' || p.status === 'cancelled') return 'on_track';
  const now = new Date(), end = p.endDate ? new Date(p.endDate) : null, start = p.startDate ? new Date(p.startDate) : null;
  if (!end) return 'on_track';
  if (now > end && (p.completion || 0) < 100) return 'off_track';
  if (start && end) {
    const exp = Math.min(100, ((now - start) / (end - start)) * 100);
    if (exp - (p.completion || 0) > 25) return 'at_risk';
  }
  return 'on_track';
}

// ── 靜態示範專案（API 失敗時）────────────────────────────────
const DEMO_PROJECTS = [
  { id: 'demo-1', name: 'xCloud 平台重構', manager: { name: '張志遠' }, status: 'active',    completion: 68, startDate: '2025-01-15', endDate: '2025-06-30', color: 'blue' },
  { id: 'demo-2', name: '行動 App v3.0',   manager: { name: '林美華' }, status: 'active',    completion: 42, startDate: '2025-02-01', endDate: '2025-05-15', color: 'violet' },
  { id: 'demo-3', name: '品牌識別更新',     manager: { name: '陳建宏' }, status: 'on_hold',  completion: 25, startDate: '2025-03-01', endDate: '2025-08-01', color: 'pink' },
  { id: 'demo-4', name: 'Q2 行銷活動',     manager: { name: '王小萍' }, status: 'active',    completion: 89, startDate: '2025-01-01', endDate: '2025-04-01', color: 'orange' },
  { id: 'demo-5', name: '資安稽核 2025',   manager: { name: '劉佳穎' }, status: 'completed', completion: 100, startDate: '2025-01-01', endDate: '2025-03-31', color: 'green' },
];

// ── localStorage helpers ──────────────────────────────────────
function loadPortfolios() {
  try { return JSON.parse(localStorage.getItem(LS_PORTFOLIOS) || '[]'); } catch { return []; }
}
function savePortfolios(list) {
  localStorage.setItem(LS_PORTFOLIOS, JSON.stringify(list));
}
function loadCustomFields() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_FIELDS) || '[]'); } catch { return []; }
}

// ── 共用按鈕樣式 ──────────────────────────────────────────────
const btnPrimary = { background: C.brand, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' };
const btnOutline = { background: C.white, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' };
const inputSt   = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 12px', fontSize: '13.5px', color: C.ink, outline: 'none', background: C.white, fontFamily: 'inherit' };

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

// ── 頭像 ─────────────────────────────────────────────────────
function Avatar({ name, size = 28 }) {
  const colors = ['#C41230','#2563EB','#16A34A','#D97706','#7C3AED','#0D9488','#DB2777','#EA580C'];
  const nameStr = typeof name === 'string' ? name : (name?.name ?? '');
  const idx = nameStr ? nameStr.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: colors[idx], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: '700', flexShrink: 0, userSelect: 'none' }}>
      {initials(nameStr)}
    </div>
  );
}

// ── 進度條 ───────────────────────────────────────────────────
function ProgressBar({ pct }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  const color = p >= 80 ? C.green : p >= 40 ? '#D97706' : C.brand;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
      <div style={{ flex: 1, height: '6px', background: C.lineL, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', color: C.ink3, width: '30px', textAlign: 'right', flexShrink: 0 }}>{p}%</span>
    </div>
  );
}

// ── 健康度徽章 ───────────────────────────────────────────────
function HealthBadge({ hkey, onClick }) {
  const h = HEALTH_MAP[hkey] || HEALTH_MAP.on_track;
  return (
    <button onClick={onClick} title="點擊切換健康度" style={{ background: h.bg, color: h.color, border: `1px solid ${h.border}`, borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
      {h.emoji} {h.label}
    </button>
  );
}

// ── 狀態標籤 ─────────────────────────────────────────────────
// 使用 position: fixed + Portal，避免被 overflow:hidden 的父容器裁切
function StatusBadge({ skey, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef();
  const s = STATUS_MAP[skey] || STATUS_MAP.active;

  function handleToggle(e) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    const close = (e) => { setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} onClick={handleToggle}
        style={{ background: s.bg, color: s.color, border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
        {s.label} ▾
      </button>
      {open && createPortal(
        <div onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, background: C.white, border: `1px solid ${C.line}`, borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: '120px', overflow: 'hidden' }}>
          {STATUS_OPTIONS.map(opt => (
            <div key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', background: opt.key === skey ? opt.bg : 'transparent', color: opt.color, fontWeight: opt.key === skey ? '700' : '500' }}
              onMouseEnter={e => e.currentTarget.style.background = opt.bg}
              onMouseLeave={e => e.currentTarget.style.background = opt.key === skey ? opt.bg : 'transparent'}>
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── 截止日期顯示 ──────────────────────────────────────────────
function DueDateCell({ iso }) {
  if (!iso) return <span style={{ color: C.ink4, fontSize: '13px' }}>—</span>;
  const dl = daysLeft(iso);
  let color = C.ink3;
  if (dl !== null && dl < 0) color = C.red;
  else if (dl !== null && dl <= 7) color = '#EA580C';
  return (
    <span style={{ color, fontSize: '13px', fontWeight: dl !== null && dl <= 7 ? '600' : '400' }}>
      {fmtDate(iso)}{dl !== null && dl < 0 ? ` (${Math.abs(dl)}天前)` : dl !== null && dl <= 7 ? ` (${dl}天後)` : ''}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// 新增組合 Modal
// ══════════════════════════════════════════════════════════════
function AddPortfolioModal({ projects, onClose, onSave }) {
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [color, setColor] = useState('blue');
  const [selected, setSelected] = useState([]);

  const toggleProject = (pid) => {
    setSelected(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const portfolio = {
      id: `pf-${Date.now()}`,
      name: name.trim(),
      description: desc.trim(),
      owner: '我',
      color,
      projects: selected,
      createdAt: new Date().toISOString(),
    };
    onSave(portfolio);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.white, borderRadius: '16px', width: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: C.ink }}>新增專案組合</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: C.ink3, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* 名稱 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '6px' }}>組合名稱 *</label>
            <input style={inputSt} placeholder="例：Q2 核心專案" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* 說明 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '6px' }}>說明</label>
            <textarea style={{ ...inputSt, height: '72px', resize: 'vertical' }} placeholder="描述這個組合的目的..." value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          {/* 顏色選擇器 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '10px' }}>組合顏色</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {PALETTE.map(p => (
                <button key={p.id} onClick={() => setColor(p.id)} title={p.name}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: p.hex, border: color === p.id ? `3px solid ${C.ink}` : '3px solid transparent', cursor: 'pointer', outline: color === p.id ? `2px solid ${p.hex}` : 'none', outlineOffset: '2px', transition: 'all 0.15s' }} />
              ))}
            </div>
          </div>

          {/* 選擇專案 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '10px' }}>加入專案（{selected.length} 個已選）</label>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: '10px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
              {projects.map((p, i) => {
                const colorHex = PALETTE.find(c => c.id === p.color)?.hex || C.brand;
                const isSelected = selected.includes(p.id);
                return (
                  <div key={p.id} onClick={() => toggleProject(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer', borderTop: i > 0 ? `1px solid ${C.lineL}` : 'none', background: isSelected ? '#FFF0F2' : C.white, transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.lineL; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#FFF0F2' : C.white; }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isSelected ? C.brand : C.line}`, background: isSelected ? C.brand : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSelected && <span style={{ color: 'white', fontSize: '11px', lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colorHex, flexShrink: 0 }} />
                    <span style={{ fontSize: '13.5px', color: C.ink, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: '12px', color: C.ink4 }}>{p.manager?.name || p.owner?.name || (typeof p.owner === 'string' ? p.owner : '—')}</span>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: C.ink4, fontSize: '13px' }}>無可用專案</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button style={btnOutline} onClick={onClose}>取消</button>
          <button style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.5 }} onClick={handleSave} disabled={!name.trim()}>建立組合</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 狀態更新側面板
// ══════════════════════════════════════════════════════════════
function StatusUpdatePanel({ project, onClose, onSave }) {
  const [health, setHealth]     = useState(project._health || 'on_track');
  const [summary, setSummary]   = useState('');
  const [milestone, setMilestone] = useState('');

  const handleSave = () => {
    onSave({ projectId: project.id, health, summary, milestone, updatedAt: new Date().toISOString() });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />

      {/* Panel */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '420px', height: '100%', background: C.white, boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        {/* Header */}
        <div style={{ padding: '24px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', color: C.ink3, marginBottom: '4px' }}>狀態更新</div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: C.ink }}>{project.name}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: C.ink3, padding: '0', lineHeight: 1, marginTop: '-2px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* 健康度 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '10px' }}>本週健康度</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {HEALTH_OPTIONS.map(h => (
                <button key={h.key} onClick={() => setHealth(h.key)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', border: `2px solid ${health === h.key ? h.color : C.line}`, background: health === h.key ? h.bg : C.white, color: health === h.key ? h.color : C.ink3, fontSize: '12px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {h.emoji}<br />{h.label}
                </button>
              ))}
            </div>
          </div>

          {/* 更新說明 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '6px' }}>本週摘要</label>
            <textarea style={{ ...inputSt, height: '100px', resize: 'vertical' }}
              placeholder="本週完成了什麼？遇到哪些問題？下週計劃？"
              value={summary} onChange={e => setSummary(e.target.value)} />
          </div>

          {/* 里程碑 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.ink2, marginBottom: '6px' }}>下一個里程碑</label>
            <input style={inputSt} placeholder="例：完成 API 整合測試 (4/15)" value={milestone} onChange={e => setMilestone(e.target.value)} />
          </div>

          {/* 目前進度 */}
          <div style={{ background: C.lineL, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: C.ink3, marginBottom: '8px' }}>目前完成進度</div>
            <ProgressBar pct={project.completion || 0} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: '10px' }}>
          <button style={{ ...btnOutline, flex: 1 }} onClick={onClose}>取消</button>
          <button style={{ ...btnPrimary, flex: 2 }} onClick={handleSave}>儲存狀態報告</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 欄位管理器
// ══════════════════════════════════════════════════════════════
const ALL_COLUMNS = [
  { key: 'status',    label: '狀態' },
  { key: 'health',    label: '健康度' },
  { key: 'progress',  label: '完成進度' },
  { key: 'dueDate',   label: '截止日期' },
  { key: 'customFields', label: '自訂欄位' },
  { key: 'notes',     label: '備註' },
];

function ColumnManager({ visible, onChange, onClose }) {
  return (
    <div style={{ position: 'absolute', top: '110%', right: 0, background: C.white, border: `1px solid ${C.line}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: '200px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineL}`, fontSize: '12px', fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        欄位顯示
      </div>
      {ALL_COLUMNS.map(col => (
        <div key={col.key} onClick={() => onChange(col.key)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', cursor: 'pointer', fontSize: '13.5px', color: C.ink2 }}
          onMouseEnter={e => e.currentTarget.style.background = C.lineL}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${visible.includes(col.key) ? C.brand : C.line}`, background: visible.includes(col.key) ? C.brand : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {visible.includes(col.key) && <span style={{ color: 'white', fontSize: '10px' }}>✓</span>}
          </div>
          {col.label}
        </div>
      ))}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.lineL}` }}>
        <button onClick={onClose} style={{ ...btnOutline, width: '100%', justifyContent: 'center', padding: '6px 0', fontSize: '12px' }}>關閉</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面
// ══════════════════════════════════════════════════════════════
export default function PortfoliosPage({ onNavigate }) {
  const { user } = useAuth();
  const COMPANY_ID = user?.companyId;

  const [projects, setProjects]         = useState([]);
  const [portfolios, setPortfolios]     = useState([]);
  const [selectedPf, setSelectedPf]     = useState('all'); // 'all' or portfolio id
  const [loading, setLoading]           = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusPanel, setStatusPanel]   = useState(null); // project object
  const [showColumns, setShowColumns]   = useState(false);
  const [visibleCols, setVisibleCols]   = useState(['status', 'health', 'progress', 'dueDate', 'customFields', 'notes']);
  const [healthOverrides, setHealthOverrides] = useState({}); // projectId -> health key
  const [notesMap, setNotesMap]         = useState({}); // projectId -> notes text
  const [editingNote, setEditingNote]   = useState(null); // projectId
  const [hoveredRow, setHoveredRow]     = useState(null);
  const [statusMap2, setStatusMap2]     = useState({}); // projectId -> status
  const customFields                    = loadCustomFields().slice(0, 2);
  const columnMgrRef                    = useRef();

  // ── 載入資料 ─────────────────────────────────────────────
  useEffect(() => {
    setPortfolios(loadPortfolios());
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/projects?companyId=${COMPANY_ID}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || data.data || []);
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  // ── 關閉欄位管理器（點外側）──────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (columnMgrRef.current && !columnMgrRef.current.contains(e.target)) {
        setShowColumns(false);
      }
    }
    if (showColumns) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColumns]);

  // ── 取得目前組合的專案 ────────────────────────────────────
  const filteredProjects = selectedPf === 'all'
    ? projects
    : projects.filter(p => {
        const pf = portfolios.find(f => f.id === selectedPf);
        return pf ? pf.projects.includes(p.id) : true;
      });

  // ── 統計 ─────────────────────────────────────────────────
  const stats = filteredProjects.reduce((acc, p) => {
    acc.total++;
    const h = healthOverrides[p.id] || calcHealth(p);
    if (h === 'on_track')  acc.onTrack++;
    else if (h === 'at_risk') acc.atRisk++;
    else if (h === 'off_track') acc.offTrack++;
    return acc;
  }, { total: 0, onTrack: 0, atRisk: 0, offTrack: 0 });

  // ── 新增組合 ─────────────────────────────────────────────
  function handleAddPortfolio(pf) {
    const updated = [...portfolios, pf];
    setPortfolios(updated);
    savePortfolios(updated);
    setShowAddModal(false);
    setSelectedPf(pf.id);
  }

  // ── 切換健康度 ────────────────────────────────────────────
  function cycleHealth(projectId, current) {
    const keys = HEALTH_OPTIONS.map(h => h.key);
    const next = keys[(keys.indexOf(current) + 1) % keys.length];
    setHealthOverrides(prev => ({ ...prev, [projectId]: next }));
  }

  // ── 更新狀態 ─────────────────────────────────────────────
  function handleStatusChange(projectId, newStatus) {
    setStatusMap2(prev => ({ ...prev, [projectId]: newStatus }));
  }

  // ── 儲存狀態報告 ─────────────────────────────────────────
  function handleStatusReportSave(report) {
    setHealthOverrides(prev => ({ ...prev, [report.projectId]: report.health }));
  }

  // ── 切換欄位顯示 ─────────────────────────────────────────
  function toggleColumn(key) {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const col = (key) => visibleCols.includes(key);

  // ── 欄位標頭寬度 ─────────────────────────────────────────
  const colWidths = { project: '200px', manager: '130px', status: '110px', health: '100px', progress: '140px', dueDate: '110px', custom: '90px', notes: '180px', action: '36px' };

  const thStyle = (width) => ({
    padding: '10px 12px', background: C.lineL, fontSize: '12px', fontWeight: '700', color: C.ink3,
    textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left',
    position: 'sticky', top: 0, zIndex: 10, width, minWidth: width,
    borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap',
    boxShadow: 'inset 0 -1px 0 ' + C.line,
  });

  const tdStyle = (align = 'left') => ({
    padding: '11px 12px', fontSize: '13.5px', color: C.ink2,
    borderBottom: `1px solid ${C.lineL}`, verticalAlign: 'middle', textAlign: align,
  });

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' }}>

      {/* ── 左側組合清單 ──────────────────────────────────── */}
      <aside style={{ width: '240px', minWidth: '240px', background: C.white, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 12px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>專案組合</div>
          <button style={{ ...btnPrimary, width: '100%', justifyContent: 'center', fontSize: '13px', padding: '8px 12px' }} onClick={() => setShowAddModal(true)}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> 新增組合
          </button>
        </div>

        {/* 清單 */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {/* 全部專案 */}
          {[{ id: 'all', name: '全部專案', color: 'none', count: projects.length }].concat(
            portfolios.map(pf => ({ ...pf, count: projects.filter(p => pf.projects.includes(p.id)).length }))
          ).map(item => {
            const isAll = item.id === 'all';
            const isActive = selectedPf === item.id;
            const colorHex = isAll ? C.ink3 : (PALETTE.find(p => p.id === item.color)?.hex || C.brand);
            return (
              <div key={item.id} onClick={() => setSelectedPf(item.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', background: isActive ? '#FFF0F2' : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.lineL; }}
                onMouseLeave={e => { e.currentTarget.style.background = isActive ? '#FFF0F2' : 'transparent'; }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colorHex, flexShrink: 0, border: isAll ? `2px solid ${C.ink4}` : 'none', boxSizing: 'border-box' }} />
                <span style={{ flex: 1, fontSize: '13.5px', fontWeight: isActive ? '700' : '500', color: isActive ? C.brand : C.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
                <span style={{ fontSize: '11px', color: C.ink4, background: C.lineL, borderRadius: '10px', padding: '1px 7px', flexShrink: 0 }}>{item.count}</span>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── 右側主內容區 ──────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ padding: '20px 28px 0', background: C.bg }}>
          {/* 標題列 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: C.ink }}>
                {selectedPf === 'all' ? '全部專案' : portfolios.find(p => p.id === selectedPf)?.name || '組合'}
              </h1>
              {selectedPf !== 'all' && (
                <p style={{ margin: '3px 0 0', fontSize: '13px', color: C.ink3 }}>
                  {portfolios.find(p => p.id === selectedPf)?.description || ''}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {/* 欄位管理器 */}
              <div style={{ position: 'relative' }} ref={columnMgrRef}>
                <button style={btnOutline} onClick={() => setShowColumns(o => !o)}>
                  <span>⊞</span> 欄位管理
                </button>
                {showColumns && (
                  <ColumnManager visible={visibleCols} onChange={toggleColumn} onClose={() => setShowColumns(false)} />
                )}
              </div>
              <button style={btnOutline} onClick={fetchProjects}>↻ 重新整理</button>
            </div>
          </div>

          {/* ── 統計卡片 ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            {[
              { label: '總專案數', value: stats.total,    color: C.ink,  bgCard: C.white,         icon: '📁' },
              { label: '按計劃',   value: stats.onTrack,  color: C.green, bgCard: C.greenBg,     icon: '🟢' },
              { label: '有風險',   value: stats.atRisk,   color: C.yellow, bgCard: '#FFFBEB',    icon: '🟡' },
              { label: '已逾期',   value: stats.offTrack, color: C.red,   bgCard: C.redBg,       icon: '🔴' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bgCard, border: `1px solid ${C.line}`, borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize: '26px' }}>{card.icon}</span>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: card.color, lineHeight: 1 }}>{card.value}</div>
                  <div style={{ fontSize: '12px', color: C.ink3, marginTop: '3px' }}>{card.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 專案表格 ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 28px 28px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: C.ink3, fontSize: '15px' }}>
              <span style={{ marginRight: '10px', animation: 'spin 1s linear infinite' }}>⏳</span>
              載入中...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '12px' }}>
              <span style={{ fontSize: '48px' }}>📂</span>
              <div style={{ fontSize: '16px', fontWeight: '600', color: C.ink2 }}>此組合尚無專案</div>
              <div style={{ fontSize: '13px', color: C.ink3 }}>新增組合後，選擇要加入監控的專案</div>
            </div>
          ) : (
            <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: colWidths.project }} />
                    <col style={{ width: colWidths.manager }} />
                    {col('status')    && <col style={{ width: colWidths.status }} />}
                    {col('health')    && <col style={{ width: colWidths.health }} />}
                    {col('progress')  && <col style={{ width: colWidths.progress }} />}
                    {col('dueDate')   && <col style={{ width: colWidths.dueDate }} />}
                    {col('customFields') && customFields.map(cf => <col key={cf.id} style={{ width: colWidths.custom }} />)}
                    {col('notes')     && <col style={{ width: colWidths.notes }} />}
                    <col style={{ width: colWidths.action }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle(colWidths.project)}>專案名稱</th>
                      <th style={thStyle(colWidths.manager)}>負責人</th>
                      {col('status')   && <th style={thStyle(colWidths.status)}>狀態</th>}
                      {col('health')   && <th style={thStyle(colWidths.health)}>健康度</th>}
                      {col('progress') && <th style={thStyle(colWidths.progress)}>完成進度</th>}
                      {col('dueDate')  && <th style={thStyle(colWidths.dueDate)}>截止日期</th>}
                      {col('customFields') && customFields.map(cf => (
                        <th key={cf.id} style={thStyle(colWidths.custom)}>{cf.name || cf.label || '自訂'}</th>
                      ))}
                      {col('notes')    && <th style={thStyle(colWidths.notes)}>備註</th>}
                      <th style={{ ...thStyle(colWidths.action), textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(project => {
                      const colorHex = PALETTE.find(c => c.id === project.color)?.hex || C.brand;
                      const hkey = healthOverrides[project.id] || calcHealth(project);
                      const curStatus = statusMap2[project.id] || project.status || 'active';
                      const note = notesMap[project.id] || '';
                      const isEditingNote = editingNote === project.id;
                      const isHovered = hoveredRow === project.id;

                      return (
                        <tr key={project.id}
                          onMouseEnter={() => setHoveredRow(project.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{ background: isHovered ? '#FAFAFA' : C.white, transition: 'background 0.1s' }}>

                          {/* 專案名稱 */}
                          <td style={tdStyle()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colorHex, flexShrink: 0 }} />
                              <span
                                onClick={() => onNavigate && onNavigate('projects')}
                                title="點擊開啟專案"
                                style={{
                                  fontWeight: '600', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  cursor: onNavigate ? 'pointer' : 'default',
                                  textDecoration: isHovered && onNavigate ? 'underline' : 'none',
                                  transition: 'color 0.1s',
                                }}
                                onMouseEnter={e => { if (onNavigate) e.currentTarget.style.color = C.brand; }}
                                onMouseLeave={e => { e.currentTarget.style.color = C.ink; }}
                              >
                                {project.name}
                              </span>
                            </div>
                          </td>

                          {/* 負責人 */}
                          <td style={tdStyle()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <Avatar name={project.manager?.name || project.owner?.name || project.owner || '—'} size={26} />
                              <span style={{ fontSize: '13px', color: C.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {project.manager?.name || project.owner?.name || (typeof project.owner === 'string' ? project.owner : '—')}
                              </span>
                            </div>
                          </td>

                          {/* 狀態 */}
                          {col('status') && (
                            <td style={tdStyle()}>
                              <StatusBadge skey={curStatus} onChange={newS => handleStatusChange(project.id, newS)} />
                            </td>
                          )}

                          {/* 健康度 */}
                          {col('health') && (
                            <td style={tdStyle()}>
                              <HealthBadge hkey={hkey} onClick={() => cycleHealth(project.id, hkey)} />
                            </td>
                          )}

                          {/* 完成進度 */}
                          {col('progress') && (
                            <td style={tdStyle()}>
                              <ProgressBar pct={project.completion || project.progress || 0} />
                            </td>
                          )}

                          {/* 截止日期 */}
                          {col('dueDate') && (
                            <td style={tdStyle()}>
                              <DueDateCell iso={project.endDate || project.dueDate} />
                            </td>
                          )}

                          {/* 自訂欄位 */}
                          {col('customFields') && customFields.map(cf => (
                            <td key={cf.id} style={tdStyle()}>
                              <span style={{ fontSize: '12px', color: C.ink4 }}>—</span>
                            </td>
                          ))}

                          {/* 備註 */}
                          {col('notes') && (
                            <td style={tdStyle()}>
                              {isEditingNote ? (
                                <input
                                  autoFocus
                                  style={{ ...inputSt, padding: '4px 8px', fontSize: '12.5px', borderRadius: '6px' }}
                                  value={note}
                                  onChange={e => setNotesMap(prev => ({ ...prev, [project.id]: e.target.value }))}
                                  onBlur={() => setEditingNote(null)}
                                  onKeyDown={e => e.key === 'Enter' && setEditingNote(null)}
                                />
                              ) : (
                                <div onClick={() => setEditingNote(project.id)}
                                  title="點擊編輯備註"
                                  style={{ fontSize: '12.5px', color: note ? C.ink2 : C.ink4, cursor: 'text', padding: '4px 0', minHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {note || (isHovered ? '點擊新增備註...' : '')}
                                </div>
                              )}
                            </td>
                          )}

                          {/* 更新狀態按鈕 */}
                          <td style={{ ...tdStyle('center'), padding: '8px' }}>
                            <button
                              onClick={() => setStatusPanel({ ...project, _health: hkey })}
                              title="更新本週狀態"
                              style={{ background: isHovered ? C.lineL : 'transparent', border: `1px solid ${isHovered ? C.line : 'transparent'}`, borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: C.ink3, transition: 'all 0.1s' }}>
                              ✏
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table footer */}
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.lineL}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: C.ink4 }}>共 {filteredProjects.length} 個專案</span>
                <span style={{ fontSize: '12px', color: C.ink4 }}>點擊健康度徽章可切換狀態 · 點擊備註欄可行內編輯 · 點擊 ✏ 填寫週報</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modals & Panels ──────────────────────────────────── */}
      {showAddModal && (
        <AddPortfolioModal
          projects={projects}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddPortfolio}
        />
      )}

      {statusPanel && (
        <StatusUpdatePanel
          project={statusPanel}
          onClose={() => setStatusPanel(null)}
          onSave={handleStatusReportSave}
        />
      )}
    </div>
  );
}
