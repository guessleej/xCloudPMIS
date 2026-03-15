/**
 * GoalsPage — Asana 風格目標管理（OKR）頁面
 *
 * 功能：
 *   - 季度目標篩選（Q1–Q4 2026）
 *   - 列表 / 樹狀圖 視圖切換
 *   - Goal 卡片（狀態色條、SVG 進度環、展開 KR）
 *   - 新增目標 Modal（KR 動態新增、負責人從 API）
 *   - localStorage 持久化（'xcloud-goals'）
 *   - 頂部統計卡片 + 整體完成率進度環
 *
 * 品牌色：accent #C41230，pageBg #F7F2F2
 */

import { useState, useEffect, useCallback } from 'react';

// ── 設計 Token ──────────────────────────────────────────────────
const T = {
  accent:   '#C41230',
  accentLt: '#F04060',
  pageBg:   '#F7F2F2',
  cardBg:   '#FFFFFF',
  border:   '#E8E0E0',
  t1:       '#1A0A0D',
  t2:       '#6B5558',
  t3:       '#9E8E90',
  success:  '#22C55E',
  warning:  '#F59E0B',
  danger:   '#EF4444',
  neutral:  '#94A3B8',
};

// ── 狀態設定 ────────────────────────────────────────────────────
const STATUS_CONFIG = {
  on_track:  { label: '按計劃', color: T.success,  bg: '#DCFCE7' },
  at_risk:   { label: '有風險', color: T.warning,  bg: '#FEF9C3' },
  off_track: { label: '落後',   color: T.danger,   bg: '#FEE2E2' },
  completed: { label: '已完成', color: T.neutral,  bg: '#F1F5F9' },
};

const TYPE_CONFIG = {
  company:  { label: '公司', color: '#7C3AED', bg: '#EDE9FE' },
  team:     { label: '團隊', color: '#0891B2', bg: '#E0F7FA' },
  personal: { label: '個人', color: '#059669', bg: '#D1FAE5' },
};

const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'];

