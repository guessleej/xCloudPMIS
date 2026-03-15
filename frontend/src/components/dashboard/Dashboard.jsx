/**
 * Dashboard — 主管決策儀表板主頁
 *
 * UI 重設計 v3：xCloud 品牌設計系統
 *   - 深色側邊欄（#12090A）+ SVG 圖示 + 分組導覽
 *   - 白色 Topbar，動態麵包屑，搜尋列
 *   - Active 狀態：左側紅色細線 + 高亮背景
 *   - 品牌色：xCloud 深紅 #C41230
 */

import { useState, useEffect } from 'react';
import { useDashboard } from './useDashboard';
import SummaryCards       from './SummaryCards';
import HealthPieChart     from './HealthPieChart';
import ProjectHealthList  from './ProjectHealthList';
import WorkloadHeatmap    from './WorkloadHeatmap';
import ActionableInsights from './ActionableInsights';
import ProjectsPage       from '../projects/ProjectsPage';
import TaskKanbanPage     from '../tasks/TaskKanbanPage';
import GanttPage          from '../gantt/GanttPage';
import TimeTrackingPage   from '../timetracking/TimeTrackingPage';
import ReportsPage        from '../reports/ReportsPage';
import TeamPage           from '../team/TeamPage';
import SettingsPage       from '../settings/SettingsPage';
import AiDecisionCenter      from '../ai/AiDecisionCenter';
import McpConsolePage        from '../mcp/McpConsolePage';
import WorkflowDiagramPage   from '../workflow/WorkflowDiagramPage';
import DiscoveryPage          from '../discovery/DiscoveryPage';

// ── Design Tokens — xCloud Brand ────────────────────────────
const T = {
  sbBg:     '#12090A',  // 深黑底帶暖調
  sbHover:  '#1E0D10',  // 懸停暖色
  sbActive: '#2C0E14',  // 選中深紅色底
  accent:   '#C41230',  // xCloud 品牌紅
  accent2:  '#F04060',  // 較亮的紅（深色背景上文字）
  t1:       '#F5EFEF',  // 暖白色文字
  t2:       '#9E8E90',  // 次要文字（暖灰）
  t3:       '#5C4850',  // 更淡文字
  div:      '#221215',  // 分隔線（暖深色）
  pageBg:   '#F7F2F2',  // 頁面背景（極淺暖色）
};

// ── SVG 圖示集 ──────────────────────────────────────────────
const Icon = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  projects: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  gantt: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  time: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  team: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  ),
  ai: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  mcp: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  discovery: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  bell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  workflow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="6" height="5" rx="1.5"/>
      <rect x="16" y="3" width="6" height="5" rx="1.5"/>
      <line x1="8" y1="5.5" x2="16" y2="5.5"/>
      <polyline points="14,3.5 16,5.5 14,7.5"/>
      <rect x="9" y="16" width="6" height="5" rx="1.5"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <polyline points="10,14 12,16 14,14"/>
    </svg>
  ),
  dots: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
    </svg>
  ),
  arrowLeft: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
};

// ── xCloud Logo SVG（品牌紅 + X 造型）──────────────────────
function LogoIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#C41230"/>
      {/* X 造型 — 仿 xCloud 標誌交叉帶 */}
      <line x1="11" y1="11" x2="29" y2="29" stroke="white" strokeWidth="4.5" strokeLinecap="round"/>
      <line x1="29" y1="11" x2="11" y2="29" stroke="white" strokeWidth="4.5" strokeLinecap="round"/>
      {/* 中心圓點 */}
      <circle cx="20" cy="20" r="3.5" fill="#C41230"/>
      <circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.85)"/>
    </svg>
  );
}

// ── 導覽分組定義 ─────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: '主要功能',
    items: [
      { id: 'dashboard', icon: Icon.dashboard, label: '儀表板' },
      { id: 'projects',  icon: Icon.projects,  label: '專案管理' },
      { id: 'tasks',     icon: Icon.tasks,      label: '任務看板' },
      { id: 'gantt',     icon: Icon.gantt,      label: '甘特圖' },
      { id: 'workflow',  icon: Icon.workflow,   label: '工作流程圖' },
    ],
  },
  {
    label: '資源管理',
    items: [
      { id: 'time',     icon: Icon.time,    label: '工時記錄' },
      { id: 'reports',  icon: Icon.reports, label: '報表匯出' },
      { id: 'team',     icon: Icon.team,    label: '團隊管理' },
      { id: 'settings', icon: Icon.settings, label: '系統設定' },
    ],
  },
  {
    label: 'AI 功能',
    items: [
      { id: 'ai-center',   icon: Icon.ai,        label: 'AI 決策中心' },
      { id: 'mcp-console', icon: Icon.mcp,        label: 'MCP 控制台' },
      { id: 'discovery',   icon: Icon.discovery,  label: '功能探索' },
    ],
  },
];

