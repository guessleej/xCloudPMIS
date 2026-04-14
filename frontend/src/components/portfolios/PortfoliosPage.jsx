/**
 * PortfoliosPage — 專案組合管理
 *
 * 10.1 統計卡片：總專案數 / 按計劃（綠） / 有風險（黃） / 已逾期（紅）
 * 10.2 專案列表操作：點擊名稱跳轉、狀態下拉、健康度循環、週報面板、行內備註
 * 10.3 新增組合：名稱 / 說明 / 顏色 / 勾選專案
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';

// ── 常數 ─────────────────────────────────────────────────────
const HEALTH_CFG = {
  on_track:  { label: '按計劃', color: '#10b981', icon: '🟢' },
  off_track: { label: '有風險', color: '#f59e0b', icon: '🟡' },
  at_risk:   { label: '已逾期', color: '#ef4444', icon: '🔴' },
  on_hold:   { label: '暫停中', color: '#6b7280', icon: '⚪' },
};
const HEALTH_CYCLE = ['on_track', 'off_track', 'at_risk'];

const STATUS_OPTIONS = [
  { value: 'active',    label: '進行中', color: '#3b82f6' },
  { value: 'completed', label: '已完成', color: '#10b981' },
  { value: 'on_hold',   label: '暫停',   color: '#6b7280' },
  { value: 'cancelled', label: '取消',   color: '#ef4444' },
];

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

// ── 小元件 ───────────────────────────────────────────────────

function StatCard({ icon, label, value, color, loading }) {
  return (
    <div style={{
      background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 140,
    }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color }}>{loading ? '—' : value}</div>
        <div style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

/* 狀態下拉 */
function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cfg = STATUS_OPTIONS.find(o => o.value === value) || STATUS_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
        background: `${cfg.color}14`, color: cfg.color,
        fontSize: 14, fontWeight: 600, border: `1px solid ${cfg.color}30`,
      }}>
        {cfg.label} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 200,
          background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          minWidth: 120, overflow: 'hidden',
        }}>
          {STATUS_OPTIONS.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{
              width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
              background: o.value === value ? `${o.color}14` : 'transparent',
              color: o.color, fontSize: 14, fontWeight: 600, textAlign: 'left',
            }}>
              ● {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* 健康度徽章（點擊循環切換） */
function HealthBadge({ health, onClick }) {
  const cfg = HEALTH_CFG[health] || HEALTH_CFG.on_track;
  return (
    <button onClick={onClick} title="點擊循環切換健康度" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 8,
      background: `${cfg.color}14`, color: cfg.color,
      fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
    }}>
      {cfg.icon} {cfg.label}
    </button>
  );
}

/* 行內編輯備註 */
function InlineNotes({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft !== (value || '')) onSave(draft);
  };

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} title="點擊編輯備註" style={{
        fontSize: 14, color: value ? 'var(--xc-text-soft)' : 'var(--xc-text-muted)',
        cursor: 'pointer', fontStyle: value ? 'normal' : 'italic',
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'inline-block',
      }}>
        {value || '點擊新增備註…'}
      </span>
    );
  }

  return (
    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
      style={{
        fontSize: 14, padding: '3px 6px', borderRadius: 4, width: 180,
        border: '1px solid var(--xc-brand)', outline: 'none',
        background: 'var(--xc-surface)', color: 'var(--xc-text)',
      }}
    />
  );
}

/* 更多操作（···） */
function MoreMenu({ onWeeklyReport, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: open ? 'var(--xc-surface-strong)' : 'transparent',
        cursor: 'pointer', fontSize: 16, color: 'var(--xc-text-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>···</button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 200,
          background: 'var(--xc-surface)', border: '1px solid var(--xc-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          minWidth: 150, overflow: 'hidden',
        }}>
          <button onClick={() => { onWeeklyReport(); setOpen(false); }} style={{
            width: '100%', padding: '9px 14px', border: 'none', cursor: 'pointer',
            background: 'transparent', textAlign: 'left', fontSize: 14,
            color: 'var(--xc-text)',
          }}>📝 填寫週報</button>
          <button onClick={() => { onRemove(); setOpen(false); }} style={{
            width: '100%', padding: '9px 14px', border: 'none', cursor: 'pointer',
            background: 'transparent', textAlign: 'left', fontSize: 14,
            color: '#ef4444',
          }}>✕ 從組合移除</button>
        </div>
      )}
    </div>
  );
}

