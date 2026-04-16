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
import { useTheme } from '../../context/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import SummaryCards          from './SummaryCards';
import HealthPieChart        from './HealthPieChart';
import ProjectHealthList     from './ProjectHealthList';
import WorkloadHeatmap       from './WorkloadHeatmap';
import ActionableInsights    from './ActionableInsights';
import OverdueTasksChart     from './OverdueTasksChart';
import UpcomingDeadlines     from './UpcomingDeadlines';
import MonthlyTrendWidget    from './MonthlyTrendWidget';
import MyImpactWidget        from './MyImpactWidget';
import { useUrgency }        from './useUrgency';
import ProjectsPage          from '../projects/ProjectsPage';
import TaskKanbanPage        from '../tasks/TaskKanbanPage';
import GanttPage             from '../gantt/GanttPage';
import TimeTrackingPage      from '../timetracking/TimeTrackingPage';
import ReportsPage           from '../reports/ReportsPage';
import TeamPage              from '../team/TeamPage';
import SettingsPage          from '../settings/SettingsPage';
// AI 決策中心、MCP 控制台、工作流程圖 已移除
import FormsPage             from '../forms/FormsPage';
import CustomFieldsPage      from '../customfields/CustomFieldsPage';
import MyTasksPage           from '../mytasks/MyTasksPage';
import GoalsPage             from '../goals/GoalsPage';
import InboxPage             from '../inbox/InboxPage';
import PortfoliosPage        from '../portfolios/PortfoliosPage';
import HelpPanel             from './HelpPanel';
import WorkloadPage          from '../workload/WorkloadPage';
import RulesPage             from '../rules/RulesPage';
import UserManagementPage    from '../admin/UserManagementPage';

// ── Design Tokens ─────────────────────────────────────────────
const T = {
  sbBg:     'var(--xc-bg-soft)',
  sbHover:  'var(--xc-surface-muted)',
  sbActive: 'var(--xc-brand-soft)',
  accent:   'var(--xc-brand)',
  accent2:  'var(--xc-brand-dark)',
  brandSoft: 'var(--xc-brand-soft)',
  brandSoftStrong: 'var(--xc-brand-soft-strong)',
  success:  'var(--xc-success)',
  successSoft: 'var(--xc-success-soft)',
  warning:  'var(--xc-warning)',
  warningSoft: 'var(--xc-warning-soft)',
  danger:   'var(--xc-danger)',
  dangerSoft: 'var(--xc-danger-soft)',
  info:     'var(--xc-info)',
  infoSoft: 'var(--xc-info-soft)',
  t1:       'var(--xc-text)',
  t2:       'var(--xc-text-soft)',
  t3:       'var(--xc-text-muted)',
  div:      'var(--xc-border)',
  pageBg:   'var(--xc-bg)',
  cardBg:   'var(--xc-surface)',
  cardBgStrong: 'var(--xc-surface-strong)',
  border:   'var(--xc-border)',
  borderStrong: 'var(--xc-border-strong)',
  topbarBg: 'color-mix(in srgb, var(--xc-surface) 92%, transparent)',
  mutedBg:  'var(--xc-surface-muted)',
  shadow:   'var(--xc-shadow-strong)',
  focusRing: '0 0 0 4px color-mix(in srgb, var(--xc-brand) 16%, transparent)',
  accentShadow: '0 10px 18px color-mix(in srgb, var(--xc-brand) 16%, transparent)',
};

// ── API ───────────────────────────────────────────────────────
const API_BASE = '';

// ── 頁面標題映射 ──────────────────────────────────────────────
const PAGE_TITLES = {
  home:            { title: '首頁',        sub: '' },
  inbox:           { title: '收件匣',      sub: '通知 · @提及 · 任務指派' },
  'my-tasks':      { title: '我的任務',    sub: '個人任務總覽 · 跨專案統一檢視' },
  projects:        { title: '專案',        sub: '管理所有進行中的專案' },
  tasks:           { title: '任務看板',    sub: 'Kanban 任務追蹤' },
  gantt:           { title: '時程規劃',    sub: '甘特圖 · 里程碑管理' },
  analytics:       { title: '分析總覽',    sub: 'KPI 圖表 · 趨勢 · 健康狀態' },
  reports:         { title: '報告',        sub: '資料分析與匯出' },
  portfolios:      { title: '專案集',      sub: '多專案健康監控 · 進度一覽' },
  goals:           { title: '目標',        sub: 'OKR 目標與關鍵結果追蹤' },
  workload:        { title: '工作負載',    sub: '成員任務分配視覺化' },
  rules:           { title: '自動化規則',  sub: '觸發條件 → 動作 · 工作流程自動化' },
  forms:           { title: '表單',        sub: '標準化請求入口 · 提交即建任務' },
  'custom-fields': { title: '自訂欄位',    sub: '追蹤優先度 · 階段 · 工時等資料' },
  time:            { title: '工時記錄',    sub: '人員工時統計' },
  team:            { title: '團隊',        sub: '成員與角色設定' },
  settings:        { title: '設定',        sub: '偏好與整合設定' },
  'user-management':{ title: '使用者管理',  sub: '帳號 · 角色 · 權限設定' },
  profile:         { title: '個人資料',    sub: '帳戶設定' },
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  taskAssigned:        true,
  taskDueReminder:     true,
  taskOverdue:         true,
  taskCompleted:       false,
  mentioned:           true,
  projectUpdate:       true,
  weeklyDigest:        true,
  emailNotifications:  false,
  pushNotifications:   true,
  digestFrequency:     'weekly',
};

// ── 全部有效路由 ──────────────────────────────────────────────
const ALL_NAV_IDS = [
  'home','inbox','my-tasks','projects','tasks','gantt',
  'analytics','reports','portfolios','goals','workload',
  'rules','forms','custom-fields',
  'time','team','settings','user-management','profile',
];

function readHashNav() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ALL_NAV_IDS.includes(hash) ? hash : 'home';
}
function writeHashNav(id) {
  const newHash = id === 'home' ? '' : id;
  window.history.pushState({ nav: id }, '', newHash ? `#${newHash}` : window.location.pathname);
}

const PANEL_MODE_OPTIONS = [
  { id: 'light', label: '開燈', desc: '明亮檢視' },
  { id: 'dark', label: '關燈', desc: '低光專注' },
];