// ── 頁面標題映射 ─────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:     { title: '儀表板',      sub: '主管決策中心' },
  projects:      { title: '專案管理',    sub: '管理所有進行中的專案' },
  tasks:         { title: '任務看板',    sub: 'Kanban 任務追蹤' },
  gantt:         { title: '甘特圖',      sub: '時程規劃與里程碑' },
  workflow:      { title: '工作流程圖',  sub: 'Asana 式泳道流程 · 橢圓／矩形／菱形符號' },
  time:          { title: '工時記錄',    sub: '人員工時統計' },
  reports:       { title: '報表匯出',    sub: '資料分析與匯出' },
  team:          { title: '團隊管理',    sub: '成員與角色設定' },
  settings:      { title: '系統設定',    sub: '偏好與整合設定' },
  'ai-center':   { title: 'AI 決策中心', sub: '智慧分析與建議' },
  'mcp-console': { title: 'MCP 控制台',  sub: 'Model Context Protocol' },
  discovery:     { title: '功能探索',    sub: 'Top Features to Discover' },
  profile:       { title: '個人資料',    sub: '帳戶設定' },
};

// ── API 常數 ─────────────────────────────────────────────────
const API_BASE   = 'http://localhost:3010';
const COMPANY_ID = 2;

// ── 側邊欄元件 ──────────────────────────────────────────────
function Sidebar({ active, onChange, currentUser }) {
  const navItemStyle = (isActive) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    background: isActive ? T.sbActive : 'transparent',
    color: isActive ? T.accent2 : T.t2,
    fontSize: '13px',
    fontWeight: isActive ? '500' : '400',
    cursor: 'pointer',
    textAlign: 'left',
    marginBottom: '1px',
    transition: 'all 0.15s',
    position: 'relative',
    fontFamily: 'inherit',
  });

  return (
    <aside style={{
      width: '240px',
      flexShrink: 0,
      background: T.sbBg,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
    }}>
      {/* ── Logo ── */}
      <div style={{
        padding: '20px 16px 18px',
        borderBottom: `1px solid ${T.div}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <LogoIcon size={38} />
          <div>
            <div style={{
              fontSize: '15.5px', fontWeight: '800',
              color: '#fff', letterSpacing: '-0.4px',
            }}>
              xCloudPMIS
            </div>
            <div style={{
              fontSize: '10px', color: T.t3,
              letterSpacing: '0.8px', textTransform: 'uppercase', marginTop: '1px',
            }}>
              Enterprise PM System
            </div>
          </div>
        </div>
      </div>

      {/* ── 導覽選單 ── */}
      <nav style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
        scrollbarWidth: 'thin',
        scrollbarColor: `${T.div} transparent`,
      }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ padding: '12px 12px 4px' }}>
            <div style={{
              fontSize: '10px', fontWeight: '700',
              color: T.t3, letterSpacing: '1.2px',
              textTransform: 'uppercase',
              padding: '0 8px', marginBottom: '4px',
            }}>
              {group.label}
            </div>

            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                style={navItemStyle(active === item.id)}
                onMouseOver={e => {
                  if (active !== item.id) {
                    e.currentTarget.style.background = T.sbHover;
                    e.currentTarget.style.color = T.t1;
                  }
                }}
                onMouseOut={e => {
                  if (active !== item.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = T.t2;
                  }
                }}
              >
                {active === item.id && (
                  <span style={{
                    position: 'absolute', left: 0, top: '20%', height: '60%',
                    width: '3px', background: T.accent,
                    borderRadius: '0 3px 3px 0',
                  }} />
                )}
                <span style={{
                  opacity: active === item.id ? 1 : 0.65,
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                  transition: 'opacity 0.15s',
                }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}

            {gi < NAV_GROUPS.length - 1 && (
              <div style={{ height: '1px', background: T.div, margin: '10px 8px 0' }} />
            )}
          </div>
        ))}
      </nav>

      {/* ── 用戶資訊（底部）── */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.div}` }}>
        <button
          onClick={() => onChange('profile')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 10px', borderRadius: '8px',
            border: 'none',
            background: active === 'profile' ? T.sbActive : 'transparent',
            cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.15s', fontFamily: 'inherit',
          }}
          onMouseOver={e => {
            if (active !== 'profile') e.currentTarget.style.background = T.sbHover;
          }}
          onMouseOut={e => {
            if (active !== 'profile') e.currentTarget.style.background = 'transparent';
          }}
        >
          <div style={{
            width: '30px', height: '30px', flexShrink: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #C41230, #8B0020)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '12px',
          }}>
            {currentUser ? currentUser.name.slice(0, 1) : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.t1, fontSize: '12.5px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser ? currentUser.name : '載入中⋯'}
            </div>
            <div style={{ color: T.t3, fontSize: '11px' }}>
              {currentUser ? (currentUser.role === 'admin' ? '系統管理員' : currentUser.role === 'pm' ? '專案經理' : '一般成員') : '—'}
            </div>
          </div>
          <span style={{ color: T.t3, display: 'flex', alignItems: 'center' }}>{Icon.dots}</span>
        </button>
      </div>
    </aside>
  );
}