/* 週報面板（Modal） */
function WeeklyReportModal({ project, onClose, onSave }) {
  const [report, setReport] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(4px)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: '95vw', background: 'var(--xc-surface)', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,.25)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'modalIn .2s ease',
      }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform: translate(-50%,-50%) scale(.95); } to { opacity:1; transform: translate(-50%,-50%) scale(1); } }`}</style>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--xc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--xc-text)' }}>📝 本週狀態更新</div>
            <div style={{ fontSize: 14, color: 'var(--xc-text-muted)', marginTop: 2 }}>{project.name}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--xc-surface-strong)', cursor: 'pointer', fontSize: 16, color: 'var(--xc-text-soft)' }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <textarea
            value={report} onChange={e => setReport(e.target.value)}
            placeholder="描述本週進展、遇到的問題、下週計畫…"
            rows={6}
            style={{
              width: '100%', borderRadius: 8, border: '1px solid var(--xc-border)',
              padding: 12, fontSize: 15, background: 'var(--xc-surface)',
              color: 'var(--xc-text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--xc-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: 14, color: 'var(--xc-text-soft)' }}>取消</button>
          <button
            disabled={saving || !report.trim()}
            onClick={async () => {
              setSaving(true);
              await onSave(report.trim());
              setSaving(false);
              onClose();
            }}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--xc-brand)', color: '#fff', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, opacity: !report.trim() ? 0.5 : 1,
            }}
          >
            {saving ? '儲存中…' : '儲存週報'}
          </button>
        </div>
      </div>
    </>
  );
}

/* 新增組合 Modal */
function CreatePortfolioModal({ onClose, onCreate, allProjects }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [searchProject, setSearchProject] = useState('');

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const filteredProjects = allProjects.filter(p =>
    !searchProject || p.name.toLowerCase().includes(searchProject.toLowerCase())
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(4px)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 520, maxWidth: '95vw', maxHeight: '90vh', background: 'var(--xc-surface)',
        borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.25)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'modalIn .2s ease',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--xc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--xc-text)' }}>➕ 新增組合</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--xc-surface-strong)', cursor: 'pointer', fontSize: 16, color: 'var(--xc-text-soft)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 名稱 */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text)', display: 'block', marginBottom: 6 }}>組合名稱 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：2026 Q2 重點專案"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--xc-border)', fontSize: 15, background: 'var(--xc-surface)', color: 'var(--xc-text)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* 說明 */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text)', display: 'block', marginBottom: 6 }}>說明</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="簡要描述此組合目的…" rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--xc-border)', fontSize: 15, background: 'var(--xc-surface)', color: 'var(--xc-text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* 顏色 */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text)', display: 'block', marginBottom: 6 }}>顏色</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 28, height: 28, borderRadius: 8, border: color === c ? '2px solid var(--xc-text)' : '2px solid transparent',
                  background: c, cursor: 'pointer', transition: 'border .1s',
                }} />
              ))}
            </div>
          </div>

          {/* 選擇專案 */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text)', display: 'block', marginBottom: 6 }}>
              納入專案 {selectedIds.size > 0 && <span style={{ color: 'var(--xc-brand)', fontWeight: 700 }}>（已選 {selectedIds.size}）</span>}
            </label>
            <input value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="🔍 搜尋專案…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--xc-border)', fontSize: 14, background: 'var(--xc-surface)', color: 'var(--xc-text)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--xc-border)', borderRadius: 8, background: 'var(--xc-surface-soft)' }}>
              {filteredProjects.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 14, color: 'var(--xc-text-muted)' }}>無符合的專案</div>
              ) : filteredProjects.map(p => (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  cursor: 'pointer', borderBottom: '1px solid var(--xc-border)',
                  background: selectedIds.has(p.id) ? 'color-mix(in srgb, var(--xc-brand) 8%, var(--xc-surface))' : 'transparent',
                }}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: 'var(--xc-brand)' }} />
                  <span style={{ fontSize: 15, color: 'var(--xc-text)' }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--xc-text-muted)', marginLeft: 'auto' }}>
                    {(STATUS_OPTIONS.find(o => o.value === p.status) || STATUS_OPTIONS[0]).label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--xc-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--xc-border)', background: 'var(--xc-surface)', cursor: 'pointer', fontSize: 14, color: 'var(--xc-text-soft)' }}>取消</button>
          <button
            disabled={creating || !name.trim()}
            onClick={async () => {
              setCreating(true);
              await onCreate({ name: name.trim(), description: desc, color, projectIds: [...selectedIds] });
              setCreating(false);
            }}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--xc-brand)', color: '#fff', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, opacity: !name.trim() ? 0.5 : 1,
            }}
          >
            {creating ? '建立中…' : '建立組合'}
          </button>
        </div>
      </div>
    </>
  );
}


// ════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════
export default function PortfoliosPage({ onNavigate }) {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [portfolios,    setPortfolios]    = useState([]);
  const [allProjects,   setAllProjects]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [activeId,      setActiveId]      = useState(null); // 選中的組合 id
  const [showCreate,    setShowCreate]    = useState(false);
  const [weeklyTarget,  setWeeklyTarget]  = useState(null); // project for weekly report

  // ── 載入 ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`/api/portfolios?companyId=${companyId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d    = json.data || json;
      setPortfolios(d.portfolios || []);
      setAllProjects(d.allProjects || []);
      // 自動選中第一個
      if (!activeId && d.portfolios?.length > 0) {
        setActiveId(d.portfolios[0].id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch, activeId]);

  useEffect(() => { load(); }, [load]);

  const active = portfolios.find(p => p.id === activeId);

  // ── CRUD helpers ───────────────────────────────────────
  const createPortfolio = async ({ name, description, color, projectIds }) => {
    try {
      await authFetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name, description, color, projectIds }),
      });
      setShowCreate(false);
      const prev = activeId;
      await load();
      // 選中新建的
      setActiveId(prev2 => {
        const updated = portfolios;
        return prev2;
      });
      // 重新 load 後選中最新的
      setPortfolios(prev2 => {
        if (prev2.length > 0) setActiveId(prev2[prev2.length - 1].id);
        return prev2;
      });
    } catch (e) {
      console.error('[create portfolio]', e);
    }
  };

  const deletePortfolio = async (id) => {
    if (!confirm('確定要刪除此組合？')) return;
    try {
      await authFetch(`/api/portfolios/${id}`, { method: 'DELETE' });
      setActiveId(null);
      load();
    } catch (e) {
      console.error('[delete portfolio]', e);
    }
  };

  const changeProjectStatus = async (projectId, newStatus) => {
    // 樂觀更新
    setPortfolios(prev => prev.map(pf => ({
      ...pf,
      projects: pf.projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p),
    })));
    try {
      await authFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (e) {
      console.error('[change status]', e);
      load();
    }
  };

  const cycleHealth = async (projectId, currentHealth) => {
    if (!active) return;
    const idx = HEALTH_CYCLE.indexOf(currentHealth);
    const next = HEALTH_CYCLE[(idx + 1) % HEALTH_CYCLE.length];
    // 樂觀更新
    setPortfolios(prev => prev.map(pf => ({
      ...pf,
      projects: pf.projects.map(p => p.id === projectId ? { ...p, health: next } : p),
    })));
    try {
      await authFetch(`/api/portfolios/${active.id}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ healthOverride: next }),
      });
    } catch (e) {
      console.error('[cycle health]', e);
      load();
    }
  };

  const updateNotes = async (portfolioId, projectId, notes) => {
    // 樂觀更新
    setPortfolios(prev => prev.map(pf => pf.id === portfolioId ? {
      ...pf,
      projects: pf.projects.map(p => p.id === projectId ? { ...p, notes } : p),
    } : pf));
    try {
      await authFetch(`/api/portfolios/${portfolioId}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
    } catch (e) {
      console.error('[update notes]', e);
      load();
    }
  };

  const removeProject = async (portfolioId, projectId) => {
    setPortfolios(prev => prev.map(pf => pf.id === portfolioId ? {
      ...pf,
      projects: pf.projects.filter(p => p.id !== projectId),
    } : pf));
    try {
      await authFetch(`/api/portfolios/${portfolioId}/projects/${projectId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('[remove project]', e);
      load();
    }
  };

  const saveWeeklyReport = async (text) => {
    // 儲存為備註（附上日期）
    if (!weeklyTarget || !active) return;
    const dateStr = new Date().toLocaleDateString('zh-TW');
    const newNotes = `[${dateStr} 週報] ${text}`;
    await updateNotes(active.id, weeklyTarget.id, newNotes);
  };

  // ── 渲染 ───────────────────────────────────────────────
  const summary = active?.summary || { totalProjects: 0, onTrack: 0, offTrack: 0, atRisk: 0 };
  const projects = active?.projects || [];

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%', overflow: 'hidden' }}>

      {/* ═══ 左側：組合列表 ═══ */}
      <div style={{
        width: isMobile ? '100%' : 240, minWidth: isMobile ? 0 : 240,
        borderRight: isMobile ? 'none' : '1px solid var(--xc-border)',
        borderBottom: isMobile ? '1px solid var(--xc-border)' : 'none',
        display: 'flex', flexDirection: isMobile ? 'row' : 'column',
        background: 'var(--xc-surface-soft)',
        overflowX: isMobile ? 'auto' : 'visible',
        flexShrink: 0,
      }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--xc-border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--xc-text)', marginBottom: 12 }}>專案組合</div>
          <button onClick={() => setShowCreate(true)} style={{
            width: '100%', padding: '9px 0', borderRadius: 8, border: '1px dashed var(--xc-border)',
            background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: 'var(--xc-brand)', transition: 'background .1s',
          }}>
            ＋ 新增組合
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading && portfolios.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: 14 }}>載入中…</div>
          ) : portfolios.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--xc-text-muted)', fontSize: 14 }}>
              尚無組合<br />點擊上方按鈕建立
            </div>
          ) : portfolios.map(pf => (
            <button key={pf.id} onClick={() => setActiveId(pf.id)} style={{
              width: '100%', padding: '10px 12px', marginBottom: 4, borderRadius: 8,
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: pf.id === activeId ? 'color-mix(in srgb, var(--xc-brand) 12%, var(--xc-surface))' : 'transparent',
              transition: 'background .1s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: pf.color, flexShrink: 0 }} />
                <span style={{
                  fontSize: 15, fontWeight: pf.id === activeId ? 700 : 500,
                  color: pf.id === activeId ? 'var(--xc-brand)' : 'var(--xc-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{pf.name}</span>
                <span style={{ fontSize: 13, color: 'var(--xc-text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                  {pf.summary.totalProjects}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 右側：組合內容 ═══ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 16px' : '28px 32px' }}>
        {!active ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <div style={{ fontSize: 50 }}>📁</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--xc-text)' }}>
              {portfolios.length === 0 ? '建立你的第一個組合' : '選擇一個組合'}
            </div>
            <div style={{ fontSize: 15, color: 'var(--xc-text-muted)' }}>
              從左側選擇或新增組合來管理多專案
            </div>
            {portfolios.length === 0 && (
              <button onClick={() => setShowCreate(true)} style={{
                marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'var(--xc-brand)', color: '#fff', cursor: 'pointer',
                fontSize: 15, fontWeight: 700,
              }}>＋ 新增組合</button>
            )}
          </div>
        ) : (
          <>
            {/* 組合標題 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: active.color }} />
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--xc-text)', margin: 0 }}>{active.name}</h1>
                </div>
                {active.description && (
                  <p style={{ fontSize: 15, color: 'var(--xc-text-muted)', margin: '6px 0 0 24px' }}>{active.description}</p>
                )}
              </div>
              <button onClick={() => deletePortfolio(active.id)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--xc-border)',
                background: 'var(--xc-surface)', cursor: 'pointer', fontSize: 14,
                color: '#ef4444',
              }}>🗑 刪除組合</button>
            </div>

            {/* 10.1 統計卡片 */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatCard icon="📁" label="總專案數"        value={summary.totalProjects} color="var(--xc-brand)" loading={loading} />
              <StatCard icon="🟢" label="按計劃"          value={summary.onTrack}       color="#10b981"          loading={loading} />
              <StatCard icon="🟡" label="有風險"          value={summary.offTrack}      color="#f59e0b"          loading={loading} />
              <StatCard icon="🔴" label="已逾期"          value={summary.atRisk}        color="#ef4444"          loading={loading} />
            </div>

            {/* 錯誤 */}
            {error && (
              <div style={{ padding: 14, borderRadius: 10, marginBottom: 16, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#ef4444', fontSize: 15 }}>
                ⚠️ {error}
              </div>
            )}

            {/* 10.2 專案列表 */}
            {projects.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--xc-surface)', border: '2px dashed var(--xc-border)', borderRadius: 16 }}>
                <div style={{ fontSize: 42, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--xc-text)', marginBottom: 6 }}>此組合尚無專案</div>
                <div style={{ fontSize: 15, color: 'var(--xc-text-muted)' }}>編輯組合以新增專案</div>
              </div>
            ) : (
              <div style={{ background: 'var(--xc-surface)', border: '1px solid var(--xc-border)', borderRadius: 12, overflowX: isMobile ? 'auto' : 'visible' }}>
                {/* 表頭 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 100px 90px 110px 60px 180px 40px',
                  minWidth: isMobile ? '700px' : undefined,
                  alignItems: 'center', gap: 10, padding: '10px 16px',
                  background: 'var(--xc-surface-soft)', borderBottom: '1px solid var(--xc-border)',
                  borderRadius: '12px 12px 0 0',
                }}>
                  {['專案名稱', '狀態', '健康度', '進度', '逾期', '備註', ''].map(h => (
                    <div key={h} style={{ fontSize: 13, fontWeight: 700, color: 'var(--xc-text-muted)' }}>{h}</div>
                  ))}
                </div>

                {/* 列 */}
                {projects.map(p => {
                  const pctColor = p.progress >= 80 ? '#10b981' : p.progress >= 50 ? '#f59e0b' : '#3b82f6';
                  return (
                    <div key={p.id} style={{
                      display: 'grid', gridTemplateColumns: '2fr 100px 90px 110px 60px 180px 40px',
                      alignItems: 'center', gap: 10, padding: '12px 16px',
                      borderBottom: '1px solid var(--xc-border)',
                    }}>
                      {/* 專案名稱（可點擊跳轉） */}
                      <div>
                        <button onClick={() => onNavigate?.('projects')} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          fontSize: 15, fontWeight: 600, color: 'var(--xc-text)',
                          textDecoration: 'none',
                        }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--xc-brand)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--xc-text)'}
                        >
                          {p.name}
                        </button>
                        <div style={{ fontSize: 13, color: 'var(--xc-text-muted)', marginTop: 2 }}>
                          👤 {p.memberCount} 人 · ⏱ {p.totalHours}h
                        </div>
                      </div>

                      {/* 切換狀態 */}
                      <StatusDropdown value={p.status} onChange={(v) => changeProjectStatus(p.id, v)} />

                      {/* 切換健康度 */}
                      <HealthBadge health={p.health} onClick={() => cycleHealth(p.id, p.health)} />

                      {/* 進度 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--xc-border)', overflow: 'hidden' }}>
                          <div style={{ width: `${p.progress}%`, height: '100%', background: pctColor, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: pctColor, flexShrink: 0 }}>{p.progress}%</span>
                      </div>

                      {/* 逾期 */}
                      <div style={{
                        textAlign: 'center', fontSize: 14, fontWeight: p.overdue > 0 ? 700 : 400,
                        color: p.overdue > 0 ? '#ef4444' : 'var(--xc-text-muted)',
                      }}>
                        {p.overdue}
                      </div>

                      {/* 備註（行內編輯） */}
                      <InlineNotes value={p.notes} onSave={(v) => updateNotes(active.id, p.id, v)} />

                      {/* 更多操作 */}
                      <MoreMenu
                        onWeeklyReport={() => setWeeklyTarget(p)}
                        onRemove={() => removeProject(active.id, p.id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ Modals ═══ */}
      {showCreate && (
        <CreatePortfolioModal
          onClose={() => setShowCreate(false)}
          onCreate={createPortfolio}
          allProjects={allProjects}
        />
      )}

      {weeklyTarget && (
        <WeeklyReportModal
          project={weeklyTarget}
          onClose={() => setWeeklyTarget(null)}
          onSave={saveWeeklyReport}
        />
      )}
    </div>
  );
}