// ── 示範資料 ────────────────────────────────────────────────────
const DEMO_GOALS = [
  {
    id: 'g1',
    title: '年度營收成長 30%',
    description: '透過新客戶開發與既有客戶擴充，實現年度整體營收成長目標',
    owner: '陳志明',
    ownerInitial: '陳',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'on_track',
    progress: 65,
    type: 'company',
    quarter: 'Q2 2026',
    parentId: null,
    keyResults: [
      { id: 'kr1', title: '新客戶簽約數', current: 28, target: 40, unit: '件', progress: 70 },
      { id: 'kr2', title: '既有客戶 upsell 金額', current: 6500000, target: 10000000, unit: 'NT$', progress: 65 },
      { id: 'kr3', title: '月均 MRR 成長率', current: 8, target: 12, unit: '%', progress: 67 },
    ],
  },
  {
    id: 'g2',
    title: '客戶滿意度達 90%',
    description: '提升整體客戶體驗，NPS 分數達到業界領先水準',
    owner: '林雅婷',
    ownerInitial: '林',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    status: 'at_risk',
    progress: 42,
    type: 'company',
    quarter: 'Q2 2026',
    parentId: null,
    keyResults: [
      { id: 'kr4', title: 'NPS 分數', current: 38, target: 60, unit: '分', progress: 63 },
      { id: 'kr5', title: 'CSAT 滿意度', current: 75, target: 90, unit: '%', progress: 83 },
      { id: 'kr6', title: '客訴處理時效（小時）', current: 4.2, target: 2, unit: 'h', progress: 25 },
    ],
  },
  {
    id: 'g3',
    title: 'Q2 交付 5 個主要功能',
    description: '產品團隊完成 Q2 規劃的核心功能開發並上線',
    owner: '王建國',
    ownerInitial: '王',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    status: 'on_track',
    progress: 80,
    type: 'team',
    quarter: 'Q2 2026',
    parentId: 'g1',
    keyResults: [
      { id: 'kr7', title: '功能上線數', current: 4, target: 5, unit: '件', progress: 80 },
      { id: 'kr8', title: 'Bug 修復率', current: 92, target: 95, unit: '%', progress: 97 },
      { id: 'kr9', title: 'Sprint 完成率', current: 85, target: 90, unit: '%', progress: 94 },
    ],
  },
  {
    id: 'g4',
    title: '完成 AWS 認證',
    description: '取得 AWS Solutions Architect Professional 認證，提升雲端架構能力',
    owner: '張偉倫',
    ownerInitial: '張',
    startDate: '2026-01-15',
    endDate: '2026-05-31',
    status: 'on_track',
    progress: 55,
    type: 'personal',
    quarter: 'Q2 2026',
    parentId: null,
    keyResults: [
      { id: 'kr10', title: '學習時數', current: 55, target: 100, unit: 'h', progress: 55 },
      { id: 'kr11', title: '模擬考通過數', current: 3, target: 5, unit: '次', progress: 60 },
    ],
  },
  {
    id: 'g5',
    title: '行銷管道多元化',
    description: '開發 SEO、社群媒體、內容行銷等多元獲客管道',
    owner: '劉美華',
    ownerInitial: '劉',
    startDate: '2026-01-01',
    endDate: '2026-09-30',
    status: 'off_track',
    progress: 28,
    type: 'team',
    quarter: 'Q3 2026',
    parentId: 'g1',
    keyResults: [
      { id: 'kr12', title: 'SEO 自然流量成長', current: 15, target: 50, unit: '%', progress: 30 },
      { id: 'kr13', title: '社群粉絲增長', current: 1200, target: 5000, unit: '人', progress: 24 },
      { id: 'kr14', title: '內容文章發布數', current: 8, target: 24, unit: '篇', progress: 33 },
    ],
  },
  {
    id: 'g6',
    title: '建立跨部門協作流程',
    description: '制定並落實跨部門溝通標準作業程序，減少協作摩擦',
    owner: '陳志明',
    ownerInitial: '陳',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    status: 'completed',
    progress: 100,
    type: 'company',
    quarter: 'Q1 2026',
    parentId: null,
    keyResults: [
      { id: 'kr15', title: 'SOP 文件完成度', current: 100, target: 100, unit: '%', progress: 100 },
      { id: 'kr16', title: '跨部門會議效率評分', current: 4.5, target: 4.0, unit: '分', progress: 100 },
    ],
  },
];