function getPanelTheme(mode) {
  if (mode === 'light') {
    return {
      overlay: 'rgba(85, 67, 54, 0.18)',
      panelBg:
        'radial-gradient(circle at top right, rgba(180,35,60,0.12), transparent 32%), linear-gradient(180deg, #FFF9F4 0%, #F8F1E9 56%, #F4ECE3 100%)',
      panelBorder: 'rgba(140, 112, 90, 0.16)',
      panelShadow: '-20px 0 48px rgba(73, 52, 38, 0.16)',
      text: '#1F2937',
      textSoft: '#5F5650',
      textMuted: '#8A817A',
      eyebrowBg: 'rgba(255, 255, 255, 0.72)',
      eyebrowBorder: 'rgba(180, 158, 141, 0.34)',
      eyebrowText: '#8B1128',
      line: 'rgba(180, 158, 141, 0.24)',
      closeBg: 'rgba(255, 255, 255, 0.82)',
      closeBorder: 'rgba(180, 158, 141, 0.34)',
      closeText: '#3E312A',
      refreshBg: 'rgba(255, 255, 255, 0.86)',
      refreshBorder: 'rgba(180, 158, 141, 0.36)',
      refreshText: '#5B4234',
      modeRailBg: 'rgba(255, 255, 255, 0.82)',
      modeRailBorder: 'rgba(180, 158, 141, 0.32)',
      modeButtonText: '#7A6559',
      modeButtonActiveBg: '#B4233C',
      modeButtonActiveText: '#FFFFFF',
      modeHintText: '#8A817A',
      statBg: 'rgba(255, 255, 255, 0.9)',
      statBorder: 'rgba(180, 158, 141, 0.3)',
      statLabel: '#8A817A',
      statHint: '#6B5B52',
      sectionBg: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(250,242,235,0.96))',
      sectionSolidBg: 'rgba(255, 255, 255, 0.88)',
      sectionMutedBg: 'rgba(255, 255, 255, 0.84)',
      sectionBorder: 'rgba(180, 158, 141, 0.28)',
      sectionLabel: '#8A817A',
      sectionHint: '#6B5B52',
      sectionBody: '#5F5650',
      emptyText: '#6B5B52',
      progressTrack: 'rgba(191, 174, 158, 0.32)',
      errorBg: 'rgba(254, 242, 242, 0.9)',
      errorBorder: 'rgba(252, 165, 165, 0.48)',
      errorText: '#B91C1C',
    };
  }

  return {
    overlay: 'rgba(4, 8, 15, 0.52)',
    panelBg:
      'radial-gradient(circle at top right, rgba(180,35,60,0.28), transparent 28%), linear-gradient(180deg, #0B1018 0%, #131A24 56%, #0D121A 100%)',
    panelBorder: 'rgba(148, 163, 184, 0.18)',
    panelShadow: '-24px 0 56px rgba(2, 6, 23, 0.5)',
    text: '#F8FAFC',
    textSoft: 'rgba(226, 232, 240, 0.74)',
    textMuted: 'rgba(226, 232, 240, 0.64)',
    eyebrowBg: 'rgba(15, 23, 42, 0.48)',
    eyebrowBorder: 'rgba(148, 163, 184, 0.16)',
    eyebrowText: '#E2E8F0',
    line: 'rgba(148, 163, 184, 0.12)',
    closeBg: 'rgba(15, 23, 42, 0.58)',
    closeBorder: 'rgba(148, 163, 184, 0.16)',
    closeText: '#F8FAFC',
    refreshBg: 'rgba(15, 23, 42, 0.58)',
    refreshBorder: 'rgba(148, 163, 184, 0.18)',
    refreshText: '#E2E8F0',
    modeRailBg: 'rgba(15, 23, 42, 0.58)',
    modeRailBorder: 'rgba(148, 163, 184, 0.14)',
    modeButtonText: 'rgba(226, 232, 240, 0.72)',
    modeButtonActiveBg: '#F8FAFC',
    modeButtonActiveText: '#0F172A',
    modeHintText: 'rgba(226, 232, 240, 0.6)',
    statBg: 'rgba(15, 23, 42, 0.62)',
    statBorder: 'rgba(148, 163, 184, 0.14)',
    statLabel: 'rgba(226, 232, 240, 0.58)',
    statHint: 'rgba(226, 232, 240, 0.72)',
    sectionBg: 'linear-gradient(180deg, rgba(15,23,42,0.72), rgba(30,41,59,0.62))',
    sectionSolidBg: 'rgba(15, 23, 42, 0.58)',
    sectionMutedBg: 'rgba(15, 23, 42, 0.52)',
    sectionBorder: 'rgba(148, 163, 184, 0.14)',
    sectionLabel: 'rgba(226, 232, 240, 0.58)',
    sectionHint: 'rgba(226, 232, 240, 0.64)',
    sectionBody: 'rgba(226, 232, 240, 0.68)',
    emptyText: 'rgba(226, 232, 240, 0.72)',
    progressTrack: 'rgba(148, 163, 184, 0.14)',
    errorBg: 'rgba(127, 29, 29, 0.32)',
    errorBorder: 'rgba(248, 113, 113, 0.26)',
    errorText: '#FECACA',
  };
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
  userMgmt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  moon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3c0 5 4 9 9 9 .27 0 .53-.01.79-.03A6.78 6.78 0 0021 12.79z"/></svg>,
  sun: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"/></svg>,
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
  analytics:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
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
        padding: sbCollapsed ? '9px 0' : indent ? '7px 10px 7px 28px' : '7px 10px',
        justifyContent: sbCollapsed ? 'center' : 'flex-start',
        borderRadius: '10px',
        border: `1px solid ${isActive ? T.borderStrong : 'transparent'}`,
        background: isActive ? T.sbActive : hov ? T.sbHover : 'transparent',
        color: isActive ? T.accent2 : hov ? T.t1 : T.t2,
        fontSize: '15px', fontWeight: isActive ? '700' : '500',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s', position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {isActive && (
        <span style={{
          position: 'absolute', left: 0, top: '20%', height: '60%',
          width: '2px', borderRadius: '0 2px 2px 0', background: T.accent,
        }} />
      )}
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: isActive ? 1 : 0.8 }}>
        {icon}
      </span>
      {!sbCollapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      )}
      {!sbCollapsed && badge != null && badge > 0 && (
        <span style={{
          background: T.accent, color: 'white',
          fontSize: '12px', fontWeight: '700',
          padding: '1px 6px', borderRadius: '99px', flexShrink: 0,
        }}>{badge}</span>
      )}
      {sbCollapsed && badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: '4px', right: '4px',
          background: T.accent, color: 'white',
          fontSize: '11px', fontWeight: '700',
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
        padding: '12px 10px 6px', userSelect: 'none',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <button
        onClick={onToggle}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '13px', fontWeight: '700', color: T.t3,
          letterSpacing: '0.03em',
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
// 頂部導航列 — Desktop: 水平選單 + hover 下拉  Mobile: 漢堡 + 側抽屜
// ════════════════════════════════════════════════════════════
function TopNavBar({
  active, onNavigate, currentUser, authFetch, inboxCount,
  onTogglePanel, panelOpen, panelMode, onHelp,
  isMobile, mobileOpen, onMobileToggle, onMobileClose,
}) {
  const [openDrop, setOpenDrop] = useState(null);
  const [apiProjects, setApiProjects] = useState([]);
  const dropTimer = useRef(null);

  useEffect(() => {
    if (!currentUser?.companyId) return;
    authFetch(`${API_BASE}/api/projects?companyId=${currentUser.companyId}`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.data || d.projects || []);
        setApiProjects(list.slice(0, 8));
      })
      .catch(() => {});
  }, [authFetch, currentUser?.companyId]);

  const PROJECT_COLORS = ['#C41230','#2563EB','#16A34A','#D97706','#7C3AED','#0D9488','#DB2777','#EA580C'];
  const projColor = (p) => PROJECT_COLORS[(p.id || 0) % PROJECT_COLORS.length];

  const handleNav = (id) => { onNavigate(id); setOpenDrop(null); };
  const enterDrop = (id) => { clearTimeout(dropTimer.current); setOpenDrop(id); };
  const leaveDrop = () => { dropTimer.current = setTimeout(() => setOpenDrop(null), 150); };

  // panel 按鈕樣式
  const isLightPanel = panelMode === 'light';
  const panelIcon = isLightPanel ? Ic.sun : Ic.moon;
  const panelLabel = isLightPanel ? '開燈' : '關燈';
  const panelButtonState = panelOpen
    ? isLightPanel
      ? { bg: '#F5E6D8', border: '#D9BDA0', color: '#6C4930' }
      : { bg: '#161C27', border: '#2A3342', color: '#F4F7FB' }
    : isLightPanel
      ? { bg: '#FFF7F0', border: '#E6D6C8', color: '#7A5A47' }
      : { bg: T.cardBg, border: T.border, color: T.t2 };

  // ── 導覽群組定義 ─────────────────────────────────────────
  const NAV_DROPS = [
    { groupId: 'insights', label: '解析', icon: Ic.analytics, items: [
      { navId: 'analytics',  label: '分析總覽', icon: Ic.analytics },
      { navId: 'reports',    label: '報告',     icon: Ic.reports },
      { navId: 'portfolios', label: '專案集',   icon: Ic.portfolios },
      { navId: 'goals',      label: '目標',     icon: Ic.goals },
      { navId: 'workload',   label: '工作負載', icon: Ic.workload },
    ]},
    { groupId: 'projects', label: '專案', icon: Ic.projects, items: [
      { navId: 'projects', label: '所有專案', icon: Ic.projects },
      { navId: 'tasks',    label: '任務看板', icon: Ic.tasks },
      { navId: 'gantt',    label: '時程規劃', icon: Ic.gantt },
    ], showProjects: true },
    { groupId: 'wf', label: '流程', icon: Ic.workflow, items: [
      { navId: 'rules',         label: '自動化規則', icon: Ic.rules },
      { navId: 'forms',         label: '表單',       icon: Ic.forms },
      { navId: 'custom-fields', label: '自訂欄位',   icon: Ic.customFields },
    ]},
    { groupId: 'tools', label: '工具', icon: Ic.time, items: [
      { navId: 'time',        label: '工時記錄',    icon: Ic.time },
    ]},
  ];

  const isGroupActive = (g) => g.items.some(it => it.navId === active);

  // ── 小型頂部按鈕 ─────────────────────────────────────────
  const TopBtn = ({ id, icon, label, badge }) => {
    const act = active === id;
    return (
      <button
        onClick={() => handleNav(id)}
        title={label}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 10px', borderRadius: '8px', border: 'none',
          background: act ? T.sbActive : 'transparent',
          color: act ? T.accent2 : T.t2,
          fontSize: '14px', fontWeight: act ? '700' : '500',
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!act) { e.currentTarget.style.background = T.sbHover; e.currentTarget.style.color = T.t1; } }}
        onMouseLeave={e => { if (!act) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.t2; } }}
      >
        <span style={{ display: 'flex', opacity: act ? 1 : 0.7 }}>{icon}</span>
        <span>{label}</span>
        {badge > 0 && (
          <span style={{
            background: T.accent, color: 'white', fontSize: '11px', fontWeight: '700',
            padding: '1px 5px', borderRadius: '99px',
          }}>{badge}</span>
        )}
      </button>
    );
  };

  // ── 下拉選單群組 ─────────────────────────────────────────
  const DropGroup = ({ group }) => {
    const gActive = isGroupActive(group);
    const isOpen = openDrop === group.groupId;
    return (
      <div
        onMouseEnter={() => enterDrop(group.groupId)}
        onMouseLeave={leaveDrop}
        style={{ position: 'relative' }}
      >
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '5px 8px', borderRadius: '8px', border: 'none',
            background: isOpen ? T.sbHover : gActive ? T.sbActive : 'transparent',
            color: gActive ? T.accent2 : T.t2,
            fontSize: '14px', fontWeight: gActive ? '700' : '500',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.sbHover; e.currentTarget.style.color = T.t1; }}
          onMouseLeave={e => {
            e.currentTarget.style.background = isOpen ? T.sbHover : gActive ? T.sbActive : 'transparent';
            e.currentTarget.style.color = gActive ? T.accent2 : T.t2;
          }}
        >
          <span style={{ display: 'flex', opacity: gActive ? 1 : 0.7 }}>{group.icon}</span>
          <span>{group.label}</span>
          <span style={{ opacity: 0.4, display: 'flex', transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>{Ic.chevDown}</span>
        </button>

        {/* 下拉面板 */}
        {isOpen && (
          <div
            onMouseEnter={() => enterDrop(group.groupId)}
            onMouseLeave={leaveDrop}
            style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0,
              minWidth: '210px', background: T.cardBgStrong,
              border: `1px solid ${T.border}`, borderRadius: '10px',
              boxShadow: T.shadow, padding: '4px', zIndex: 200,
            }}
          >
            {group.items.map(it => {
              const itActive = active === it.navId;
              return (
                <button
                  key={it.navId}
                  onClick={() => handleNav(it.navId)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '7px', border: 'none',
                    background: itActive ? T.sbActive : 'transparent',
                    color: itActive ? T.accent2 : T.t2,
                    fontSize: '14px', fontWeight: itActive ? '700' : '500',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => { if (!itActive) { e.currentTarget.style.background = T.sbHover; e.currentTarget.style.color = T.t1; } }}
                  onMouseLeave={e => { if (!itActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.t2; } }}
                >
                  <span style={{ display: 'flex', opacity: 0.7 }}>{it.icon}</span>
                  {it.label}
                </button>
              );
            })}
            {/* 動態專案清單 */}
            {group.showProjects && apiProjects.length > 0 && (
              <>
                <div style={{ height: '1px', background: T.div, margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '11px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>
                  近期專案
                </div>
                {apiProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleNav('projects')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 12px', borderRadius: '7px', border: 'none',
                      background: 'transparent', color: T.t2,
                      fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.sbHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: projColor(p), flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════
  //  Desktop 頂部列
  // ════════════════════════════════════════════════════════
  if (!isMobile) {
    return (
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: T.topbarBg, backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 14px', height: '52px', gap: '2px',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div
          onClick={() => handleNav('home')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '10px', flexShrink: 0, cursor: 'pointer' }}
        >
          <LogoIcon size={24} />
          <span style={{ fontSize: '15px', fontWeight: '800', color: T.t1, letterSpacing: '-0.3px' }}>xCloudPMIS</span>
        </div>

        <div style={{ width: '1px', height: '24px', background: T.div, margin: '0 4px', flexShrink: 0 }} />

        {/* Main nav items */}
        <TopBtn id="home"     icon={Ic.home}    label="首頁" />
        <TopBtn id="my-tasks" icon={Ic.myTasks} label="我的任務" />
        <TopBtn id="inbox"    icon={Ic.inbox}   label="收件匣" badge={inboxCount} />

        <div style={{ width: '1px', height: '24px', background: T.div, margin: '0 4px', flexShrink: 0 }} />

        {/* Dropdown groups */}
        {NAV_DROPS.map(g => <DropGroup key={g.groupId} group={g} />)}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* 右側功能 */}
        <TopBtn id="team"     icon={Ic.team}     label="團隊" />
        {currentUser?.role === 'admin' && (
          <TopBtn id="user-management" icon={Ic.userMgmt} label="管理" />
        )}
        <TopBtn id="settings" icon={Ic.settings} label="設定" />

        <div style={{ width: '1px', height: '24px', background: T.div, margin: '0 6px', flexShrink: 0 }} />

        {/* 工作面板 */}
        <button
          onClick={onTogglePanel}
          title="工作面板"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px', height: '34px',
            borderRadius: '8px', border: `1px solid ${panelButtonState.border}`,
            background: panelButtonState.bg, cursor: 'pointer', padding: '0 10px',
            fontSize: '13px', color: panelButtonState.color, fontWeight: '700',
            transition: 'all 0.15s',
          }}
        >
          {panelIcon}
          <span style={{
            padding: '2px 6px', borderRadius: '999px', fontSize: '11px', fontWeight: '800',
            background: panelOpen
              ? isLightPanel ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.12)'
              : isLightPanel ? '#F6E8DB' : T.mutedBg,
            color: panelOpen
              ? isLightPanel ? '#7A5A47' : '#F4F7FB'
              : isLightPanel ? '#7A5A47' : T.t3,
          }}>
            {panelLabel}
          </span>
        </button>

        {/* 說明 */}
        <button
          onClick={onHelp}
          title="說明"
          style={{
            height: '34px', borderRadius: '8px', border: `1px solid ${T.border}`,
            background: T.cardBg, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 10px',
            fontSize: '13px', color: T.t2, fontWeight: '700',
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.mutedBg}
          onMouseLeave={e => e.currentTarget.style.background = T.cardBg}
        >
          說明
        </button>

        {/* 通知鈴鐺 */}
        <button
          onClick={() => handleNav('inbox')}
          title="通知"
          style={{
            width: '34px', height: '34px', borderRadius: '8px',
            border: `1px solid ${active === 'inbox' ? T.accent : T.border}`,
            background: active === 'inbox' ? T.brandSoftStrong : T.cardBg,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: active === 'inbox' ? T.accent : T.t2,
            transition: 'all 0.15s', position: 'relative',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.brandSoftStrong; e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => {
            e.currentTarget.style.background = active === 'inbox' ? T.brandSoftStrong : T.cardBg;
            e.currentTarget.style.color = active === 'inbox' ? T.accent : T.t2;
          }}
        >
          {Ic.bell}
          {inboxCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: T.accent, color: 'white', fontSize: '10px', fontWeight: '700',
              width: '16px', height: '16px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{inboxCount > 9 ? '9+' : inboxCount}</span>
          )}
        </button>

        {/* 使用者頭像 */}
        <button
          onClick={() => handleNav('profile')}
          title={currentUser?.name || '個人資料'}
          style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: active === 'profile'
              ? 'linear-gradient(135deg,#E85D73,#C41230)'
              : 'linear-gradient(135deg,#C94A5D,#9E1830)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '14px',
            border: active === 'profile' ? `2px solid ${T.accent}` : '2px solid transparent',
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}
        >
          {currentUser ? currentUser.name.slice(0, 1) : '?'}
        </button>
      </header>
    );
  }

  // ════════════════════════════════════════════════════════
  //  Mobile：漢堡列 + 側邊抽屜
  // ════════════════════════════════════════════════════════
  const page = PAGE_TITLES[active] || { title: active };

  // 手機版 drawer 中的 nav click
  const mobileNav = (id) => { handleNav(id); if (onMobileClose) onMobileClose(); };

  return (
    <>
      {/* ── 頂部列 ───────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: T.topbarBg, backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', height: '50px', gap: '8px',
        flexShrink: 0,
      }}>
        <button
          onClick={onMobileToggle}
          style={{
            width: '36px', height: '36px', borderRadius: '8px',
            border: `1px solid ${T.border}`, background: T.cardBg,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.t2, flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <LogoIcon size={22} />
        <span style={{
          fontSize: '16px', fontWeight: '700', color: T.t1,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {page.title}
        </span>
        {/* 通知 */}
        <button
          onClick={() => mobileNav('inbox')}
          style={{
            width: '34px', height: '34px', borderRadius: '8px',
            border: `1px solid ${T.border}`, background: T.cardBg,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.t2, position: 'relative',
          }}
        >
          {Ic.bell}
          {inboxCount > 0 && (
            <span style={{
              position: 'absolute', top: '-3px', right: '-3px',
              background: T.accent, color: 'white', fontSize: '10px', fontWeight: '700',
              width: '15px', height: '15px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{inboxCount > 9 ? '9+' : inboxCount}</span>
          )}
        </button>
        {/* 面板 */}
        <button
          onClick={onTogglePanel}
          style={{
            height: '34px', borderRadius: '8px',
            border: `1px solid ${panelButtonState.border}`,
            background: panelButtonState.bg, cursor: 'pointer', padding: '0 8px',
            display: 'flex', alignItems: 'center', gap: '3px',
            color: panelButtonState.color, fontSize: '13px', fontWeight: '700',
          }}
        >
          {panelIcon}
        </button>
      </header>

      {/* ── 遮罩 ─────────────────────────────────────── */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.45)', transition: 'opacity 0.25s',
          }}
        />
      )}

      {/* ── 側邊抽屜 ─────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '280px', background: T.sbBg,
        display: 'flex', flexDirection: 'column',
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        zIndex: 9999, borderRight: `1px solid ${T.div}`,
        boxShadow: T.shadow,
      }}>
        {/* Logo */}
        <div style={{
          padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: '10px',
          borderBottom: `1px solid ${T.div}`, flexShrink: 0,
        }}>
          <LogoIcon size={26} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: T.t1 }}>xCloudPMIS</div>
            <div style={{ fontSize: '11px', color: T.t3 }}>企業級專案管理</div>
          </div>
        </div>

        {/* Nav 項目 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          <NavItem id="home"     icon={Ic.home}    label="首頁"     active={active} onClick={mobileNav} />
          <NavItem id="my-tasks" icon={Ic.myTasks} label="我的任務" active={active} onClick={mobileNav} />
          <NavItem id="inbox"    icon={Ic.inbox}   label="收件匣"   active={active} onClick={mobileNav} badge={inboxCount} />

          <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />
          <div style={{ padding: '8px 10px 4px', fontSize: '12px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>深入解析</div>
          <NavItem id="analytics"  icon={Ic.analytics}  label="分析總覽" active={active} onClick={mobileNav} indent />
          <NavItem id="reports"    icon={Ic.reports}    label="報告"     active={active} onClick={mobileNav} indent />
          <NavItem id="portfolios" icon={Ic.portfolios} label="專案集"   active={active} onClick={mobileNav} indent />
          <NavItem id="goals"      icon={Ic.goals}      label="目標"     active={active} onClick={mobileNav} indent />
          <NavItem id="workload"   icon={Ic.workload}   label="工作負載" active={active} onClick={mobileNav} indent />

          <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />
          <div style={{ padding: '8px 10px 4px', fontSize: '12px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>專案</div>
          <NavItem id="projects" icon={Ic.projects} label="所有專案" active={active} onClick={mobileNav} indent />
          <NavItem id="tasks"    icon={Ic.tasks}    label="任務看板" active={active} onClick={mobileNav} indent />
          <NavItem id="gantt"    icon={Ic.gantt}    label="時程規劃" active={active} onClick={mobileNav} indent />
          {apiProjects.map(p => (
            <button
              key={p.id}
              onClick={() => mobileNav('projects')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 10px 5px 28px', borderRadius: '6px', border: 'none',
                background: 'transparent', color: T.t2,
                fontSize: '14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.sbHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: projColor(p), flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
            </button>
          ))}

          <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />
          <div style={{ padding: '8px 10px 4px', fontSize: '12px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>工作流程</div>
          <NavItem id="rules"         icon={Ic.rules}        label="自動化規則" active={active} onClick={mobileNav} indent />
          <NavItem id="forms"         icon={Ic.forms}        label="表單"       active={active} onClick={mobileNav} indent />
          <NavItem id="custom-fields" icon={Ic.customFields} label="自訂欄位"   active={active} onClick={mobileNav} indent />

          <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />
          <div style={{ padding: '8px 10px 4px', fontSize: '12px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>工具</div>
          <NavItem id="time"        icon={Ic.time} label="工時記錄"    active={active} onClick={mobileNav} indent />

          <div style={{ height: '1px', background: T.div, margin: '6px 4px' }} />
          <NavItem id="team" icon={Ic.team} label="團隊" active={active} onClick={mobileNav} />
        </div>

        {/* 底部 */}
        <div style={{ padding: '8px 8px 12px', borderTop: `1px solid ${T.div}`, flexShrink: 0 }}>
          <NavItem id="settings" icon={Ic.settings} label="設定" active={active} onClick={mobileNav} />
          {currentUser?.role === 'admin' && (
            <NavItem id="user-management" icon={Ic.userMgmt} label="使用者管理" active={active} onClick={mobileNav} />
          )}
          <button
            onClick={() => mobileNav('profile')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
              padding: '8px 10px', marginTop: '4px', borderRadius: '8px',
              border: `1px solid ${active === 'profile' ? T.borderStrong : 'transparent'}`,
              background: active === 'profile' ? T.sbActive : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => { if (active !== 'profile') e.currentTarget.style.background = T.sbHover; }}
            onMouseLeave={e => { if (active !== 'profile') e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#C94A5D,#9E1830)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: '700', fontSize: '14px',
            }}>
              {currentUser ? currentUser.name.slice(0, 1) : '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: T.t1, fontSize: '14px', fontWeight: '500',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {currentUser?.name ?? '載入中⋯'}
              </div>
              <div style={{ color: T.t3, fontSize: '12px' }}>
                {currentUser?.role === 'admin' ? '系統管理員' : currentUser?.role === 'pm' ? '專案經理' : '一般成員'}
              </div>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
}

