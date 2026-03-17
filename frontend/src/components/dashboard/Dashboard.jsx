/**
 * Dashboard — xCloudPMIS 主框架
 *
 * UI v6：完整對齊 Asana 介面架構
 *   - 扁平單欄側邊欄（220px）：首頁/我的任務/收件匣/深入解析/專案/工作流程
 *   - Asana 風格首頁：個人化問候 + 我的任務 widget + 專案 widget
 *   - 頂部全域搜尋列
 *   - 品牌色：xCloud 深紅 #C41230
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDashboard } from './useDashboard';
import { useAuth } from '../../context/AuthContext';
import SummaryCards          from './SummaryCards';
import HealthPieChart        from './HealthPieChart';
import ProjectHealthList     from './ProjectHealthList';
import WorkloadHeatmap       from './WorkloadHeatmap';
import ActionableInsights    from './ActionableInsights';
import ProjectsPage          from '../projects/ProjectsPage';
import TaskKanbanPage        from '../tasks/TaskKanbanPage';
import GanttPage             from '../gantt/GanttPage';
import TimeTrackingPage      from '../timetracking/TimeTrackingPage';
import ReportsPage           from '../reports/ReportsPage';
import TeamPage              from '../team/TeamPage';
import SettingsPage          from '../settings/SettingsPage';
import AiDecisionCenter      from '../ai/AiDecisionCenter';
import McpConsolePage        from '../mcp/McpConsolePage';
import WorkflowDiagramPage   from '../workflow/WorkflowDiagramPage';
import FormsPage             from '../forms/FormsPage';
import CustomFieldsPage      from '../customfields/CustomFieldsPage';
import MyTasksPage           from '../mytasks/MyTasksPage';
import GoalsPage             from '../goals/GoalsPage';
import InboxPage             from '../inbox/InboxPage';
import PortfoliosPage        from '../portfolios/PortfoliosPage';
import WorkloadPage          from '../workload/WorkloadPage';
import RulesPage             from '../rules/RulesPage';

// ── Design Tokens ─────────────────────────────────────────────
const T = {
  sbBg:     '#1A0A0D',   // 側邊欄深色背景
  sbHover:  '#2C1018',   // 懸停
  sbActive: '#3D1520',   // 選中
  accent:   '#C41230',   // xCloud 品牌紅
  accent2:  '#F04060',   // 較亮紅（深色背景上）
  t1:       '#F5EFEF',   // 主文字（暖白）
  t2:       '#9E8890',   // 次要文字（暖灰）
  t3:       '#5C4048',   // 更淡文字
  div:      '#2A1218',   // 分隔線
  pageBg:   '#F4F0F0',   // 頁面背景
  cardBg:   '#FFFFFF',
  border:   '#E2D8D8',
};

// ── API ───────────────────────────────────────────────────────
const API_BASE   = 'http://localhost:3010';
const COMPANY_ID = 2;

// ── 頁面標題映射 ──────────────────────────────────────────────
const PAGE_TITLES = {
  home:            { title: '首頁',        sub: '' },
  inbox:           { title: '收件匣',      sub: '通知 · @提及 · 任務指派' },
  'my-tasks':      { title: '我的任務',    sub: '個人任務總覽 · 跨專案統一檢視' },
  projects:        { title: '專案',        sub: '管理所有進行中的專案' },
  tasks:           { title: '任務看板',    sub: 'Kanban 任務追蹤' },
  gantt:           { title: '時程規劃',    sub: '甘特圖 · 里程碑管理' },
  reports:         { title: '報告',        sub: '資料分析與匯出' },
  portfolios:      { title: '專案集',      sub: '多專案健康監控 · 進度一覽' },
  goals:           { title: '目標',        sub: 'OKR 目標與關鍵結果追蹤' },
  workload:        { title: '工作負載',    sub: '成員任務分配視覺化' },
  rules:           { title: '自動化規則',  sub: '觸發條件 → 動作 · 工作流程自動化' },
  forms:           { title: '表單',        sub: '標準化請求入口 · 提交即建任務' },
  'custom-fields': { title: '自訂欄位',    sub: '追蹤優先度 · 階段 · 工時等資料' },
  workflow:        { title: '工作流程圖',  sub: '泳道圖 · 視覺化流程設計' },
  time:            { title: '工時記錄',    sub: '人員工時統計' },
  team:            { title: '團隊',        sub: '成員與角色設定' },
  settings:        { title: '設定',        sub: '偏好與整合設定' },
  'ai-center':     { title: 'AI 決策中心', sub: '智慧分析與建議' },
  'mcp-console':   { title: 'MCP 控制台',  sub: 'Model Context Protocol' },
  profile:         { title: '個人資料',    sub: '帳戶設定' },
};

// ── 全部有效路由 ──────────────────────────────────────────────
const ALL_NAV_IDS = [
  'home','inbox','my-tasks','projects','tasks','gantt',
  'reports','portfolios','goals','workload',
  'rules','forms','custom-fields','workflow',
  'time','team','settings','ai-center','mcp-console','profile',
];

function readHashNav() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ALL_NAV_IDS.includes(hash) ? hash : 'home';
}
function writeHashNav(id) {
  const newHash = id === 'home' ? '' : id;
  window.history.pushState({ nav: id }, '', newHash ? `#${newHash}` : window.location.pathname);
}

// ════════════════════════════════════════════════════════════
// SVG 圖示
// ════════════════════════════════════════════════════════════
const Ic = {
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  myTasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.66V20a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg>,
  inbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>,
  reports: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  portfolios: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
  goals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  workload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  projects: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  tasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  gantt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  rules: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  forms: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  customFields: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>,
  workflow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  time: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  team: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
  ai: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  mcp: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chevRight: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevDown: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  dots: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
  dotsH: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>,
  arrowLeft: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  sidebarOpen:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  sidebarClose: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="13 8 17 12 13 16"/></svg>,
};

// ── xCloud Logo ───────────────────────────────────────────────
function LogoIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#C41230"/>
      <line x1="11" y1="11" x2="29" y2="29" stroke="white" strokeWidth="4.5" strokeLinecap="round"/>
      <line x1="29" y1="11" x2="11" y2="29" stroke="white" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="3.5" fill="#C41230"/>
      <circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.85)"/>
    </svg>
  );
}

// ── 通用 Nav 按鈕 ─────────────────────────────────────────────
function NavItem({ id, icon, label, active, onClick, badge, indent = false, sbCollapsed = false }) {
  const [hov, setHov] = useState(false);
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={sbCollapsed ? label : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: sbCollapsed ? '0' : '9px',
        padding: sbCollapsed ? '8px 0' : indent ? '6px 10px 6px 28px' : '6px 10px',
        justifyContent: sbCollapsed ? 'center' : 'flex-start',
        borderRadius: '7px', border: 'none',
        background: isActive ? T.sbActive : hov ? T.sbHover : 'transparent',
        color: isActive ? T.accent2 : hov ? T.t1 : T.t2,
        fontSize: '13.5px', fontWeight: isActive ? '600' : '400',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s', position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {isActive && (
        <span style={{
          position: 'absolute', left: 0, top: '20%', height: '60%',
          width: '3px', borderRadius: '0 2px 2px 0', background: T.accent,
        }} />
      )}
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
        {icon}
      </span>
      {!sbCollapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      )}
      {!sbCollapsed && badge != null && badge > 0 && (
        <span style={{
          background: T.accent, color: 'white',
          fontSize: '10px', fontWeight: '700',
          padding: '1px 6px', borderRadius: '99px', flexShrink: 0,
        }}>{badge}</span>
      )}
      {sbCollapsed && badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: '4px', right: '4px',
          background: T.accent, color: 'white',
          fontSize: '9px', fontWeight: '700',
          width: '14px', height: '14px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

// ── Section 標頭 ──────────────────────────────────────────────
function SectionHeader({ label, onAdd, collapsed, onToggle }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '10px 10px 4px', userSelect: 'none',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <button
        onClick={onToggle}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '11.5px', fontWeight: '700', color: T.t3,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: 0, fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ opacity: hov ? 1 : 0.6, display: 'flex', alignItems: 'center', transition: 'opacity 0.15s' }}>
          {collapsed ? Ic.chevRight : Ic.chevDown}
        </span>
        {label}
      </button>
      {onAdd && hov && (
        <button
          onClick={onAdd}
          title={`新增${label}`}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.t2, display: 'flex', alignItems: 'center',
            padding: '2px', borderRadius: '4px',
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = T.t1}
          onMouseLeave={e => e.currentTarget.style.color = T.t2}
        >
          {Ic.plus}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Asana 風格側邊欄（支援收縮）
// ════════════════════════════════════════════════════════════
function Sidebar({ active, onChange, currentUser, isCollapsed, onToggleCollapse }) {
  const [collapsed, setCollapsed] = useState({ insights: false, projects: false, workflow: false, tools: false });
  const [apiProjects, setApiProjects] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);

  // 展開/收合 section
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // 從 API 取得專案清單
  useEffect(() => {
    fetch(`${API_BASE}/api/projects?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.data || d.projects || []);
        setApiProjects(list.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  // 計算未讀收件匣數量
  useEffect(() => {
    try {
      const read = new Set(JSON.parse(localStorage.getItem('xcloud-inbox-read') || '[]'));
      const comments = Object.keys(localStorage).filter(k => k.startsWith('xcloud-comments-'));
      let count = 0;
      comments.forEach(k => {
        try {
          const items = JSON.parse(localStorage.getItem(k) || '[]');
          count += items.filter(c => !read.has(c.id)).length;
        } catch {}
      });
      setInboxCount(count);
    } catch {}
  }, [active]);

  // 專案顏色
  const PROJECT_COLORS = ['#C41230','#2563EB','#16A34A','#D97706','#7C3AED','#0D9488','#DB2777','#EA580C'];
  const projColor = (p) => PROJECT_COLORS[(p.id || 0) % PROJECT_COLORS.length];

  const SB_W = isCollapsed ? '56px' : '220px';

  return (
    <aside style={{
      width: SB_W, minWidth: SB_W, height: '100vh',
      background: T.sbBg, display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s ease, min-width 0.22s ease',
    }}>

      {/* ── Logo 區 + 收縮按鈕 ───────────────────────────── */}
      <div style={{
        padding: isCollapsed ? '14px 0' : '16px 14px 12px',
        display: 'flex', alignItems: 'center',
        gap: isCollapsed ? '0' : '10px',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        borderBottom: `1px solid ${T.div}`, flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <LogoIcon size={28} />
          {!isCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: T.t1, letterSpacing: '-0.3px', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                xCloudPMIS
              </div>
              <div style={{ fontSize: '10.5px', color: T.t3, marginTop: '1px', whiteSpace: 'nowrap' }}>企業級專案管理</div>
            </div>
          )}
        </div>

        {/* 收縮切換按鈕 */}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? '展開側邊欄' : '收合側邊欄'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.t3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px', borderRadius: '5px', flexShrink: 0,
            transition: 'color 0.15s, background 0.15s',
            position: isCollapsed ? 'absolute' : 'relative',
            right: isCollapsed ? '0' : 'auto',
            opacity: 0.6,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = T.t1; e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = T.sbHover; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.t3; e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'none'; }}
        >
          {isCollapsed ? Ic.sidebarOpen : Ic.sidebarClose}
        </button>
      </div>

      {/* ── 建立按鈕 ─────────────────────────────────────── */}
      <div style={{ padding: isCollapsed ? '10px 8px 4px' : '12px 12px 4px', flexShrink: 0 }}>
        <button
          onClick={() => onChange('projects')}
          title={isCollapsed ? '建立' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            gap: isCollapsed ? '0' : '7px',
            padding: isCollapsed ? '9px 0' : '8px 0',
            background: T.accent, color: 'white',
            border: 'none', borderRadius: '8px',
            fontSize: '13.5px', fontWeight: '700', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'background 0.15s',
            boxShadow: '0 2px 8px rgba(196,18,48,0.35)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#A00E26'}
          onMouseLeave={e => e.currentTarget.style.background = T.accent}
        >
          {Ic.plus}
          {!isCollapsed && '建立'}
        </button>
      </div>

      {/* ── 導覽項目（可捲動）─────────────────────────────── */}
      <nav style={{
        flex: 1, overflowY: 'auto', padding: isCollapsed ? '4px 4px 8px' : '4px 8px 8px',
        scrollbarWidth: 'thin', scrollbarColor: `${T.div} transparent`,
      }}>

        {/* 主要導覽 */}
        <div style={{ marginBottom: '4px' }}>
          <NavItem id="home"     icon={Ic.home}    label="首頁"   active={active} onClick={onChange} sbCollapsed={isCollapsed} />
          <NavItem id="my-tasks" icon={Ic.myTasks} label="我的任務" active={active} onClick={onChange} sbCollapsed={isCollapsed} />
          <NavItem id="inbox"    icon={Ic.inbox}   label="收件匣" active={active} onClick={onChange} badge={inboxCount} sbCollapsed={isCollapsed} />
        </div>

        <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />

        {/* 深入解析 */}
        {!isCollapsed && (
          <SectionHeader
            label="深入解析"
            collapsed={collapsed.insights}
            onToggle={() => toggleSection('insights')}
          />
        )}
        {(!isCollapsed && !collapsed.insights || isCollapsed) && (
          <div style={{ marginBottom: '4px' }}>
            <NavItem id="reports"    icon={Ic.reports}    label="報告"    active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="portfolios" icon={Ic.portfolios} label="專案集"  active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="goals"      icon={Ic.goals}      label="目標"    active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="workload"   icon={Ic.workload}   label="工作負載" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
          </div>
        )}

        <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />

        {/* 專案 */}
        {!isCollapsed && (
          <SectionHeader
            label="專案"
            onAdd={() => onChange('projects')}
            collapsed={collapsed.projects}
            onToggle={() => toggleSection('projects')}
          />
        )}
        {(!isCollapsed && !collapsed.projects || isCollapsed) && (
          <div style={{ marginBottom: '4px' }}>
            <NavItem id="projects" icon={Ic.projects} label="所有專案" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="tasks"    icon={Ic.tasks}    label="任務看板"  active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="gantt"    icon={Ic.gantt}    label="時程規劃"  active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            {/* 來自 API 的真實專案（收合時隱藏） */}
            {!isCollapsed && apiProjects.map(p => (
              <button
                key={p.id}
                onClick={() => onChange('projects')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '5px 10px 5px 28px', borderRadius: '6px', border: 'none',
                  background: 'transparent', color: T.t2,
                  fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit', transition: 'background 0.1s',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = T.sbHover; e.currentTarget.style.color = T.t1; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.t2; }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: projColor(p), flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />

        {/* 工作流程 */}
        {!isCollapsed && (
          <SectionHeader
            label="工作流程"
            collapsed={collapsed.workflow}
            onToggle={() => toggleSection('workflow')}
          />
        )}
        {(!isCollapsed && !collapsed.workflow || isCollapsed) && (
          <div style={{ marginBottom: '4px' }}>
            <NavItem id="rules"         icon={Ic.rules}        label="自動化規則" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="forms"         icon={Ic.forms}        label="表單"       active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="custom-fields" icon={Ic.customFields} label="自訂欄位"   active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="workflow"      icon={Ic.workflow}     label="工作流程圖" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
          </div>
        )}

        <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />

        {/* 工具 */}
        {!isCollapsed && (
          <SectionHeader
            label="工具"
            collapsed={collapsed.tools}
            onToggle={() => toggleSection('tools')}
          />
        )}
        {(!isCollapsed && !collapsed.tools || isCollapsed) && (
          <div style={{ marginBottom: '4px' }}>
            <NavItem id="time"        icon={Ic.time}     label="工時記錄"   active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="ai-center"   icon={Ic.ai}       label="AI 決策中心" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
            <NavItem id="mcp-console" icon={Ic.mcp}      label="MCP 控制台" active={active} onClick={onChange} indent={!isCollapsed} sbCollapsed={isCollapsed} />
          </div>
        )}

        <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />

        {/* 我的工作空間（Team）*/}
        <button
          onClick={() => onChange('team')}
          title={isCollapsed ? '我的工作空間' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: isCollapsed ? '0' : '9px',
            padding: isCollapsed ? '8px 0' : '6px 10px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: '7px', border: 'none',
            background: active === 'team' ? T.sbActive : 'transparent',
            color: active === 'team' ? T.accent2 : T.t2,
            fontSize: '13.5px', fontWeight: active === 'team' ? '600' : '400',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            transition: 'background 0.12s', boxSizing: 'border-box',
          }}
          onMouseEnter={e => {
            if (active !== 'team') { e.currentTarget.style.background = T.sbHover; e.currentTarget.style.color = T.t1; }
          }}
          onMouseLeave={e => {
            if (active !== 'team') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.t2; }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', opacity: 0.75 }}>{Ic.team}</span>
          {!isCollapsed && <><span style={{ flex: 1 }}>我的工作空間</span><span style={{ opacity: 0.4 }}>{Ic.chevRight}</span></>}
        </button>

      </nav>

      {/* ── 底部：設定 + 使用者 ─────────────────────────────── */}
      <div style={{ padding: isCollapsed ? '8px 4px 12px' : '8px 8px 12px', borderTop: `1px solid ${T.div}`, flexShrink: 0 }}>
        <NavItem id="settings" icon={Ic.settings} label="設定" active={active} onClick={onChange} sbCollapsed={isCollapsed} />

        {/* 使用者資料列 */}
        <button
          onClick={() => onChange('profile')}
          title={isCollapsed ? (currentUser?.name ?? '個人資料') : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: isCollapsed ? '0' : '9px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '9px 0' : '8px 10px',
            marginTop: '4px', borderRadius: '8px',
            border: 'none',
            background: active === 'profile' ? T.sbActive : 'transparent',
            cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          onMouseEnter={e => { if (active !== 'profile') e.currentTarget.style.background = T.sbHover; }}
          onMouseLeave={e => { if (active !== 'profile') e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#C41230,#8B0020)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '12px',
          }}>
            {currentUser ? currentUser.name.slice(0, 1) : '?'}
          </div>
          {!isCollapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.t1, fontSize: '12.5px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentUser?.name ?? '載入中⋯'}
                </div>
                <div style={{ color: T.t3, fontSize: '10.5px' }}>
                  {currentUser?.role === 'admin' ? '系統管理員' : currentUser?.role === 'pm' ? '專案經理' : '一般成員'}
                </div>
              </div>
              <span style={{ color: T.t3, display: 'flex', alignItems: 'center' }}>{Ic.dots}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════
// 頂部搜尋列（Asana 風格）
// ════════════════════════════════════════════════════════════
function Topbar({ activeNav, onNavigate, onToggleSidebar }) {
  const [searchVal, setSearchVal] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const page = PAGE_TITLES[activeNav] || { title: activeNav, sub: '' };

  return (
    <header style={{
      background: 'white', borderBottom: `1px solid ${T.border}`,
      padding: '0 24px', height: '56px',
      display: 'flex', alignItems: 'center', gap: '14px',
      flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
    }}>

      {/* 漢堡選單（sidebar toggle）*/}
      <button
        onClick={onToggleSidebar}
        title="切換側邊欄"
        style={{
          width: '32px', height: '32px', borderRadius: '6px',
          border: `1px solid ${T.border}`, background: 'white',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6B7280', flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = '#374151'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#6B7280'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* 頁面標題 */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: '7px', minWidth: 0 }}>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#111827', whiteSpace: 'nowrap' }}>
          {page.title}
        </span>
        {page.sub && (
          <span style={{ fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            / {page.sub}
          </span>
        )}
      </div>

      {/* 全域搜尋 */}
      <div style={{ flex: 1, maxWidth: '480px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: searchFocus ? 'white' : '#F3F4F6',
          borderRadius: '8px', padding: '7px 14px',
          border: `1px solid ${searchFocus ? T.accent : 'transparent'}`,
          transition: 'all 0.15s',
        }}>
          <span style={{ color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>{Ic.search}</span>
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            placeholder="搜尋專案、任務、成員⋯"
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontSize: '13.5px', color: '#374151',
              width: '100%', fontFamily: 'inherit',
            }}
          />
          {searchVal && (
            <button
              onClick={() => setSearchVal('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '16px', lineHeight: 1, padding: 0 }}
            >×</button>
          )}
        </div>
      </div>

      {/* 右側操作列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {/* 說明 */}
        <button
          title="說明"
          style={{ width: '32px', height: '32px', borderRadius: '50%', border: `1px solid ${T.border}`, background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#6B7280', fontWeight: '700' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
          onMouseLeave={e => e.currentTarget.style.background = 'white'}
        >
          ?
        </button>

        {/* 通知鈴鐺 → 收件匣 */}
        <button
          onClick={() => onNavigate('inbox')}
          title="收件匣"
          style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: `1px solid ${activeNav === 'inbox' ? T.accent : T.border}`,
            background: activeNav === 'inbox' ? '#FFF0F2' : 'white',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: activeNav === 'inbox' ? T.accent : '#6B7280',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FFF0F2'; e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => {
            e.currentTarget.style.background = activeNav === 'inbox' ? '#FFF0F2' : 'white';
            e.currentTarget.style.color = activeNav === 'inbox' ? T.accent : '#6B7280';
          }}
        >
          {Ic.bell}
        </button>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════
// Asana 風格「首頁」
// ════════════════════════════════════════════════════════════
function HomePage({ currentUser, onNavigate, dashData }) {
  const { summary, projects, workload, insights, loading, error, refresh } = dashData;
  const [myTasksTab,    setMyTasksTab]    = useState('upcoming');
  const [myTasks,       setMyTasks]       = useState([]);
  const [tasksLoading,  setTasksLoading]  = useState(true);
  const [showCustomize, setShowCustomize] = useState(false);
  const [homeWidgets,   setHomeWidgets]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('xcloud-home-widgets') || 'null') || { tasks: true, projects: true, learn: true }; }
    catch { return { tasks: true, projects: true, learn: true }; }
  });

  // 時段問候
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安';
  const dateStr = new Date().toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  });

  // 載入我的任務
  useEffect(() => {
    setTasksLoading(true);
    fetch(`${API_BASE}/api/projects/tasks?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(d => {
        // API 回傳 { success, data: { tasks: [...] } }
        const list = Array.isArray(d) ? d
          : Array.isArray(d.data) ? d.data
          : (d.data?.tasks || d.tasks || []);
        setMyTasks(list);
      })
      .catch(() => setMyTasks([]))
      .finally(() => setTasksLoading(false));
  }, []);

  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

  const tabTasks = {
    upcoming:  myTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= weekEnd),
    overdue:   myTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now),
    completed: myTasks.filter(t => t.status === 'done').slice(0, 10),
  };
  const displayTasks = tabTasks[myTasksTab] || [];

  const completedCount = myTasks.filter(t => {
    if (t.status !== 'done') return false;
    const d = t.updatedAt || t.dueDate;
    if (!d) return false;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(d) >= weekAgo;
  }).length;

  const recentProjects = projects.slice(0, 6);

  return (
    <div style={{ minHeight: '100%', background: T.pageBg, padding: '32px 36px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* ── 問候標題 ─────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '4px' }}>{dateStr}</div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: '#111827', letterSpacing: '-0.5px' }}>
            {currentUser ? `${currentUser.name.split(' ').pop()}，${greeting}` : `${greeting}！`}
          </h1>
        </div>

        {/* ── 快速統計列 ────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '28px', flexWrap: 'wrap',
        }}>
          {[
            {
              icon: '📅',
              label: '我的一週',
              value: `${displayTasks.length} 項任務`,
              sub: '即將到期',
              color: '#374151',
            },
            {
              icon: '✓',
              value: `${completedCount} 個`,
              label: '已完成任務',
              sub: '本週',
              color: '#16A34A',
            },
            {
              icon: '👥',
              value: `${workload?.users?.length ?? (Array.isArray(workload) ? workload.length : 0)}`,
              label: '位協作者',
              sub: '',
              color: '#2563EB',
            },
            {
              icon: '📁',
              value: `${recentProjects.length}`,
              label: '個活躍專案',
              sub: '',
              color: '#7C3AED',
            },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', background: 'white',
              borderRadius: '8px', border: `1px solid ${T.border}`,
              cursor: 'default',
            }}>
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              <div>
                <span style={{ fontSize: '15px', fontWeight: '700', color: item.color }}>{item.value}</span>
                <span style={{ fontSize: '13px', color: '#6B7280', marginLeft: '4px' }}>{item.label}</span>
                {item.sub && <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: '4px' }}>· {item.sub}</span>}
              </div>
            </div>
          ))}

          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={() => setShowCustomize(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '8px 14px', background: showCustomize ? '#F0F9FF' : 'white',
                borderRadius: '8px', border: `1px solid ${showCustomize ? '#3B82F6' : T.border}`,
                fontSize: '13px', color: showCustomize ? '#3B82F6' : '#6B7280',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (!showCustomize) { e.currentTarget.style.background = '#F9FAFB'; }}}
              onMouseLeave={e => { if (!showCustomize) { e.currentTarget.style.background = 'white'; }}}
            >
              ⚙ 自訂
            </button>
            {showCustomize && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                background: 'white', borderRadius: '12px',
                border: `1px solid ${T.border}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 200, minWidth: '220px', padding: '16px',
              }}
                onMouseLeave={() => {}}
              >
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                  自訂首頁
                </div>
                {[
                  { key: 'tasks',    label: '✅ 我的任務 Widget' },
                  { key: 'projects', label: '📁 專案 Widget' },
                  { key: 'learn',    label: '📖 瞭解 xCloudPMIS' },
                ].map(w => (
                  <label key={w.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: `1px solid #F3F4F6`,
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                    <span style={{ fontSize: '13px', color: '#374151' }}>{w.label}</span>
                    <div
                      onClick={() => {
                        const next = { ...homeWidgets, [w.key]: !homeWidgets[w.key] };
                        setHomeWidgets(next);
                        try { localStorage.setItem('xcloud-home-widgets', JSON.stringify(next)); } catch {}
                      }}
                      style={{
                        width: '36px', height: '20px', borderRadius: '10px',
                        background: homeWidgets[w.key] ? '#10B981' : '#D1D5DB',
                        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '2px',
                        left: homeWidgets[w.key] ? '18px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: 'white', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                  </label>
                ))}
                <button
                  onClick={() => setShowCustomize(false)}
                  style={{
                    width: '100%', marginTop: '12px',
                    background: T.accent, color: 'white', border: 'none',
                    borderRadius: '7px', padding: '8px 0', fontSize: '13px',
                    fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  完成
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 主要內容 2欄 ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

          {/* 我的任務 Widget */}
          <div style={{
            background: 'white', borderRadius: '12px', border: `1px solid ${T.border}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
            display: homeWidgets.tasks ? 'flex' : 'none', flexDirection: 'column',
          }}>
            {/* Widget Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px 12px', borderBottom: `1px solid #F3F4F6`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>✅</span>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>我的任務</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '12px', padding: '2px 6px' }}>
                  ⋯
                </button>
              </div>
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.color = T.accent}
                onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
              >
                查看全部 →
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 20px', borderBottom: `1px solid #F3F4F6`, gap: '0' }}>
              {[
                { key: 'upcoming', label: '即將截止', count: tabTasks.upcoming.length },
                { key: 'overdue',  label: '逾期',     count: tabTasks.overdue.length },
                { key: 'completed',label: '已完成',   count: tabTasks.completed.length },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setMyTasksTab(tab.key)}
                  style={{
                    padding: '10px 14px', fontSize: '13px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit',
                    color: myTasksTab === tab.key ? T.accent : '#6B7280',
                    fontWeight: myTasksTab === tab.key ? '600' : '400',
                    borderBottom: myTasksTab === tab.key ? `2px solid ${T.accent}` : '2px solid transparent',
                    marginBottom: '-1px', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{
                      background: myTasksTab === tab.key ? '#FFF0F2' : '#F3F4F6',
                      color: myTasksTab === tab.key ? T.accent : '#9CA3AF',
                      fontSize: '10.5px', fontWeight: '700',
                      padding: '1px 6px', borderRadius: '99px',
                    }}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Task List */}
            <div style={{ padding: '8px 0', minHeight: '180px', maxHeight: '320px', overflowY: 'auto' }}>
              {/* 建立任務 */}
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                  padding: '8px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: '13px', color: '#9CA3AF',
                  fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: '#D1D5DB', display: 'flex' }}>{Ic.plus}</span>
                建立任務
              </button>

              {tasksLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>載入中⋯</div>
              ) : displayTasks.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                    {myTasksTab === 'completed' ? '🎉' : '🎯'}
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    {myTasksTab === 'upcoming' ? '本週沒有截止任務' :
                     myTasksTab === 'overdue'  ? '沒有逾期任務，很棒！' : '本週尚未完成任務'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    {myTasksTab === 'upcoming' ? '點擊上方建立任務' : '繼續保持！'}
                  </div>
                </div>
              ) : (
                displayTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => onNavigate('my-tasks')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 20px', border: 'none', background: 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* 勾選框 */}
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${task.status === 'done' ? '#16A34A' : '#D1D5DB'}`,
                      background: task.status === 'done' ? '#16A34A' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {task.status === 'done' && <span style={{ color: 'white', fontSize: '9px' }}>✓</span>}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', color: task.status === 'done' ? '#9CA3AF' : '#111827',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {task.title || task.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>
                        {task.project?.name || '—'}
                        {task.dueDate && (
                          <span style={{
                            marginLeft: '8px',
                            color: new Date(task.dueDate) < now ? '#EF4444' : '#6B7280',
                          }}>
                            {new Date(task.dueDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 專案 Widget */}
          <div style={{
            background: 'white', borderRadius: '12px', border: `1px solid ${T.border}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
            display: homeWidgets.projects ? 'flex' : 'none', flexDirection: 'column',
          }}>
            {/* Widget Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px 12px', borderBottom: `1px solid #F3F4F6`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📁</span>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>專案</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '12px', padding: '2px 6px' }}>
                  近期 ▾
                </button>
              </div>
              <button
                onClick={() => onNavigate('projects')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.color = T.accent}
                onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
              >
                查看全部 →
              </button>
            </div>

            {/* Project List */}
            <div style={{ padding: '8px 0', minHeight: '180px', maxHeight: '320px', overflowY: 'auto' }}>
              {/* 建立專案 */}
              <button
                onClick={() => onNavigate('projects')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: '13px', color: '#9CA3AF',
                  fontFamily: 'inherit', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: `1.5px dashed #D1D5DB`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#D1D5DB', flexShrink: 0,
                }}>
                  {Ic.plus}
                </div>
                建立專案
              </button>

              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>載入中⋯</div>
              ) : recentProjects.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
                  <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#374151' }}>尚無專案</div>
                </div>
              ) : (
                recentProjects.map((p, i) => {
                  const colors = ['#C41230','#2563EB','#16A34A','#D97706','#7C3AED','#0D9488'];
                  const color = colors[i % colors.length];
                  // API 回傳 snake_case 欄位
                  const overdue = p.overdue_tasks  ?? p.taskOverdue ?? 0;
                  const total   = p.total_tasks    ?? p.taskTotal   ?? 0;
                  const done    = p.done_tasks     ?? p.taskDone    ?? 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onNavigate('projects')}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 20px', border: 'none', background: 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* 專案色塊 icon */}
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: color, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: 'white', fontSize: '12px' }}>
                          {Ic.projects}
                        </span>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.project_name ?? p.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                          {overdue > 0
                            ? <span style={{ color: '#EF4444' }}>{overdue} 個任務即將截止</span>
                            : total > 0
                              ? `${done}/${total} 個任務完成`
                              : '暫無任務'}
                        </div>
                      </div>

                      {/* 進度 mini */}
                      <div style={{ width: '36px', height: '36px', flexShrink: 0 }}>
                        <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3"
                            strokeDasharray={2 * Math.PI * 14}
                            strokeDashoffset={2 * Math.PI * 14 * (1 - (parseFloat(p.completion_pct ?? p.completion ?? 0)) / 100)}
                            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s' }}
                          />
                        </svg>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── 瞭解 xCloudPMIS（類 Asana 學習卡）──────────────── */}
        <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: homeWidgets.learn ? 'block' : 'none' }}>
          <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>瞭解 xCloudPMIS</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '16px' }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
            {[
              { icon: '🚀', title: '開始使用', desc: '瞭解基本資訊以及 xCloudPMIS 如何協助您完成工作', color: '#C41230', nav: 'my-tasks' },
              { icon: '⚡', title: '使用規則將工作自動化', desc: '瞭解如何透過自動化規則來簡化工作', color: '#7C3AED', nav: 'rules' },
              { icon: '📊', title: '使用專案集管理工作', desc: '在單一檢視中追蹤多個專案和關鍵計劃', color: '#D97706', nav: 'portfolios' },
              { icon: '🎯', title: '透過目標管理成效', desc: '設定 OKR 目標並追蹤關鍵結果', color: '#16A34A', nav: 'goals' },
            ].map((card, i) => (
              <button
                key={i}
                onClick={() => onNavigate(card.nav)}
                style={{
                  padding: '20px', border: 'none',
                  borderLeft: i > 0 ? '1px solid #F3F4F6' : 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: card.color, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '22px', marginBottom: '12px',
                }}>
                  {card.icon}
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>{card.title}</div>
                <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: '1.5' }}>{card.desc}</div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 個人資料頁
// ════════════════════════════════════════════════════════════
function ProfilePage({ onBack, currentUser, onLogout }) {
  const ROLE_LABEL = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };
  const INFO_ROWS = [
    { label: '姓名',     value: currentUser?.name                        ?? '—' },
    { label: '帳號',     value: currentUser?.email                       ?? '—' },
    { label: '角色',     value: ROLE_LABEL[currentUser?.role]             ?? '—' },
    { label: '所屬公司', value: currentUser?.company?.name                ?? '—' },
    { label: '部門',     value: currentUser?.department                   ?? '—' },
    { label: '職稱',     value: currentUser?.jobTitle                     ?? '—' },
    { label: '電話',     value: currentUser?.phone                        ?? '—' },
    { label: '加入日期', value: currentUser?.joinedAt                     ?? '—' },
  ];

  return (
    <div style={{ maxWidth: '640px', margin: '32px auto', padding: '0 28px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', color: '#64748B', fontSize: '13.5px', marginBottom: '22px', padding: 0, fontFamily: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.color = '#1e293b'}
        onMouseOut={e => e.currentTarget.style.color = '#64748B'}
      >
        {Ic.arrowLeft} 返回首頁
      </button>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '28px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '22px' }}>
        <div style={{ width: '68px', height: '68px', flexShrink: 0, borderRadius: '50%', background: 'linear-gradient(135deg,#C41230,#8B0020)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '26px', boxShadow: '0 4px 14px rgba(196,18,48,0.35)' }}>
          {currentUser ? currentUser.name.slice(0, 1) : '?'}
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b' }}>{currentUser?.name ?? '—'}</div>
          <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '2px' }}>{ROLE_LABEL[currentUser?.role] ?? '—'} · {currentUser?.company?.name ?? '—'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '8px', padding: '3px 10px', background: '#F0FDF4', color: '#16a34a', borderRadius: '99px', fontSize: '11.5px', fontWeight: '600' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
            在線上
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '14px' }}>
        {INFO_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '13px 20px', borderBottom: i < INFO_ROWS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ width: '96px', fontSize: '12.5px', color: '#94A3B8', flexShrink: 0 }}>{row.label}</div>
            <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontWeight: '700', color: '#374151' }}>帳戶設定</div>
        {[
          { label: '修改密碼', desc: '定期更換密碼以保護帳戶安全', onClick: null },
          { label: '通知偏好', desc: '設定 Email / App 通知類型', onClick: null },
          { label: '語言與時區', desc: '繁體中文 / Asia/Taipei', onClick: null },
          { label: '登出', desc: '結束目前登入階段', danger: true, onClick: onLogout },
        ].map((item, i, arr) => (
          <button key={item.label}
            onClick={item.onClick || undefined}
            style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid #F8FAFC' : 'none', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            onMouseOver={e => e.currentTarget.style.background = item.danger ? '#FFF5F5' : '#F8FAFC'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: item.danger ? '#EF4444' : '#1e293b' }}>{item.label}</div>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>{item.desc}</div>
            </div>
            <span style={{ color: '#D1D5DB', fontSize: '18px' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件
// ════════════════════════════════════════════════════════════
export default function Dashboard() {
  // ── 從登入 JWT 直接取得使用者資訊，不需要額外 API 呼叫 ───────
  const { user: currentUser, logout } = useAuth();

  const [activeNav,       setActiveNav]       = useState(readHashNav);
  const [settingsState,   setSettingsState]   = useState(null);
  const [sbCollapsed,     setSbCollapsed]     = useState(() => {
    try { return localStorage.getItem('xcloud-sb-collapsed') === '1'; } catch { return false; }
  });
  const dashData = useDashboard();

  const toggleSidebar = useCallback(() => {
    setSbCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('xcloud-sb-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const onPop = () => setActiveNav(readHashNav());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((id) => {
    setActiveNav(id);
    writeHashNav(id);
  }, []);

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const msConn    = params.get('ms_connected');
    const msError   = params.get('ms_error');
    const msEmail   = params.get('ms_email');
    const msMessage = params.get('ms_message');
    if (msConn === '1' || msError) {
      navigate('settings');
      setSettingsState({ initialTab: 'integrations', msConnected: msConn, msError, msEmail, msMessage });
      window.history.replaceState({}, document.title, window.location.pathname.replace(/\/settings\/integrations\/?$/, '/') || '/');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 頁面路由 ──────────────────────────────────────────────
  const renderPage = () => {
    if (activeNav === 'home')          return <HomePage currentUser={currentUser} onNavigate={navigate} dashData={dashData} />;
    if (activeNav === 'inbox')         return <InboxPage />;
    if (activeNav === 'my-tasks')      return <MyTasksPage />;
    if (activeNav === 'projects')      return <ProjectsPage />;
    if (activeNav === 'tasks')         return <TaskKanbanPage />;
    if (activeNav === 'gantt')         return <GanttPage />;
    if (activeNav === 'workflow')      return <WorkflowDiagramPage />;
    if (activeNav === 'rules')         return <RulesPage />;
    if (activeNav === 'time')          return <TimeTrackingPage />;
    if (activeNav === 'goals')         return <GoalsPage />;
    if (activeNav === 'portfolios')    return <PortfoliosPage />;
    if (activeNav === 'workload')      return <WorkloadPage />;
    if (activeNav === 'reports')       return <ReportsPage />;
    if (activeNav === 'team')          return <TeamPage />;
    if (activeNav === 'settings')      return <SettingsPage initialTab={settingsState?.initialTab} callbackState={settingsState} />;
    if (activeNav === 'ai-center')     return <AiDecisionCenter />;
    if (activeNav === 'mcp-console')   return <McpConsolePage />;
    if (activeNav === 'forms')         return <FormsPage />;
    if (activeNav === 'custom-fields') return <CustomFieldsPage />;
    if (activeNav === 'profile')       return <ProfilePage onBack={() => navigate('home')} currentUser={currentUser} onLogout={logout} />;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '14px' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: '#FFF0F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>🚧</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>開發中</div>
        <div style={{ fontSize: '13.5px', color: '#94A3B8' }}>此功能即將上線，敬請期待</div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.pageBg }}>
      <Sidebar
        active={activeNav}
        onChange={navigate}
        currentUser={currentUser}
        isCollapsed={sbCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minWidth: 0 }}>
        <Topbar activeNav={activeNav} onNavigate={navigate} onToggleSidebar={toggleSidebar} />

        <main style={{ flex: 1, minWidth: 0 }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