// ── Topbar ──────────────────────────────────────────────────
function Topbar({ activeNav, onRefresh, loading }) {
  const page = PAGE_TITLES[activeNav] || { title: activeNav, sub: '' };
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <header style={{
      background: 'white', borderBottom: '1px solid #E2E8F0',
      padding: '0 28px', height: '60px',
      display: 'flex', alignItems: 'center', gap: '16px',
      flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b' }}>{page.title}</span>
          {page.sub && (
            <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>/ {page.sub}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* 搜尋列 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: '#F1F5F9', borderRadius: '9px',
          padding: '7px 13px', width: '220px',
          border: '1px solid transparent', transition: 'all 0.15s',
        }}>
          <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center' }}>{Icon.search}</span>
          <input
            placeholder="搜尋⋯"
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontSize: '13px', color: '#334155',
              width: '100%', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ fontSize: '12px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
          {dateStr}
        </div>

        <button style={{
          width: '34px', height: '34px', borderRadius: '8px',
          border: 'none', background: '#F1F5F9', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748B', transition: 'all 0.15s',
        }}
          onMouseOver={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#334155'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
        >
          {Icon.bell}
        </button>

        {activeNav === 'dashboard' && (
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: loading ? '#F1F5F9' : T.accent,
              color: loading ? '#94A3B8' : 'white',
              border: 'none', borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12.5px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s', fontFamily: 'inherit',
            }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#A00E26'; }}
            onMouseOut={e => { if (!loading) e.currentTarget.style.background = loading ? '#F1F5F9' : T.accent; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', opacity: loading ? 0.5 : 1 }}>{Icon.refresh}</span>
            {loading ? '載入中⋯' : '重新整理'}
          </button>
        )}
      </div>
    </header>
  );
}

// ── 卡片容器 ────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #E2E8F0',
      borderRadius: '14px', padding: '20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── 載入中畫面 ─────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '400px', flexDirection: 'column', gap: '16px',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%',
        border: `3px solid ${T.accent}`, borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '14px', color: '#94A3B8' }}>資料載入中，請稍候⋯</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 錯誤畫面 ───────────────────────────────────────────────
function ErrorScreen({ error, onRetry }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '400px', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '50%',
        background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px',
      }}>⚠️</div>
      <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '15px' }}>資料載入失敗</div>
      <div style={{ fontSize: '13px', color: '#94A3B8', maxWidth: '300px', textAlign: 'center' }}>{error}</div>
      <button
        onClick={onRetry}
        style={{
          background: T.accent, color: 'white',
          border: 'none', borderRadius: '9px',
          padding: '9px 22px', fontSize: '13.5px', fontWeight: '600',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        重試
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 個人資料頁面
// ════════════════════════════════════════════════════════════
function ProfilePage({ onBack, currentUser }) {
  const ROLE_LABEL = { admin: '系統管理員', pm: '專案經理', member: '一般成員' };
  const INFO_ROWS = [
    { label: '姓名',     value: currentUser?.name  ?? '—' },
    { label: '帳號',     value: currentUser?.email ?? '—' },
    { label: '角色',     value: ROLE_LABEL[currentUser?.role] ?? '—' },
    { label: '所屬公司', value: 'xCloud 科技' },
    { label: '部門',     value: '資訊技術部' },
    { label: '電話',     value: '+886 912-345-678' },
    { label: '加入日期', value: '2023-01-15' },
  ];

  return (
    <div style={{ maxWidth: '640px', margin: '32px auto', padding: '0 28px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '7px',
          color: '#64748B', fontSize: '13.5px', marginBottom: '22px',
          padding: 0, fontFamily: 'inherit', transition: 'color 0.15s',
        }}
        onMouseOver={e => (e.currentTarget.style.color = '#1e293b')}
        onMouseOut={e => (e.currentTarget.style.color = '#64748B')}
      >
        {Icon.arrowLeft} 返回儀表板
      </button>

      <div style={{
        background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0',
        padding: '28px', marginBottom: '14px',
        display: 'flex', alignItems: 'center', gap: '22px',
      }}>
        <div style={{
          width: '68px', height: '68px', flexShrink: 0, borderRadius: '50%',
          background: 'linear-gradient(135deg, #C41230, #8B0020)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: '800', fontSize: '26px',
          boxShadow: '0 4px 14px rgba(196,18,48,0.35)',
        }}>{currentUser ? currentUser.name.slice(0, 1) : '?'}</div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b' }}>{currentUser?.name ?? '—'}</div>
          <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '2px' }}>{ROLE_LABEL[currentUser?.role] ?? '—'} · xCloud 科技</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            marginTop: '8px', padding: '3px 10px',
            background: '#F0FDF4', color: '#16a34a',
            borderRadius: '99px', fontSize: '11.5px', fontWeight: '600',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
            線上
          </div>
        </div>
      </div>

      <div style={{
        background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0',
        overflow: 'hidden', marginBottom: '14px',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontWeight: '700', color: '#374151' }}>
          基本資料
        </div>
        {INFO_ROWS.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'center', padding: '11px 20px',
            borderBottom: i < INFO_ROWS.length - 1 ? '1px solid #F8FAFC' : 'none',
            background: i % 2 === 0 ? 'white' : '#FFF8F8',
          }}>
            <div style={{ width: '96px', fontSize: '12.5px', color: '#94A3B8', flexShrink: 0 }}>{row.label}</div>
            <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontWeight: '700', color: '#374151' }}>
          帳戶設定
        </div>
        {[
          { label: '修改密碼',   desc: '定期更換密碼以保護帳戶安全' },
          { label: '通知偏好',   desc: '設定 Email / App 通知類型' },
          { label: '語言與時區', desc: '繁體中文 / Asia/Taipei' },
          { label: '登出',       desc: '結束目前登入階段', danger: true },
        ].map((item, i, arr) => (
          <button
            key={item.label}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              padding: '13px 20px',
              borderBottom: i < arr.length - 1 ? '1px solid #F8FAFC' : 'none',
              border: 'none', background: 'transparent', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.15s', fontFamily: 'inherit',
            }}
            onMouseOver={e => (e.currentTarget.style.background = item.danger ? '#FFF5F5' : '#F8FAFC')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
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

// ── URL Hash 路由輔助 ────────────────────────────────────────
const ALL_NAV_IDS = [
  ...NAV_GROUPS.flatMap(g => g.items.map(i => i.id)),
  'profile',
];

function readHashNav() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ALL_NAV_IDS.includes(hash) ? hash : 'dashboard';
}

function writeHashNav(id) {
  const newHash = id === 'dashboard' ? '' : id;
  // 用 pushState 讓瀏覽器上一頁/下一頁可用
  window.history.pushState({ nav: id }, '', newHash ? `#${newHash}` : window.location.pathname);
}

// ════════════════════════════════════════════════════════════
// 主元件：Dashboard
// ════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [activeNav,     setActiveNav]     = useState(readHashNav);   // ← 從 hash 初始化
  const [healthFilter,  setHealthFilter]  = useState(null);
  const [settingsState, setSettingsState] = useState(null);
  const [currentUser,   setCurrentUser]   = useState(null);
  const { summary, projects, workload, insights, loading, error, refresh } = useDashboard();

  // ── 監聽瀏覽器上一頁/下一頁（popstate）────────────────────
  useEffect(() => {
    const onPop = () => setActiveNav(readHashNav());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── 導覽函式：同時更新 state + URL hash ──────────────────
  const navigate = (id) => {
    setActiveNav(id);
    writeHashNav(id);
  };

  // ── 載入當前登入用戶（取第一位 admin 成員）──────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/team?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(data => {
        const admin = data.members?.find(m => m.role === 'admin') ?? data.members?.[0];
        if (admin) setCurrentUser({ name: admin.name, email: admin.email, role: admin.role });
      })
      .catch(() => {}); // 失敗時保持 null，UI 顯示「載入中⋯」
  }, []);

  // ── OAuth 回呼偵測 ──────────────────────────────────────
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const msConn    = params.get('ms_connected');
    const msError   = params.get('ms_error');
    const msEmail   = params.get('ms_email');
    const msMessage = params.get('ms_message');

    if (msConn === '1' || msError) {
      navigate('settings');
      setSettingsState({ initialTab: 'integrations', msConnected: msConn, msError, msEmail, msMessage });
      window.history.replaceState({}, document.title,
        window.location.pathname.replace(/\/settings\/integrations\/?$/, '/') || '/');
    }
  }, []);

  const filteredProjects = healthFilter
    ? projects.filter(p => p.health_status === healthFilter)
    : projects;

  // ── 頁面路由 ───────────────────────────────────────────
  const renderPage = () => {
    if (activeNav === 'projects')    return <ProjectsPage />;
    if (activeNav === 'tasks')       return <TaskKanbanPage />;
    if (activeNav === 'gantt')       return <GanttPage />;
    if (activeNav === 'workflow')    return <WorkflowDiagramPage />;
    if (activeNav === 'time')        return <TimeTrackingPage />;
    if (activeNav === 'reports')     return <ReportsPage />;
    if (activeNav === 'team')        return <TeamPage />;
    if (activeNav === 'settings')    return (
      <SettingsPage initialTab={settingsState?.initialTab} callbackState={settingsState} />
    );
    if (activeNav === 'ai-center')   return <AiDecisionCenter />;
    if (activeNav === 'mcp-console') return <McpConsolePage />;
    if (activeNav === 'discovery')   return <DiscoveryPage />;
    if (activeNav === 'profile')     return <ProfilePage onBack={() => navigate('dashboard')} currentUser={currentUser} />;

    const allItems = NAV_GROUPS.flatMap(g => g.items);
    if (activeNav !== 'dashboard') {
      const item = allItems.find(n => n.id === activeNav);
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '60vh', flexDirection: 'column', gap: '14px',
        }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '14px',
            background: '#FFF0F2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '26px',
          }}>🚧</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
            {item?.label ?? activeNav} 開發中
          </div>
          <div style={{ fontSize: '13.5px', color: '#94A3B8' }}>此功能即將上線，敬請期待</div>
        </div>
      );
    }

    return loading ? (
      <LoadingScreen />
    ) : error ? (
      <ErrorScreen error={error} onRetry={refresh} />
    ) : (
      <>
        <SummaryCards summary={summary} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <Card><HealthPieChart summary={summary} onFilter={setHealthFilter} /></Card>
          <Card><ActionableInsights insights={insights} /></Card>
        </div>

        <Card style={{ marginBottom: '16px' }}>
          {healthFilter && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '12px', padding: '8px 14px',
              background: '#FFFBEB', borderRadius: '8px', fontSize: '13px', color: '#854D0E',
              border: '1px solid #FCD34D',
            }}>
              <span>
                篩選：
                {healthFilter === 'red' ? '🔴 危險' : healthFilter === 'yellow' ? '🟡 需關注' : '🟢 正常'}
                （{filteredProjects.length} 個專案）
              </span>
              <button
                onClick={() => setHealthFilter(null)}
                style={{
                  background: 'none', border: 'none', color: '#854D0E',
                  cursor: 'pointer', fontSize: '12.5px', textDecoration: 'underline', fontFamily: 'inherit',
                }}
              >
                清除篩選
              </button>
            </div>
          )}
          <ProjectHealthList projects={filteredProjects} />
        </Card>

        <Card><WorkloadHeatmap workload={workload} /></Card>
      </>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.pageBg }}>
      <Sidebar active={activeNav} onChange={navigate} currentUser={currentUser} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minWidth: 0 }}>
        <Topbar activeNav={activeNav} onRefresh={refresh} loading={loading} />

        <main style={{
          flex: 1,
          padding: activeNav === 'dashboard' ? '24px 28px' : '0',
          maxWidth: activeNav === 'dashboard' ? '1400px' : 'none',
          width: '100%',
          margin: activeNav === 'dashboard' ? '0 auto' : '0',
          boxSizing: 'border-box',
        }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