function DarkPanel({ open, onClose, onNavigate, currentUser, inboxCount, dashData, mode = 'dark', onModeChange }) {
  const { summary, projects, insights, loading, error, refresh } = dashData;
  const panelTheme = getPanelTheme(mode);
  const panelIcon = mode === 'light' ? Ic.sun : Ic.moon;
  const modeTitle = mode === 'light' ? '開燈模式' : '關燈模式';

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const focusStats = [
    {
      label: '未讀通知',
      value: inboxCount,
      hint: inboxCount > 0 ? '收件匣有新變化' : '目前已清空',
      accent: mode === 'light' ? '#B4233C' : '#F07A8A',
    },
    {
      label: '逾期任務',
      value: summary?.total_overdue_tasks ?? 0,
      hint: summary?.total_overdue_tasks > 0 ? '建議先排除阻塞' : '目前控制良好',
      accent: mode === 'light' ? '#C77829' : '#FDBA74',
    },
    {
      label: '危險專案',
      value: summary?.red_projects ?? 0,
      hint: summary?.red_projects > 0 ? '需要立即跟進' : '暫無紅燈',
      accent: mode === 'light' ? '#7C3AED' : '#C084FC',
    },
    {
      label: '本月到期',
      value: summary?.due_this_month ?? 0,
      hint: '近期里程碑與交付',
      accent: mode === 'light' ? '#1D75B8' : '#7DD3FC',
    },
  ];

  const spotlightProjects = [...(projects || [])]
    .sort((left, right) => {
      const leftRisk = (left.overdue_tasks ?? left.taskOverdue ?? 0) + (left.health_status === 'red' ? 3 : 0);
      const rightRisk = (right.overdue_tasks ?? right.taskOverdue ?? 0) + (right.health_status === 'red' ? 3 : 0);
      return rightRisk - leftRisk;
    })
    .slice(0, 4);

  const insightCards = (insights || []).slice(0, 3).map((item, index) => ({
    id: item.id || `insight-${index}`,
    title: item.title || item.headline || item.label || '今日提醒',
    body: item.description || item.message || item.detail || item.recommendation || '系統已整理出需要優先查看的線索。',
  }));

  const actionCards = [
    { label: '打開收件匣', desc: '先看通知與 @提及', nav: 'inbox' },
    { label: '查看任務看板', desc: '重新排程與分派', nav: 'tasks' },
    { label: '檢查自動化規則', desc: '確認提醒與流程', nav: 'rules' },
  ];

  const timeLabel = new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: panelTheme.overlay,
          backdropFilter: 'blur(8px)',
          zIndex: 350,
        }}
      />

      <aside
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(480px, 95vw)',
          maxHeight: '90vh',
          zIndex: 360,
          color: panelTheme.text,
          background: panelTheme.panelBg,
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'darkPanelSlideIn .18s ease',
        }}
      >
        <style>{`
          @keyframes darkPanelSlideIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>

        <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${panelTheme.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '999px', background: panelTheme.eyebrowBg, border: `1px solid ${panelTheme.eyebrowBorder}`, color: panelTheme.eyebrowText, fontSize: '13px', fontWeight: '800', letterSpacing: '0.08em' }}>
                {panelIcon}
                WORK PANEL
              </div>
              <div style={{ marginTop: '14px', fontSize: '30px', fontWeight: '900', letterSpacing: '-0.05em' }}>
                工作面板
              </div>
              <div style={{ marginTop: '8px', fontSize: '15px', lineHeight: 1.7, color: panelTheme.textSoft }}>
                {currentUser?.name || '團隊成員'}，這裡整理了目前最值得先處理的風險、通知與快速入口。
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                border: `1px solid ${panelTheme.closeBorder}`,
                background: panelTheme.closeBg,
                color: panelTheme.closeText,
                cursor: 'pointer',
                fontSize: '20px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: panelTheme.textMuted }}>
              最後整理時間 {timeLabel}
            </div>
            <button
              onClick={() => refresh()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: `1px solid ${panelTheme.refreshBorder}`,
                background: panelTheme.refreshBg,
                color: panelTheme.refreshText,
                borderRadius: '999px',
                padding: '8px 12px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              {Ic.refresh}
              {loading ? '同步中' : '重新整理'}
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '6px',
              padding: '6px',
              borderRadius: '16px',
              background: panelTheme.modeRailBg,
              border: `1px solid ${panelTheme.modeRailBorder}`,
            }}>
              {PANEL_MODE_OPTIONS.map((item) => {
                const active = item.id === mode;
                return (
                  <button
                    key={item.id}
                    onClick={() => onModeChange?.(item.id)}
                    style={{
                      border: 'none',
                      borderRadius: '12px',
                      background: active ? panelTheme.modeButtonActiveBg : 'transparent',
                      color: active ? panelTheme.modeButtonActiveText : panelTheme.modeButtonText,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '800' }}>
                      {item.id === 'light' ? Ic.sun : Ic.moon}
                      {item.label}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '13px', color: active ? panelTheme.modeButtonActiveText : panelTheme.modeHintText }}>
                      {item.desc}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: panelTheme.textMuted }}>
              目前為 {modeTitle}，可依環境亮度快速切換。
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '12px 14px',
              borderRadius: '16px',
              background: panelTheme.errorBg,
              border: `1px solid ${panelTheme.errorBorder}`,
              fontSize: '14px',
              color: panelTheme.errorText,
              lineHeight: 1.7,
            }}>
              資料同步時發生問題：{error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            {focusStats.map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: '18px',
                  padding: '16px',
                  background: panelTheme.statBg,
                  border: `1px solid ${panelTheme.statBorder}`,
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.statLabel }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '10px', fontSize: '30px', fontWeight: '900', color: item.accent }}>
                  {item.value}
                </div>
                <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: 1.6, color: panelTheme.statHint }}>
                  {item.hint}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', borderRadius: '22px', padding: '18px', background: panelTheme.sectionBg, border: `1px solid ${panelTheme.sectionBorder}` }}>
            <div style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>快捷入口</div>
            <div style={{ marginTop: '6px', fontSize: '20px', fontWeight: '800' }}>快速處理今晚的工作節點</div>
            <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
              {actionCards.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    onNavigate(item.nav);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: `1px solid ${panelTheme.sectionBorder}`,
                    background: panelTheme.sectionSolidBg,
                    borderRadius: '16px',
                    padding: '14px 14px',
                    color: panelTheme.text,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: '800' }}>{item.label}</div>
                  <div style={{ marginTop: '6px', fontSize: '14px', color: panelTheme.sectionHint }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>風險專案</div>
            {spotlightProjects.length === 0 ? (
              <div style={{
                borderRadius: '18px',
                padding: '18px',
                background: panelTheme.sectionMutedBg,
                border: `1px solid ${panelTheme.sectionBorder}`,
                fontSize: '15px',
                color: panelTheme.emptyText,
              }}>
                目前沒有需要額外關注的專案，節奏維持得不錯。
              </div>
            ) : (
              spotlightProjects.map((project, index) => {
                const overdue = project.overdue_tasks ?? project.taskOverdue ?? 0;
                const progress = Math.round(parseFloat(project.completion_pct ?? project.completion ?? 0));
                const tone = overdue > 0 || project.health_status === 'red'
                  ? '#F07A8A'
                  : overdue > 0 || project.health_status === 'yellow'
                    ? '#FDBA74'
                    : '#86EFAC';

                return (
                  <button
                    key={project.id || `${project.name}-${index}`}
                    onClick={() => {
                      onNavigate('projects');
                      onClose();
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: `1px solid ${panelTheme.sectionBorder}`,
                      background: panelTheme.sectionSolidBg,
                      borderRadius: '18px',
                      padding: '16px',
                      color: panelTheme.text,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: '800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.project_name ?? project.name}
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '13px', color: panelTheme.sectionHint }}>
                          {overdue > 0 ? `${overdue} 項逾期` : '目前無逾期項目'}
                        </div>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: tone }}>
                        {progress}%
                      </div>
                    </div>
                    <div style={{ marginTop: '12px', height: '6px', borderRadius: '999px', background: panelTheme.progressTrack, overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', borderRadius: '999px', background: tone }} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>行動建議</div>
            {insightCards.length === 0 ? (
              <div style={{
                borderRadius: '18px',
                padding: '18px',
                background: panelTheme.sectionMutedBg,
                border: `1px solid ${panelTheme.sectionBorder}`,
                fontSize: '15px',
                color: panelTheme.emptyText,
              }}>
                系統目前沒有額外建議，可維持當前節奏。
              </div>
            ) : (
              insightCards.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: '18px',
                    padding: '16px',
                    background: panelTheme.sectionMutedBg,
                    border: `1px solid ${panelTheme.sectionBorder}`,
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: '800' }}>{item.title}</div>
                  <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: 1.7, color: panelTheme.sectionBody }}>
                    {item.body}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// P1#7-9  Widget 定義表
// ════════════════════════════════════════════════════════════
const WIDGET_DEFS = [
  { id: 'summary',        icon: '📊', title: 'KPI 數字卡',          desc: '完成率、活躍專案、逾期、成員',    defaultOn: true  },
  { id: 'healthPie',      icon: '🟢', title: '專案健康分布',         desc: '健康狀態環形圖',                  defaultOn: true  },
  { id: 'projectHealth',  icon: '📈', title: '專案任務進度',         desc: '各專案完成率橫條圖',              defaultOn: true  },
  { id: 'workload',       icon: '👥', title: '成員工作負載',         desc: '任務負載熱力直條圖',              defaultOn: true  },
  { id: 'insights',       icon: '💡', title: '月度趨勢與洞察',       desc: '趨勢折線 + AI 洞察卡片',          defaultOn: true  },
  { id: 'monthlyTrend',   icon: '📉', title: '月完成趨勢線',         desc: '12 個月完成 vs 新建 + 完成率',    defaultOn: true  },
  { id: 'overdue',        icon: '⏰', title: '逾期任務',             desc: '按優先度分析逾期任務',            defaultOn: true  },
  { id: 'upcoming',       icon: '📅', title: '即將截止',             desc: '14 天內截止任務分群',             defaultOn: true  },
  { id: 'myImpact',       icon: '🎯', title: 'My Impact',           desc: '個人完成統計與趨勢',              defaultOn: false },
];

const DEFAULT_WIDGETS = Object.fromEntries(WIDGET_DEFS.map(w => [w.id, w.defaultOn]));
const LS_KEY = 'xcloud-analytics-widgets';

function loadWidgetPrefs() {
  try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
  catch { return DEFAULT_WIDGETS; }
}

// ════════════════════════════════════════════════════════════
// 分析總覽頁面 — P0 核心可視化 + P1#7-9 Widget 系統
// ════════════════════════════════════════════════════════════
function AnalyticsPage({ dashData }) {
  const { summary, projects, workload, insights, loading, error, refresh } = dashData;
  const { isMobile } = useResponsive();
  const monthlyTrend = dashData.monthlyTrend || [];
  const urgency      = useUrgency(14);
  const { authFetch } = useAuth();

  // P1#7-9: Widget 開關狀態
  const [widgets,       setWidgets]       = useState(loadWidgetPrefs);
  const [showPalette,   setShowPalette]   = useState(false);

  // 全頁重整：同時刷新 summary + urgency 兩個資料源
  const refreshAll = useCallback(() => {
    refresh();
    urgency.refresh();
  }, [refresh, urgency.refresh]);

  // 快速將逾期任務標記為完成
  const handleMarkDone = useCallback(async (taskId) => {
    if (!authFetch) return;
    try {
      await authFetch(`/api/my-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      urgency.refresh(); // 刷新逾期清單
    } catch (e) {
      console.error('[AnalyticsPage] markDone 失敗:', e.message);
    }
  }, [authFetch, urgency.refresh]);

  const toggleWidget = (id) => {
    setWidgets(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const on = (id) => widgets[id] !== false;

  const cardStyle = {
    background:   'var(--xc-surface)',
    border:       '1px solid var(--xc-border)',
    borderRadius: '12px',
    padding:      '20px 24px',
  };

  const sectionTitle = {
    fontSize: '15px',
    fontWeight:    600,
    color:         'var(--xc-text-soft)',
    marginBottom:  '16px',
    display:       'flex',
    alignItems:    'center',
    gap:           '6px',
  };

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--xc-danger)' }}>
        <div style={{ fontSize: '34px', marginBottom: '12px' }}>⚠️</div>
        <div>資料載入失敗：{error}</div>
        <button onClick={refresh} style={{ marginTop: '12px', padding: '8px 16px',
          borderRadius: '6px', border: '1px solid var(--xc-border)',
          background: 'var(--xc-surface)', cursor: 'pointer', color: 'var(--xc-text)' }}>
          重試
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding:   isMobile ? '16px 14px' : '28px 32px',
      maxWidth:  '1280px',
      margin:    '0 auto',
      display:   'flex',
      flexDirection: 'column',
      gap:       isMobile ? '16px' : '24px',
    }}>
      {/* 頁頭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--xc-text)', margin: 0 }}>
            分析總覽
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--xc-text-muted)', margin: '4px 0 0' }}>
            即時 KPI · 專案健康 · 工作負載 · 月度趨勢
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* P1#7-9: 小工具面板按鈕 */}
          <button
            onClick={() => setShowPalette(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px',
              border: showPalette ? '1px solid var(--xc-brand)' : '1px solid var(--xc-border)',
              background: showPalette ? 'color-mix(in srgb, var(--xc-brand) 10%, var(--xc-surface))' : 'var(--xc-surface)',
              cursor: 'pointer', fontSize: '14px',
              color: showPalette ? 'var(--xc-brand)' : 'var(--xc-text-soft)',
              fontWeight: showPalette ? 700 : 400,
            }}
          >
            ⊞ 自訂小工具
          </button>
          <button
            onClick={refreshAll}
            disabled={loading || urgency.loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px',
              border: '1px solid var(--xc-border)',
              background: 'var(--xc-surface)', cursor: 'pointer',
              fontSize: '14px', color: 'var(--xc-text-soft)',
              opacity: (loading || urgency.loading) ? 0.5 : 1,
            }}
          >
            <span style={{ display: 'inline-block', animation: (loading || urgency.loading) ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
            重新整理
          </button>
        </div>
      </div>

      {/* P1#7-9: Widget 選擇面板 */}
      {showPalette && (
        <div style={{
          background:   'var(--xc-surface)',
          border:       '1px solid var(--xc-brand)',
          borderRadius: '12px',
          padding:      '20px 24px',
          boxShadow:    '0 4px 20px rgba(0,0,0,.1)',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--xc-text)', marginBottom: '14px' }}>
            📐 選擇要顯示的小工具
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '10px',
          }}>
            {WIDGET_DEFS.map(w => (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 14px', borderRadius: '10px',
                  border: on(w.id) ? '1.5px solid var(--xc-brand)' : '1px solid var(--xc-border)',
                  background: on(w.id) ? 'color-mix(in srgb, var(--xc-brand) 6%, var(--xc-surface))' : 'var(--xc-surface-soft)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: '20px', lineHeight: 1.2 }}>{w.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: on(w.id) ? 'var(--xc-brand)' : 'var(--xc-text)' }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--xc-text-muted)', marginTop: '2px' }}>
                    {w.desc}
                  </div>
                </div>
                <span style={{
                  marginLeft: 'auto', width: '16px', height: '16px',
                  borderRadius: '50%',
                  background: on(w.id) ? 'var(--xc-brand)' : 'var(--xc-border)',
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on(w.id) && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--xc-text-muted)' }}>
            偏好設定會自動儲存至本機，下次登入仍會保留。
          </div>
        </div>
      )}

      {/* KPI 數字卡 */}
      {on('summary') && <SummaryCards summary={summary} loading={loading} />}

      {/* 中間行：環形圖 + 專案長條圖 */}
      {(on('healthPie') || on('projectHealth')) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (on('healthPie') && on('projectHealth') ? '1fr 1.4fr' : '1fr'), gap: isMobile ? '14px' : '20px' }}>
          {on('healthPie') && (
            <div style={cardStyle}>
              <div style={sectionTitle}>🟢 專案健康狀態分布</div>
              <HealthPieChart projects={projects} loading={loading} />
            </div>
          )}
          {on('projectHealth') && (
            <div style={cardStyle}>
              <div style={sectionTitle}>📊 專案任務進度</div>
              <ProjectHealthList projects={projects} loading={loading} />
            </div>
          )}
        </div>
      )}

      {/* 工作負載 + 洞察 */}
      {(on('workload') || on('insights')) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (on('workload') && on('insights') ? '1.2fr 1fr' : '1fr'), gap: isMobile ? '14px' : '20px' }}>
          {on('workload') && (
            <div style={cardStyle}>
              <div style={sectionTitle}>👥 成員工作負載</div>
              <WorkloadHeatmap workload={workload} loading={loading} />
            </div>
          )}
          {on('insights') && (
            <div style={cardStyle}>
              <div style={sectionTitle}>📈 月度趨勢與洞察</div>
              <ActionableInsights insights={insights} monthlyTrend={monthlyTrend} loading={loading} />
            </div>
          )}
        </div>
      )}

      {/* P1#33: 月完成趨勢線（獨立大 widget）*/}
      {on('monthlyTrend') && (
        <div style={cardStyle}>
          <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
            <span>📉 按月完成趨勢（12 個月）</span>
            <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)', fontWeight: 400 }}>
              管理層關鍵指標
            </span>
          </div>
          <MonthlyTrendWidget monthlyTrend={monthlyTrend} loading={loading} />
        </div>
      )}

      {/* P2#35: My Impact */}
      {on('myImpact') && (
        <div style={cardStyle}>
          <div style={sectionTitle}>🎯 My Impact — 個人貢獻</div>
          <MyImpactWidget />
        </div>
      )}

      {/* 管理痛點區：逾期 + 即將截止 */}
      {(on('overdue') || on('upcoming')) && (
        <div style={{ borderTop: '2px solid var(--xc-border)', paddingTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--xc-text)' }}>⚡ 管理焦點</span>
            <span style={{ fontSize: '14px', color: 'var(--xc-text-muted)' }}>— 最需要立即關注的任務</span>
            {urgency.loading && (
              <span style={{ fontSize: '13px', color: 'var(--xc-text-muted)', marginLeft: 'auto' }}>載入中…</span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (on('overdue') && on('upcoming') ? '1fr 1fr' : '1fr'), gap: isMobile ? '14px' : '20px' }}>
            {on('overdue') && (
              <div style={{
                ...cardStyle,
                borderColor: urgency.overdue.length > 0 ? 'color-mix(in srgb, #ef4444 30%, var(--xc-border))' : 'var(--xc-border)',
              }}>
                <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
                  <span>⏰ 逾期任務</span>
                  {urgency.overdue.length > 0 && (
                    <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(239,68,68,.12)', color: '#ef4444', fontWeight: 700 }}>
                      {urgency.overdue.length} 個
                    </span>
                  )}
                </div>
                <OverdueTasksChart overdue={urgency.overdue} overdueByPriority={urgency.overdueByPriority} loading={urgency.loading} onMarkDone={handleMarkDone} />
              </div>
            )}
            {on('upcoming') && (
              <div style={{
                ...cardStyle,
                borderColor: urgency.upcoming.some(t => t.urgencyGroup === 'today') ? 'color-mix(in srgb, #f97316 30%, var(--xc-border))' : 'var(--xc-border)',
              }}>
                <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
                  <span>📅 即將截止</span>
                  {urgency.upcoming.length > 0 && (
                    <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(234,179,8,.12)', color: '#ca8a04', fontWeight: 700 }}>
                      14 天內 {urgency.upcoming.length} 個
                    </span>
                  )}
                </div>
                <UpcomingDeadlines upcoming={urgency.upcoming} loading={urgency.loading} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Asana 風格「首頁」
// ════════════════════════════════════════════════════════════
function HomePage({ currentUser, onNavigate, dashData }) {
  const { isDark } = useTheme();
  const { authFetch } = useAuth();
  const { isMobile } = useResponsive();
  const { projects, workload, insights, monthlyTrend, loading, error, refresh } = dashData;
  const [myTasksTab,    setMyTasksTab]    = useState('upcoming');
  const [myTasks,       setMyTasks]       = useState([]);
  const [tasksLoading,  setTasksLoading]  = useState(true);
  const [showCustomize, setShowCustomize] = useState(false);
  const [homeWidgets,   setHomeWidgets]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('xcloud-home-widgets') || 'null') || { tasks: true, projects: true, insights: true }; }
    catch { return { tasks: true, projects: true, insights: true }; }
  });

  // 時段問候
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安';
  const dateStr = new Date().toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  });

  // 載入我的任務（使用 authFetch 帶 JWT，並以 assigneeId 過濾個人任務）
  useEffect(() => {
    if (!currentUser?.companyId || !currentUser?.id) return;
    setTasksLoading(true);
    const fetcher = authFetch || fetch;
    fetcher(`${API_BASE}/api/my-tasks?companyId=${currentUser.companyId}`)
      .then(r => r.json())
      .then(d => {
        // /api/my-tasks 回傳 { success, data: [...] }
        const list = Array.isArray(d.data) ? d.data
          : Array.isArray(d) ? d
          : [];
        setMyTasks(list);
      })
      .catch(() => setMyTasks([]))
      .finally(() => setTasksLoading(false));
  }, [currentUser?.companyId, currentUser?.id, authFetch]);

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
    const d = t.completedAt || t.updatedAt;
    if (!d) return false;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(d) >= weekAgo;
  }).length;

  const recentProjects = projects.slice(0, 6);
  const workloadCount = Array.isArray(workload?.users)
    ? workload.users.length
    : Array.isArray(workload)
      ? workload.length
      : 0;
  const nextDueTask = [...tabTasks.upcoming]
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const homeStats = [
    {
      label: '本週截止',
      value: `${tabTasks.upcoming.length}`,
      unit: '項任務',
      detail: tabTasks.upcoming.length > 0 ? '七天內需要安排的工作' : '目前沒有本週截止項目',
      nav: 'my-tasks',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(56, 33, 43, 0.78), rgba(29, 36, 48, 0.96))'
        : T.brandSoftStrong,
      accent: T.accent,
    },
    {
      label: '已完成',
      value: `${completedCount}`,
      unit: '項任務',
      detail: '最近七天已更新完成的工作',
      nav: 'my-tasks',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(22, 53, 36, 0.78), rgba(29, 36, 48, 0.96))'
        : T.successSoft,
      accent: T.success,
    },
    {
      label: '活躍專案',
      value: `${recentProjects.length}`,
      unit: '個',
      detail: '目前首頁顯示中的重點專案',
      nav: 'projects',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(36, 42, 78, 0.76), rgba(29, 36, 48, 0.96))'
        : 'color-mix(in srgb, var(--xc-info-soft) 28%, var(--xc-surface))',
      accent: '#5B57D9',
    },
    {
      label: '協作成員',
      value: `${workloadCount}`,
      unit: '位',
      detail: '近期在工作負載中出現的人員',
      nav: 'workload',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(23, 42, 67, 0.78), rgba(29, 36, 48, 0.96))'
        : T.infoSoft,
      accent: T.info,
    },
  ];

  const pageBg = isDark
    ? 'linear-gradient(180deg, rgba(7,12,19,0.18), rgba(7,12,19,0.18)), linear-gradient(180deg, #111723 0%, #161D29 100%)'
    : 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22)), linear-gradient(180deg, #F4EFE9 0%, #F6F1EB 100%)';
  const heroBg = isDark
    ? 'linear-gradient(180deg, rgba(56, 33, 43, 0.56), rgba(29, 36, 48, 0.98))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.98))';
  const heroBadgeBg = isDark ? 'color-mix(in srgb, var(--xc-brand-soft) 88%, var(--xc-surface))' : T.brandSoft;
  const heroBadgeText = isDark ? T.accent : T.accent2;
  const neutralHoverBg = isDark ? T.mutedBg : '#FBF7F3';
  const customizeActiveBg = isDark ? T.brandSoft : T.brandSoftStrong;
  const toggleOffBg = isDark ? T.cardBgStrong : '#D5CCC5';
  const toggleKnobBg = isDark ? 'color-mix(in srgb, var(--xc-surface) 82%, white)' : 'white';
  const toggleKnobShadow = isDark ? '0 4px 12px rgba(2, 6, 23, 0.34)' : '0 1px 3px rgba(0,0,0,0.18)';
  const myTasksIconBg = isDark ? 'color-mix(in srgb, var(--xc-brand-soft) 84%, var(--xc-surface))' : '#FFF1F3';
  const projectsIconBg = isDark ? 'color-mix(in srgb, var(--xc-warning-soft) 72%, var(--xc-surface))' : '#F7F1EC';
  const projectsIconColor = isDark ? T.warning : '#8A5D3B';
  const progressTrackBg = isDark ? T.cardBgStrong : '#EFE6DF';
  const tabActiveShadow = isDark ? '0 1px 0 rgba(255,255,255,0.06)' : '0 1px 2px rgba(52,36,30,0.08)';
  const tabCountActiveBg = isDark ? T.brandSoft : '#FFF1F3';
  const tabCountInactiveBg = isDark ? T.cardBgStrong : '#EEE4DD';

  const cardShell = {
    background: T.cardBg,
    borderRadius: '18px',
    border: `1px solid ${T.border}`,
    boxShadow: T.shadow,
  };

  return (
    <div style={{
      minHeight: '100%',
      background: pageBg,
      padding: isMobile ? '16px 14px 24px' : '32px 36px 40px',
      boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: isMobile ? '14px' : '18px',
          marginBottom: '18px',
        }}>
          <section style={{
            ...cardShell,
            padding: '24px 26px',
            background: heroBg,
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '999px',
              background: heroBadgeBg,
              color: heroBadgeText,
              fontSize: '13px',
              fontWeight: '800',
              letterSpacing: '0.05em',
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.accent }} />
              PERSONAL WORKSPACE
            </div>

            <div style={{ marginTop: '18px', fontSize: '15px', color: T.t3 }}>{dateStr}</div>
            <h1 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: '900', color: T.t1, letterSpacing: '-0.04em' }}>
              {currentUser ? `${currentUser.name}，${greeting}` : greeting}
            </h1>
            <p style={{ margin: '14px 0 0', maxWidth: '42rem', fontSize: '16px', lineHeight: 1.8, color: T.t2 }}>
              首頁整理了今天最需要注意的任務、專案與協作狀態。先看即將到期的工作，再檢查進度異常的專案，日常節奏會更穩。
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '22px' }}>
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: T.accentShadow,
                }}
              >
                前往我的任務
              </button>
              <button
                onClick={() => refresh()}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${T.border}`,
                  background: T.cardBg,
                  color: T.t2,
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                重新整理資料
              </button>
            </div>
          </section>

          <aside style={{
            ...cardShell,
            padding: '22px 22px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>
                今日重點
              </div>
              <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
                <div style={{ paddingBottom: '12px', borderBottom: `1px solid ${T.div}` }}>
                  <div style={{ fontSize: '14px', color: T.t3 }}>下一個截止</div>
                  <div style={{ marginTop: '5px', fontSize: '16px', fontWeight: '800', color: T.t1 }}>
                    {nextDueTask ? (nextDueTask.title || nextDueTask.name) : '目前沒有本週截止項目'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '14px', color: T.t2 }}>
                    {nextDueTask?.dueDate
                      ? `截止於 ${new Date(nextDueTask.dueDate).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}`
                      : '可以安排整理待辦或補充資料'}
                  </div>
                </div>
                <div style={{ paddingBottom: '12px', borderBottom: `1px solid ${T.div}` }}>
                  <div style={{ fontSize: '14px', color: T.t3 }}>逾期關注</div>
                  <div style={{ marginTop: '5px', fontSize: '24px', fontWeight: '900', color: tabTasks.overdue.length > 0 ? T.accent : T.t1 }}>
                    {tabTasks.overdue.length}
                  </div>
                  <div style={{ marginTop: '2px', fontSize: '14px', color: T.t2 }}>
                    {tabTasks.overdue.length > 0 ? '建議先確認責任人與阻塞原因' : '目前沒有逾期任務'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: T.t3 }}>同步狀態</div>
                  <div style={{ marginTop: '5px', fontSize: '16px', fontWeight: '700', color: T.t1 }}>
                    {loading ? '正在更新首頁資料' : error ? '資料更新時發生問題' : '首頁資料已同步'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '14px', color: T.t2 }}>
                    {error ? '可稍後重新整理，或檢查後端服務狀態。' : '任務、專案與工作負載會在這裡彙整顯示。'}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: isMobile ? '10px' : '14px',
          marginBottom: '20px',
        }}>
          {homeStats.map((item) => (
            <button
              key={item.label}
              onClick={() => onNavigate(item.nav)}
              style={{
                ...cardShell,
                padding: '18px 18px 16px',
                background: item.tone,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '800', color: T.t3, letterSpacing: '0.04em' }}>{item.label}</div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '30px', fontWeight: '900', color: item.accent, letterSpacing: '-0.05em' }}>{item.value}</span>
                <span style={{ fontSize: '15px', color: T.t2 }}>{item.unit}</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '14px', color: T.t2, lineHeight: 1.7 }}>
                {item.detail}
              </div>
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '14px',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>首頁配置</div>
            <div style={{ marginTop: '4px', fontSize: '20px', fontWeight: '800', color: T.t1 }}>
              工作概覽
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            <button
              onClick={() => onNavigate('projects')}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: `1px solid ${T.border}`,
                background: T.cardBg,
                color: T.t2,
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              查看所有專案
            </button>

            <button
              onClick={() => setShowCustomize(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                background: showCustomize ? customizeActiveBg : T.cardBg,
                borderRadius: '10px',
                border: `1px solid ${showCustomize ? T.borderStrong : T.border}`,
                fontSize: '15px',
                color: showCustomize ? T.accent2 : T.t2,
                cursor: 'pointer',
                fontWeight: '700',
                transition: 'all 0.12s',
              }}
            >
              版面設定
            </button>

            {showCustomize && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 10px)',
                background: T.cardBg,
                borderRadius: '14px',
                border: `1px solid ${T.border}`,
                boxShadow: T.shadow,
                zIndex: 200,
                minWidth: '250px',
                padding: '16px',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: T.t1, marginBottom: '12px' }}>
                  顯示項目
                </div>
                {[
                  { key: 'tasks',    label: '我的任務面板' },
                  { key: 'projects', label: '專案概覽面板' },
                  { key: 'insights', label: '月度趨勢與洞察' },
                ].map((w) => (
                  <label key={w.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 0',
                    borderBottom: `1px solid ${T.div}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}>
                    <span style={{ fontSize: '15px', color: T.t1 }}>{w.label}</span>
                    <div
                      onClick={() => {
                        const next = { ...homeWidgets, [w.key]: !homeWidgets[w.key] };
                        setHomeWidgets(next);
                        try { localStorage.setItem('xcloud-home-widgets', JSON.stringify(next)); } catch {}
                      }}
                      style={{
                        width: '38px',
                        height: '22px',
                        borderRadius: '999px',
                        background: homeWidgets[w.key] ? T.accent : toggleOffBg,
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: homeWidgets[w.key] ? '18px' : '2px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: toggleKnobBg,
                        transition: 'left 0.2s',
                        boxShadow: toggleKnobShadow,
                      }} />
                    </div>
                  </label>
                ))}
                <button
                  onClick={() => setShowCustomize(false)}
                  style={{
                    width: '100%',
                    marginTop: '14px',
                    background: 'color-mix(in srgb, var(--xc-brand) 82%, #000000 18%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 0',
                    fontSize: '15px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: T.accentShadow,
                  }}
                >
                  套用設定
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: isMobile ? '14px' : '18px',
          marginBottom: '18px',
        }}>
          <div style={{
            ...cardShell,
            overflow: 'hidden',
            display: homeWidgets.tasks ? 'flex' : 'none',
            flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px 14px',
              borderBottom: `1px solid ${T.div}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '11px',
                  background: myTasksIconBg,
                  color: T.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {Ic.myTasks}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: T.t3, fontWeight: '800', letterSpacing: '0.04em' }}>個人工作台</div>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: T.t1 }}>我的任務</div>
                </div>
              </div>
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent2, fontSize: '14px', fontWeight: '700', padding: 0 }}
              >
                查看全部
              </button>
            </div>

            <div style={{ padding: '14px 20px 0' }}>
              <div style={{
                display: 'inline-flex',
                padding: '4px',
                borderRadius: '12px',
                background: T.mutedBg,
                gap: '4px',
              }}>
                {[
                  { key: 'upcoming', label: '即將截止', count: tabTasks.upcoming.length },
                  { key: 'overdue',  label: '逾期',     count: tabTasks.overdue.length },
                  { key: 'completed',label: '已完成',   count: tabTasks.completed.length },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setMyTasksTab(tab.key)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: 'none',
                      borderRadius: '10px',
                      background: myTasksTab === tab.key ? T.cardBg : 'transparent',
                      boxShadow: myTasksTab === tab.key ? tabActiveShadow : 'none',
                      cursor: 'pointer',
                      color: myTasksTab === tab.key ? T.accent2 : T.t2,
                      fontWeight: myTasksTab === tab.key ? '700' : '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 6px',
                        borderRadius: '999px',
                        background: myTasksTab === tab.key ? tabCountActiveBg : tabCountInactiveBg,
                        color: myTasksTab === tab.key ? T.accent2 : T.t3,
                        fontSize: '12px',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '12px 0 8px', minHeight: '220px', maxHeight: '360px', overflowY: 'auto' }}>
              {tasksLoading ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: T.t3, fontSize: '15px' }}>正在整理任務資料…</div>
              ) : displayTasks.length === 0 ? (
                <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: T.t1 }}>
                    {myTasksTab === 'upcoming' ? '目前沒有本週截止項目' :
                     myTasksTab === 'overdue' ? '沒有逾期任務' : '最近七天尚未完成任務'}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '14px', color: T.t2, lineHeight: 1.7 }}>
                    {myTasksTab === 'completed'
                      ? '完成後的任務會整理在這裡，方便快速回顧。'
                      : '可前往任務工作台新增或重新安排優先順序。'}
                  </div>
                </div>
              ) : (
                displayTasks.map((task) => {
                  const isDone = task.status === 'done';
                  const isOverdue = task.dueDate && new Date(task.dueDate) < now && !isDone;
                  return (
                    <button
                      key={task.id}
                      onClick={() => onNavigate('my-tasks')}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px 20px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = neutralHoverBg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        marginTop: '1px',
                        border: `1.5px solid ${isDone ? T.success : isOverdue ? T.accent : T.borderStrong}`,
                        background: isDone ? T.success : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '12px',
                      }}>
                        {isDone ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '15px',
                          color: isDone ? T.t3 : T.t1,
                          textDecoration: isDone ? 'line-through' : 'none',
                          fontWeight: '600',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {task.title || task.name}
                        </div>
                        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', color: T.t3 }}>
                            {task.project?.name || '未指定專案'}
                          </span>
                          {task.dueDate && (
                            <span style={{
                              fontSize: '13px',
                              color: isOverdue ? T.accent : T.t2,
                              fontWeight: isOverdue ? '700' : '600',
                            }}>
                              截止 {new Date(task.dueDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={{
            ...cardShell,
            overflow: 'hidden',
            display: homeWidgets.projects ? 'flex' : 'none',
            flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px 14px',
              borderBottom: `1px solid ${T.div}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '11px',
                  background: projectsIconBg,
                  color: projectsIconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {Ic.projects}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: T.t3, fontWeight: '800', letterSpacing: '0.04em' }}>專案概覽</div>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: T.t1 }}>重點專案</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => refresh()}
                  title="更新專案資料"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.t2, fontSize: '14px', fontWeight: '700', padding: 0 }}
                >
                  更新資料
                </button>
                <button
                  onClick={() => onNavigate('projects')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent2, fontSize: '14px', fontWeight: '700', padding: 0 }}
                >
                  查看全部
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 0 8px', minHeight: '220px', maxHeight: '360px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: T.t3, fontSize: '15px' }}>正在同步專案資料…</div>
              ) : recentProjects.length === 0 ? (
                <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: T.t1 }}>目前沒有可顯示的專案</div>
                  <div style={{ marginTop: '6px', fontSize: '14px', color: T.t2 }}>建立專案後，首頁會自動整理進度與風險。</div>
                </div>
              ) : (
                recentProjects.map((p, i) => {
                  const colors = ['#B4233C', '#2C6ECB', '#2F855A', '#A5662B', '#5B57D9', '#18776B'];
                  const color = colors[i % colors.length];
                  const overdue = p.overdue_tasks ?? p.taskOverdue ?? 0;
                  const total   = p.total_tasks   ?? p.totalTasks  ?? p.taskTotal ?? 0;
                  const done    = p.done_tasks    ?? p.taskCounts?.done ?? p.taskDone ?? 0;
                  const pct = Math.round(parseFloat(p.completion_pct ?? p.completionRate ?? p.completion ?? 0));
                  const statusText = overdue > 0
                    ? `${overdue} 項逾期`
                    : total > 0
                      ? `${done}/${total} 項已完成`
                      : '尚未建立任務';
                  return (
                    <button
                      key={p.id}
                      onClick={() => onNavigate('projects')}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '14px 20px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = neutralHoverBg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '11px',
                        background: color,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {Ic.projects}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.project_name ?? p.name}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '13px', color: overdue > 0 ? T.accent : T.t2, fontWeight: overdue > 0 ? '700' : '600' }}>
                          {statusText}
                        </div>
                        {total > 0 && (
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: progressTrackBg, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${pct}%`,
                                borderRadius: '999px',
                                background: overdue > 0 ? T.accent : color,
                                transition: 'width 0.4s ease',
                              }} />
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: overdue > 0 ? T.accent : color }}>{pct}%</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 月度趨勢與洞察 */}
        {homeWidgets.insights && (
          <div style={{ ...cardShell, padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>數據洞察</div>
            <div style={{ marginTop: '4px', fontSize: '20px', fontWeight: '800', color: T.t1, marginBottom: '16px' }}>📈 月度趨勢與洞察</div>
            <ActionableInsights insights={insights} monthlyTrend={monthlyTrend} loading={loading} />
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 個人資料頁
// ════════════════════════════════════════════════════════════
function ProfilePage({ onBack, currentUser, onLogout, onNavigate }) {
  const { isDark } = useTheme();
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
  const statusBadgeBg = isDark ? T.infoSoft : '#F4F8FD';
  const hoverBg = isDark ? T.mutedBg : '#FBF7F3';
  const dangerHoverBg = isDark ? T.brandSoft : T.brandSoftStrong;

  return (
    <div style={{ maxWidth: '680px', margin: '32px auto', padding: '0 28px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', color: T.t2, fontSize: '15px', marginBottom: '22px', padding: 0, fontFamily: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.color = T.t1}
        onMouseOut={e => e.currentTarget.style.color = T.t2}
      >
        {Ic.arrowLeft} 返回首頁
      </button>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, padding: '30px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '22px', boxShadow: T.shadow }}>
        <div style={{ width: '70px', height: '70px', flexShrink: 0, borderRadius: '50%', background: 'linear-gradient(135deg,#C94A5D,#9E1830)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '28px', boxShadow: '0 10px 18px rgba(180, 35, 60, 0.18)' }}>
          {currentUser ? currentUser.name.slice(0, 1) : '?'}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>帳戶資訊</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: T.t1, marginTop: '6px' }}>{currentUser?.name ?? '—'}</div>
          <div style={{ fontSize: '15px', color: T.t2, marginTop: '4px' }}>{ROLE_LABEL[currentUser?.role] ?? '—'} · {currentUser?.company?.name ?? '—'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '4px 10px', background: statusBadgeBg, color: T.info, borderRadius: '999px', fontSize: '13px', fontWeight: '700' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: T.info, display: 'inline-block' }} />
            帳戶已啟用
          </div>
        </div>
      </div>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, overflow: 'hidden', marginBottom: '16px', boxShadow: T.shadow }}>
        {INFO_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < INFO_ROWS.length - 1 ? `1px solid ${T.div}` : 'none' }}>
            <div style={{ width: '96px', fontSize: '14px', color: T.t3, flexShrink: 0 }}>{row.label}</div>
            <div style={{ fontSize: '15px', color: T.t1, fontWeight: '600' }}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: T.shadow }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${T.div}`, fontSize: '15px', fontWeight: '800', color: T.t1 }}>帳戶設定</div>
        {[
          { label: '修改密碼', desc: '定期更換密碼以保護帳戶安全', onClick: () => onNavigate?.('settings', { initialTab: 'profile' }) },
          { label: '通知偏好', desc: '設定 Email / App 通知類型', onClick: () => onNavigate?.('settings', { initialTab: 'notifications' }) },
          { label: '語言與時區', desc: '繁體中文 / Asia/Taipei', onClick: null },
          { label: '登出', desc: '結束目前登入階段', danger: true, onClick: onLogout },
        ].map((item, i, arr) => (
          <button key={item.label}
            onClick={item.onClick || undefined}
            style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${T.div}` : 'none', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            onMouseOver={e => e.currentTarget.style.background = item.danger ? dangerHoverBg : hoverBg}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: item.danger ? T.accent : T.t1 }}>{item.label}</div>
              <div style={{ fontSize: '13px', color: T.t3, marginTop: '2px' }}>{item.desc}</div>
            </div>
            <span style={{ color: T.t3, fontSize: '20px' }}>›</span>
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
  const { user: currentUser, logout, authFetch } = useAuth();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const { isMobile } = useResponsive();

  const [activeNav,       setActiveNav]       = useState(readHashNav);
  const [settingsState,   setSettingsState]   = useState(null);
  const [inboxCount,      setInboxCount]      = useState(0);
  const [showDarkPanel,   setShowDarkPanel]   = useState(false);
  const [showHelp,        setShowHelp]        = useState(false);
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false);
  const dashData = useDashboard();
  const latestNotificationIdRef = useRef(0);

  const playNotificationSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.12);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.18);
      window.setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 240);
    } catch {}
  }, []);

  const dispatchDesktopNotification = useCallback((notification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const desktopNotification = new Notification(notification.title, {
        body: notification.body || '您有新的工作通知',
        tag: `xcloud-notification-${notification.id}`,
      });

      desktopNotification.onclick = () => {
        window.focus();
        if (notification.resourceType === 'task') {
          writeHashNav('tasks');
        } else {
          writeHashNav('inbox');
        }
      };
    } catch {}
  }, []);

  const toggleSidebar = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const changePanelMode = useCallback((nextMode) => {
    setThemeMode(nextMode);
  }, [setThemeMode]);

  useEffect(() => {
    const sync = () => setActiveNav(readHashNav());
    window.addEventListener('popstate',   sync);   // pushState 後退/前進
    window.addEventListener('hashchange', sync);   // location.hash = '...' 或 <a href="#...">
    return () => {
      window.removeEventListener('popstate',   sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = useCallback((id) => {
    setActiveNav(id);
    setShowDarkPanel(false);
    setMobileMenuOpen(false);
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

  useEffect(() => {
    if (!currentUser?.id) return;

    let cancelled = false;

    const syncNotifications = async (initialLoad = false) => {
      try {
        const [countResponse, settingsResponse, notificationsResponse] = await Promise.all([
          authFetch('/api/notifications/unread-count'),
          authFetch(`/api/settings/notifications?userId=${currentUser.id}`),
          authFetch('/api/notifications?limit=10'),
        ]);

        const [countPayload, settingsPayload, notificationsPayload] = await Promise.all([
          countResponse.json(),
          settingsResponse.json(),
          notificationsResponse.json(),
        ]);

        if (cancelled) return;

        setInboxCount(Number(countPayload?.data?.count || 0));

        const settings = settingsPayload?.settings || DEFAULT_NOTIFICATION_SETTINGS;
        const notifications = Array.isArray(notificationsPayload?.data) ? notificationsPayload.data : [];
        const newestId = notifications.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0);

        if (initialLoad || latestNotificationIdRef.current === 0) {
          latestNotificationIdRef.current = newestId;
          return;
        }

        const freshNotifications = notifications
          .filter((item) => Number(item.id) > latestNotificationIdRef.current)
          .sort((left, right) => Number(left.id) - Number(right.id));

        if (newestId > latestNotificationIdRef.current) {
          latestNotificationIdRef.current = newestId;
        }

        if (freshNotifications.length === 0) return;

        freshNotifications.forEach((item) => {
          if (settings.pushNotifications) {
            dispatchDesktopNotification(item);
            playNotificationSound();
          }
        });
      } catch {}
    };

    syncNotifications(true);
    const resyncNotifications = () => {
      syncNotifications(false);
    };
    const timer = window.setInterval(() => {
      syncNotifications(false);
    }, 30000);
    window.addEventListener('xcloud-notifications-updated', resyncNotifications);
    window.addEventListener('xcloud-notification-settings-updated', resyncNotifications);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('xcloud-notifications-updated', resyncNotifications);
      window.removeEventListener('xcloud-notification-settings-updated', resyncNotifications);
    };
  }, [authFetch, currentUser?.id, dispatchDesktopNotification, playNotificationSound]);

  // ── 頁面路由 ──────────────────────────────────────────────
  const renderPage = () => {
    if (activeNav === 'home')          return <HomePage currentUser={currentUser} onNavigate={navigate} dashData={dashData} />;
    if (activeNav === 'analytics')     return <AnalyticsPage dashData={dashData} />;
    if (activeNav === 'inbox')         return <InboxPage onNavigate={navigate} />;
    if (activeNav === 'my-tasks')      return <MyTasksPage />;
    if (activeNav === 'projects')      return <ProjectsPage />;
    if (activeNav === 'tasks')         return <TaskKanbanPage />;
    if (activeNav === 'gantt')         return <GanttPage />;
    if (activeNav === 'rules')         return <RulesPage />;
    if (activeNav === 'time')          return <TimeTrackingPage />;
    if (activeNav === 'goals')         return <GoalsPage />;
    if (activeNav === 'portfolios')    return <PortfoliosPage onNavigate={navigate} />;
    if (activeNav === 'workload')      return <WorkloadPage onNavigate={navigate} />;
    if (activeNav === 'reports')       return <ReportsPage />;
    if (activeNav === 'team')          return <TeamPage />;
    if (activeNav === 'settings')      return <SettingsPage initialTab={settingsState?.initialTab} callbackState={settingsState} />;

    if (activeNav === 'user-management') return <UserManagementPage />;
    if (activeNav === 'forms')         return <FormsPage />;
    if (activeNav === 'custom-fields') return <CustomFieldsPage onNavigate={navigate} />;
    if (activeNav === 'profile')       return <ProfilePage onBack={() => navigate('home')} currentUser={currentUser} onLogout={logout} onNavigate={(nav, state) => { setSettingsState(state); navigate(nav); }} />;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '14px' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: T.brandSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>🚧</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: T.t1 }}>開發中</div>
        <div style={{ fontSize: '15px', color: T.t3 }}>此功能即將上線，敬請期待</div>
      </div>
    );
  };

  // ── 未分配部門引導：首次登入導向整合服務 ──────────────────
  const needsOnboarding = currentUser && !currentUser.department;
  const [dismissedOnboarding, setDismissedOnboarding] = useState(() => {
    try { return sessionStorage.getItem('xc_onboarding_dismissed') === '1'; } catch { return false; }
  });
  const showOnboarding = needsOnboarding && !dismissedOnboarding && activeNav !== 'settings';

  const goToIntegrations = useCallback(() => {
    setSettingsState({ initialTab: 'integrations' });
    navigate('settings');
    setDismissedOnboarding(true);
    try { sessionStorage.setItem('xc_onboarding_dismissed', '1'); } catch {}
  }, [navigate]);

  const dismissOnboarding = useCallback(() => {
    setDismissedOnboarding(true);
    try { sessionStorage.setItem('xc_onboarding_dismissed', '1'); } catch {}
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: T.pageBg, color: isDark ? T.t1 : undefined }}>
      {/* 未分配部門引導遮罩 */}
      {showOnboarding && (
        <>
          <div onClick={dismissOnboarding} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 420, maxWidth: '92vw', background: 'var(--xc-surface)', borderRadius: 16,
            boxShadow: '0 24px 80px rgba(0,0,0,.3)', zIndex: 9999,
            padding: '32px 28px', textAlign: 'center',
            animation: 'onboardFadeIn .25s ease',
          }}>
            <style>{`@keyframes onboardFadeIn { from { opacity:0; transform:translate(-50%,-50%) scale(.95); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }`}</style>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--xc-text)', margin: '0 0 8px' }}>
              歡迎加入 xCloudPMIS！
            </h2>
            <p style={{ fontSize: 14, color: 'var(--xc-text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              您的部門資訊尚未設定。<br />
              請先連結 <strong>Microsoft 365 / Azure AD</strong> 帳號，<br />
              系統將自動同步您的部門與職稱資訊。
            </p>
            <button
              onClick={goToIntegrations}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
                background: 'var(--xc-brand, #C70018)', color: '#fff',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              前往整合服務連結帳號
            </button>
            <button
              onClick={dismissOnboarding}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 8,
                border: '1px solid var(--xc-border-strong)', background: 'transparent',
                color: 'var(--xc-text-soft)', fontSize: 14, cursor: 'pointer',
              }}
            >
              稍後再說
            </button>
          </div>
        </>
      )}

      <TopNavBar
        active={activeNav}
        onNavigate={navigate}
        currentUser={currentUser}
        authFetch={authFetch}
        inboxCount={inboxCount}
        onTogglePanel={() => setShowDarkPanel((current) => !current)}
        panelOpen={showDarkPanel}
        panelMode={themeMode}
        onHelp={() => setShowHelp(true)}
        isMobile={isMobile}
        mobileOpen={mobileMenuOpen}
        onMobileToggle={toggleSidebar}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <DarkPanel
        open={showDarkPanel}
        onClose={() => setShowDarkPanel(false)}
        onNavigate={navigate}
        currentUser={currentUser}
        inboxCount={inboxCount}
        dashData={dashData}
        mode={themeMode}
        onModeChange={changePanelMode}
      />

      <HelpPanel
        open={showHelp}
        onClose={() => setShowHelp(false)}
        currentPage={activeNav}
      />

      <main style={{ flex: 1, minWidth: 0 }}>
        {renderPage()}
      </main>
    </div>
  );
}