// ── SVG 進度環元件 ──────────────────────────────────────────────
function ProgressRing({ progress, size = 48, strokeWidth = 4, color }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (progress / 100) * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#EDE8E8" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color || T.accent}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

// ── 進度條元件 ──────────────────────────────────────────────────
function ProgressBar({ progress, color }) {
  return (
    <div style={{
      height: 6, borderRadius: 3,
      background: '#EDE8E8', overflow: 'hidden', flex: 1,
    }}>
      <div style={{
        height: '100%',
        width: `${Math.min(progress, 100)}%`,
        background: color || T.accent,
        borderRadius: 3,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

// ── 負責人頭像 ──────────────────────────────────────────────────
function Avatar({ initial, name, size = 28 }) {
  const colors = ['#7C3AED', '#0891B2', '#059669', '#D97706', T.accent];
  const idx = (initial?.charCodeAt(0) || 0) % colors.length;
  return (
    <div title={name} style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[idx], color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600, flexShrink: 0,
      cursor: 'default',
    }}>
      {initial}
    </div>
  );
}

// ── 標籤元件 ────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      color, background: bg, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── 統計卡片 ────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: T.cardBg, borderRadius: 12, padding: '16px 20px',
      border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.t1, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: T.t2, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── 關鍵結果列 ──────────────────────────────────────────────────
function KeyResultRow({ kr }) {
  const status = kr.progress >= 70 ? T.success : kr.progress >= 40 ? T.warning : T.danger;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: status, flexShrink: 0,
      }} />
      <div style={{ flex: 1, fontSize: 13, color: T.t1 }}>{kr.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
        <ProgressBar progress={kr.progress} color={status} />
        <span style={{ fontSize: 11, color: T.t2, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
          {kr.current} / {kr.target} {kr.unit}
        </span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: status, minWidth: 32, textAlign: 'right' }}>
        {kr.progress}%
      </span>
    </div>
  );
}

// ── Goal 卡片 ───────────────────────────────────────────────────
function GoalCard({ goal, level = 0, children }) {
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
  const tc = TYPE_CONFIG[goal.type] || TYPE_CONFIG.personal;
  const progressColor =
    goal.status === 'on_track'  ? T.success :
    goal.status === 'at_risk'   ? T.warning :
    goal.status === 'off_track' ? T.danger  : T.neutral;

  return (
    <div style={{ marginLeft: level * 24 }}>
      <div style={{
        background: T.cardBg,
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${sc.color}`,
        borderRadius: level > 0 ? '0 10px 10px 0' : 10,
        marginBottom: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
      }}>
        {/* 卡片主體 */}
        <div style={{
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* 進度環 */}
          <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
            <ProgressRing progress={goal.progress} size={48} strokeWidth={4} color={progressColor} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: progressColor,
            }}>
              {goal.progress}%
            </div>
          </div>

          {/* 主要資訊 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: T.t1 }}>{goal.title}</span>
              <Badge label={tc.label} color={tc.color} bg={tc.bg} />
              <Badge label={sc.label} color={sc.color} bg={sc.bg} />
            </div>
            {goal.description && (
              <div style={{ fontSize: 12, color: T.t2, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {goal.description}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Avatar initial={goal.ownerInitial} name={goal.owner} size={20} />
              <span style={{ fontSize: 12, color: T.t2 }}>{goal.owner}</span>
              <span style={{ fontSize: 11, color: T.t3 }}>·</span>
              <span style={{ fontSize: 12, color: T.t3 }}>
                截止 {goal.endDate}
              </span>
              {goal.keyResults?.length > 0 && (
                <>
                  <span style={{ fontSize: 11, color: T.t3 }}>·</span>
                  <span style={{ fontSize: 12, color: T.t3 }}>{goal.keyResults.length} 個關鍵結果</span>
                </>
              )}
            </div>
          </div>

          {/* 操作區 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {goal.keyResults?.length > 0 && (
              <button
                onClick={() => setExpanded(p => !p)}
                style={{
                  background: expanded ? '#F5F0F0' : 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6, padding: '4px 10px',
                  cursor: 'pointer', fontSize: 12, color: T.t2,
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>▾</span>
                關鍵結果
              </button>
            )}
          </div>
        </div>

        {/* 展開的關鍵結果 */}
        {expanded && goal.keyResults?.length > 0 && (
          <div style={{
            padding: '0 16px 12px',
            borderTop: `1px solid ${T.border}`,
            background: '#FDFAFA',
          }}>
            <div style={{ paddingTop: 10 }}>
              {goal.keyResults.map(kr => (
                <KeyResultRow key={kr.id} kr={kr} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 子目標 */}
      {children}
    </div>
  );
}

// ── 樹狀視圖 ────────────────────────────────────────────────────
function TreeView({ goals }) {
  const roots = goals.filter(g => !g.parentId);
  const childMap = {};
  goals.forEach(g => {
    if (g.parentId) {
      if (!childMap[g.parentId]) childMap[g.parentId] = [];
      childMap[g.parentId].push(g);
    }
  });

  const renderNode = (goal, level = 0) => (
    <GoalCard key={goal.id} goal={goal} level={level}>
      {(childMap[goal.id] || []).map(child => renderNode(child, level + 1))}
    </GoalCard>
  );

  return <div>{roots.map(g => renderNode(g, 0))}</div>;
}

// ── 新增 KR 表單列 ──────────────────────────────────────────────
function KrFormRow({ kr, idx, onChange, onRemove }) {
  const inputStyle = {
    border: `1px solid ${T.border}`, borderRadius: 6,
    padding: '6px 10px', fontSize: 13, color: T.t1,
    background: '#FDFAFA', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ flex: 3 }}>
        <input
          placeholder={`關鍵結果 ${idx + 1} 名稱`}
          value={kr.title} onChange={e => onChange(idx, 'title', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ flex: 1 }}>
        <input
          type="number" placeholder="目標值"
          value={kr.target} onChange={e => onChange(idx, 'target', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ flex: 1 }}>
        <input
          placeholder="單位" value={kr.unit}
          onChange={e => onChange(idx, 'unit', e.target.value)}
          style={inputStyle}
        />
      </div>
      <button
        onClick={() => onRemove(idx)}
        style={{
          background: '#FEE2E2', border: 'none', borderRadius: 6,
          width: 32, height: 32, cursor: 'pointer',
          color: T.danger, fontSize: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}

// ── 新增目標 Modal ──────────────────────────────────────────────
function AddGoalModal({ onClose, onSave, teamMembers }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'company',
    owner: '', startDate: '', endDate: '',
    status: 'on_track', quarter: 'Q2 2026',
  });
  const [krs, setKrs] = useState([
    { title: '', target: '', unit: '%' },
  ]);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleKrChange = (idx, field, val) => {
    setKrs(prev => prev.map((kr, i) => i === idx ? { ...kr, [field]: val } : kr));
  };
  const addKr = () => setKrs(p => [...p, { title: '', target: '', unit: '%' }]);
  const removeKr = idx => setKrs(p => p.filter((_, i) => i !== idx));

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = '請填寫目標名稱';
    if (!form.owner) e.owner = '請選擇負責人';
    if (!form.endDate) e.endDate = '請選擇截止日期';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const ownerObj = teamMembers.find(m => m.id === Number(form.owner)) || {};
    const ownerName = ownerObj.name || form.owner;
    const ownerInitial = ownerName.slice(0, 1);

    const goal = {
      id: 'g' + Date.now(),
      ...form,
      owner: ownerName,
      ownerInitial,
      progress: 0,
      parentId: null,
      keyResults: krs
        .filter(kr => kr.title.trim())
        .map((kr, i) => ({
          id: 'kr' + Date.now() + i,
          title: kr.title,
          current: 0,
          target: Number(kr.target) || 100,
          unit: kr.unit || '%',
          progress: 0,
        })),
    };
    onSave(goal);
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: T.t2, marginBottom: 4, display: 'block' };
  const inputStyle = {
    border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '8px 12px', fontSize: 13, color: T.t1,
    background: '#FDFAFA', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  const errStyle = { fontSize: 11, color: T.danger, marginTop: 3 };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(20,8,12,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: T.t1 }}>新增目標</div>
            <div style={{ fontSize: 12, color: T.t2, marginTop: 2 }}>建立新的 OKR 目標與關鍵結果</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 20, color: T.t3, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {/* 目標名稱 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>目標名稱 <span style={{ color: T.danger }}>*</span></label>
            <input
              placeholder="輸入目標名稱..."
              value={form.title} onChange={e => set('title', e.target.value)}
              style={{ ...inputStyle, borderColor: errors.title ? T.danger : T.border }}
            />
            {errors.title && <div style={errStyle}>{errors.title}</div>}
          </div>

          {/* 說明 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>說明</label>
            <textarea
              placeholder="描述這個目標的背景與目的..."
              value={form.description} onChange={e => set('description', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* 類型 + 狀態 + 季度 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>類型</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
                <option value="company">公司</option>
                <option value="team">團隊</option>
                <option value="personal">個人</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>狀態</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                <option value="on_track">按計劃</option>
                <option value="at_risk">有風險</option>
                <option value="off_track">落後</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>季度</label>
              <select value={form.quarter} onChange={e => set('quarter', e.target.value)} style={inputStyle}>
                {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>

          {/* 負責人 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>負責人 <span style={{ color: T.danger }}>*</span></label>
            <select
              value={form.owner} onChange={e => set('owner', e.target.value)}
              style={{ ...inputStyle, borderColor: errors.owner ? T.danger : T.border }}
            >
              <option value="">選擇負責人...</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {errors.owner && <div style={errStyle}>{errors.owner}</div>}
          </div>

          {/* 開始/截止日期 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>開始日期</label>
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>截止日期 <span style={{ color: T.danger }}>*</span></label>
              <input
                type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.endDate ? T.danger : T.border }}
              />
              {errors.endDate && <div style={errStyle}>{errors.endDate}</div>}
            </div>
          </div>

          {/* 關鍵結果 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>關鍵結果</label>
              <button
                onClick={addKr}
                style={{
                  background: T.accent + '12', border: `1px solid ${T.accent}40`,
                  borderRadius: 6, padding: '4px 12px',
                  cursor: 'pointer', fontSize: 12, color: T.accent, fontWeight: 600,
                }}
              >+ 新增</button>
            </div>
            {/* 欄位標頭 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, paddingRight: 40 }}>
              <div style={{ flex: 3, fontSize: 11, color: T.t3 }}>名稱</div>
              <div style={{ flex: 1, fontSize: 11, color: T.t3 }}>目標值</div>
              <div style={{ flex: 1, fontSize: 11, color: T.t3 }}>單位</div>
            </div>
            {krs.map((kr, idx) => (
              <KrFormRow key={idx} kr={kr} idx={idx} onChange={handleKrChange} onRemove={removeKr} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          position: 'sticky', bottom: 0, background: '#fff',
        }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${T.border}`,
            borderRadius: 8, padding: '8px 20px',
            cursor: 'pointer', fontSize: 13, color: T.t2,
          }}>取消</button>
          <button onClick={handleSave} style={{
            background: T.accent, border: 'none',
            borderRadius: 8, padding: '8px 24px',
            cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600,
            boxShadow: `0 2px 8px ${T.accent}40`,
          }}>儲存目標</button>
        </div>
      </div>
    </div>
  );
}

// ── 主頁面 ──────────────────────────────────────────────────────
export default function GoalsPage() {
  const [goals, setGoals] = useState(() => {
    try {
      const saved = localStorage.getItem('xcloud-goals');
      return saved ? JSON.parse(saved) : DEMO_GOALS;
    } catch {
      return DEMO_GOALS;
    }
  });

  const [quarter, setQuarter] = useState('Q2 2026');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'tree'
  const [showModal, setShowModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  // 持久化
  useEffect(() => {
    localStorage.setItem('xcloud-goals', JSON.stringify(goals));
  }, [goals]);

  // 取得團隊成員
  useEffect(() => {
    fetch('http://localhost:3010/api/team?companyId=2')
      .then(r => r.json())
      .then(data => {
        const members = Array.isArray(data) ? data : (data.members || data.data || []);
        setTeamMembers(members.map(m => ({ id: m.id, name: m.name || m.displayName || m.username })));
      })
      .catch(() => {
        // fallback：使用目標中已有的負責人
        const seen = new Set();
        const fallback = [];
        goals.forEach(g => {
          if (!seen.has(g.owner)) {
            seen.add(g.owner);
            fallback.push({ id: g.owner, name: g.owner });
          }
        });
        setTeamMembers(fallback);
      });
  }, []);

  // 篩選當前季度
  const filtered = goals.filter(g => g.quarter === quarter);

  // 統計
  const total = filtered.length;
  const onTrack   = filtered.filter(g => g.status === 'on_track').length;
  const atRisk    = filtered.filter(g => g.status === 'at_risk').length;
  const completed = filtered.filter(g => g.status === 'completed').length;
  const avgProgress = total > 0
    ? Math.round(filtered.reduce((s, g) => s + g.progress, 0) / total)
    : 0;

  const handleSave = useCallback(goal => {
    setGoals(prev => [goal, ...prev]);
    setShowModal(false);
  }, []);

  // ── Render ──
  return (
    <div style={{ background: T.pageBg, minHeight: '100vh', padding: '28px 32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* 頁面頂部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.t1, lineHeight: 1.2 }}>目標管理</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.t2 }}>追蹤公司、團隊與個人的 OKR 目標進度</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* 季度選擇 */}
          <div style={{ display: 'flex', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {QUARTERS.map(q => (
              <button key={q} onClick={() => setQuarter(q)} style={{
                background: quarter === q ? T.accent : 'transparent',
                color: quarter === q ? '#fff' : T.t2,
                border: 'none', padding: '6px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: quarter === q ? 600 : 400,
                transition: 'all 0.15s',
              }}>
                {q.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* 視圖切換 */}
          <div style={{ display: 'flex', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[
              { key: 'list', label: '≡ 列表' },
              { key: 'tree', label: '⋱ 樹狀' },
            ].map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                background: viewMode === v.key ? '#F5F0F0' : 'transparent',
                color: viewMode === v.key ? T.t1 : T.t2,
                border: 'none', padding: '6px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: viewMode === v.key ? 600 : 400,
                borderLeft: v.key === 'tree' ? `1px solid ${T.border}` : 'none',
                transition: 'all 0.15s',
              }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* 新增目標 */}
          <button onClick={() => setShowModal(true)} style={{
            background: T.accent, color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 18px',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: `0 2px 8px ${T.accent}40`,
            transition: 'opacity 0.15s',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> 新增目標
          </button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr)) 200px',
        gap: 14, marginBottom: 28,
        alignItems: 'stretch',
      }}>
        <StatCard label="總目標數" value={total} color={T.accent} icon="🎯" />
        <StatCard label="按計劃進行" value={onTrack} color={T.success} icon="✅" />
        <StatCard label="有風險" value={atRisk} color={T.warning} icon="⚠️" />
        <StatCard label="已完成" value={completed} color={T.neutral} icon="🏁" />

        {/* 整體完成率卡片 */}
        <div style={{
          background: T.cardBg, borderRadius: 12,
          border: `1px solid ${T.border}`,
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
            <ProgressRing
              progress={avgProgress} size={64} strokeWidth={6}
              color={avgProgress >= 70 ? T.success : avgProgress >= 40 ? T.warning : T.danger}
            />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              color: avgProgress >= 70 ? T.success : avgProgress >= 40 ? T.warning : T.danger,
            }}>
              {avgProgress}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>整體完成率</div>
            <div style={{ fontSize: 11, color: T.t2, marginTop: 2 }}>{quarter}</div>
          </div>
        </div>
      </div>

      {/* 季度標示 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.t2 }}>{quarter} 目標</span>
        <span style={{
          background: T.accent + '15', color: T.accent,
          borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 600,
        }}>{total}</span>
      </div>

      {/* 目標列表 / 樹狀圖 */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          background: T.cardBg, borderRadius: 12, border: `1px dashed ${T.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.t2 }}>此季度尚無目標</div>
          <div style={{ fontSize: 13, color: T.t3, marginTop: 6 }}>點擊「新增目標」建立第一個 OKR</div>
        </div>
      ) : viewMode === 'list' ? (
        <div>
          {filtered.map(goal => (
            <GoalCard key={goal.id} goal={goal} level={0} />
          ))}
        </div>
      ) : (
        <TreeView goals={filtered} />
      )}

      {/* 新增目標 Modal */}
      {showModal && (
        <AddGoalModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          teamMembers={teamMembers}
        />
      )}
    </div>
  );
}
