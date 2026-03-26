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
import MyTasksWorkspacePage  from '../mytasks/MyTasksWorkspacePage';
import GoalsPage             from '../goals/GoalsPage';
import InboxPage             from '../inbox/InboxPage';
import PortfoliosPage        from '../portfolios/PortfoliosPage';
import WorkloadPage          from '../workload/WorkloadPage';
import RulesPage             from '../rules/RulesPage';

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

const DEFAULT_NOTIFICATION_SETTINGS = {
  type_assign: true,
  type_mention: true,
  type_comment: true,
  type_done: true,
  type_due: true,
  email_daily: true,
  email_instant: false,
  app_desktop: true,
  app_sound: false,
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
        fontSize: '13.5px', fontWeight: isActive ? '700' : '500',
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
          fontSize: '11px', fontWeight: '700', color: T.t3,
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
// Asana 風格側邊欄（支援收縮）
// ════════════════════════════════════════════════════════════
function Sidebar({ active, onChange, currentUser, isCollapsed, onToggleCollapse, authFetch, inboxCount }) {
  const [collapsed, setCollapsed] = useState({ insights: false, projects: false, workflow: false, tools: false });
  const [apiProjects, setApiProjects] = useState([]);

  // 展開/收合 section
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // 從 API 取得專案清單
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
      borderRight: `1px solid ${T.div}`,
      boxShadow: T.shadow,
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
            boxShadow: T.accentShadow,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#9E1830'}
          onMouseLeave={e => e.currentTarget.style.background = T.accent}
        >
          {Ic.plus}
          {!isCollapsed && '新增項目'}
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
            borderRadius: '10px', border: `1px solid ${active === 'team' ? T.borderStrong : 'transparent'}`,
            background: active === 'team' ? T.sbActive : 'transparent',
            color: active === 'team' ? T.accent2 : T.t2,
            fontSize: '13.5px', fontWeight: active === 'team' ? '700' : '500',
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
            border: `1px solid ${active === 'profile' ? T.borderStrong : 'transparent'}`,
            background: active === 'profile' ? T.sbActive : 'transparent',
            cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          onMouseEnter={e => { if (active !== 'profile') e.currentTarget.style.background = T.sbHover; }}
          onMouseLeave={e => { if (active !== 'profile') e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#C94A5D,#9E1830)',
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
function Topbar({ activeNav, onNavigate, onToggleSidebar, onTogglePanel, panelOpen = false, panelMode = 'dark' }) {
  const [searchVal, setSearchVal] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const page = PAGE_TITLES[activeNav] || { title: activeNav, sub: '' };
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
  const panelButtonHover = isLightPanel
    ? { bg: '#F8ECDF', border: '#D9BDA0', color: '#6C4930' }
    : { bg: '#161C27', border: '#2A3342', color: '#F4F7FB' };

  return (
    <header style={{
      background: T.topbarBg, borderBottom: `1px solid ${T.border}`,
      padding: '0 20px 0 18px', minHeight: '64px',
      display: 'flex', alignItems: 'center', gap: '14px',
      flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'blur(16px)',
    }}>

      {/* 漢堡選單（sidebar toggle）*/}
      <button
        onClick={onToggleSidebar}
        title="切換側邊欄"
        style={{
          width: '36px', height: '36px', borderRadius: '10px',
          border: `1px solid ${T.border}`, background: T.cardBg,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.t2, flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = T.mutedBg; e.currentTarget.style.color = T.t1; }}
        onMouseLeave={e => { e.currentTarget.style.background = T.cardBg; e.currentTarget.style.color = T.t2; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* 頁面標題 */}
      <div style={{ flex: '0 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: T.t3, letterSpacing: '0.05em' }}>
          WORKSPACE
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: '800', color: T.t1, whiteSpace: 'nowrap' }}>
            {page.title}
          </span>
          {page.sub && (
            <span style={{ fontSize: '12px', color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {page.sub}
            </span>
          )}
        </div>
      </div>

      {/* 全域搜尋 */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: '560px', marginLeft: 'auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: T.cardBg,
          borderRadius: '11px', padding: '9px 14px',
          border: `1px solid ${searchFocus ? T.borderStrong : T.border}`,
          boxShadow: searchFocus ? T.focusRing : 'none',
          transition: 'all 0.15s ease',
        }}>
          <span style={{ color: T.t3, display: 'flex', alignItems: 'center' }}>{Ic.search}</span>
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            placeholder="搜尋任務、專案、表單或成員"
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontSize: '13.5px', color: T.t1,
              width: '100%', fontFamily: 'inherit',
            }}
          />
          {!searchVal && (
            <span style={{
              padding: '2px 7px',
              borderRadius: '999px',
              background: T.mutedBg,
              color: T.t3,
              fontSize: '11px',
              fontWeight: '700',
              flexShrink: 0,
            }}>
              /
            </span>
          )}
          {searchVal && (
            <button
              onClick={() => setSearchVal('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.t3, fontSize: '16px', lineHeight: 1, padding: 0 }}
            >×</button>
          )}
        </div>
      </div>

      {/* 右側操作列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={onTogglePanel}
          title="工作面板"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '36px',
            borderRadius: '10px',
            border: `1px solid ${panelButtonState.border}`,
            background: panelButtonState.bg,
            cursor: 'pointer',
            padding: '0 12px',
            fontSize: '12.5px',
            color: panelButtonState.color,
            fontWeight: '700',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = panelButtonHover.bg;
            e.currentTarget.style.color = panelButtonHover.color;
            e.currentTarget.style.borderColor = panelButtonHover.border;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = panelButtonState.bg;
            e.currentTarget.style.color = panelButtonState.color;
            e.currentTarget.style.borderColor = panelButtonState.border;
          }}
        >
          {panelIcon}
          工作面板
          <span style={{
            padding: '2px 7px',
            borderRadius: '999px',
            background: panelOpen
              ? isLightPanel ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.12)'
              : isLightPanel ? '#F6E8DB' : T.mutedBg,
            color: panelOpen
              ? isLightPanel ? '#7A5A47' : '#F4F7FB'
              : isLightPanel ? '#7A5A47' : T.t3,
            fontSize: '10px',
            fontWeight: '800',
            letterSpacing: '0.04em',
          }}>
            {panelLabel}
          </span>
        </button>

        <button
          title="說明"
          style={{
            height: '36px', borderRadius: '10px', border: `1px solid ${T.border}`,
            background: T.cardBg, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 12px',
            fontSize: '12.5px', color: T.t2, fontWeight: '700',
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.mutedBg}
          onMouseLeave={e => e.currentTarget.style.background = T.cardBg}
        >
          說明
        </button>

        <button
          onClick={() => onNavigate('inbox')}
          title="收件匣"
          style={{
            width: '36px', height: '36px', borderRadius: '10px',
            border: `1px solid ${activeNav === 'inbox' ? T.accent : T.border}`,
            background: activeNav === 'inbox' ? T.brandSoftStrong : T.cardBg,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: activeNav === 'inbox' ? T.accent : T.t2,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.brandSoftStrong; e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => {
            e.currentTarget.style.background = activeNav === 'inbox' ? T.brandSoftStrong : T.cardBg;
            e.currentTarget.style.color = activeNav === 'inbox' ? T.accent : T.t2;
          }}
        >
          {Ic.bell}
        </button>
      </div>
    </header>
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
          top: 0,
          right: 0,
          width: 'min(420px, 100vw)',
          height: '100vh',
          zIndex: 360,
          color: panelTheme.text,
          background: panelTheme.panelBg,
          borderLeft: `1px solid ${panelTheme.panelBorder}`,
          boxShadow: panelTheme.panelShadow,
          display: 'flex',
          flexDirection: 'column',
          animation: 'darkPanelSlideIn .18s ease',
        }}
      >
        <style>{`
          @keyframes darkPanelSlideIn {
            from { opacity: 0; transform: translateX(18px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>

        <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${panelTheme.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '999px', background: panelTheme.eyebrowBg, border: `1px solid ${panelTheme.eyebrowBorder}`, color: panelTheme.eyebrowText, fontSize: '11px', fontWeight: '800', letterSpacing: '0.08em' }}>
                {panelIcon}
                WORK PANEL
              </div>
              <div style={{ marginTop: '14px', fontSize: '28px', fontWeight: '900', letterSpacing: '-0.05em' }}>
                工作面板
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.7, color: panelTheme.textSoft }}>
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
                fontSize: '18px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: panelTheme.textMuted }}>
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
                fontSize: '12px',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800' }}>
                      {item.id === 'light' ? Ic.sun : Ic.moon}
                      {item.label}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '11px', color: active ? panelTheme.modeButtonActiveText : panelTheme.modeHintText }}>
                      {item.desc}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: panelTheme.textMuted }}>
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
              fontSize: '12px',
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
                <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.statLabel }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '10px', fontSize: '28px', fontWeight: '900', color: item.accent }}>
                  {item.value}
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.6, color: panelTheme.statHint }}>
                  {item.hint}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', borderRadius: '22px', padding: '18px', background: panelTheme.sectionBg, border: `1px solid ${panelTheme.sectionBorder}` }}>
            <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>快捷入口</div>
            <div style={{ marginTop: '6px', fontSize: '18px', fontWeight: '800' }}>快速處理今晚的工作節點</div>
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
                  <div style={{ fontSize: '13px', fontWeight: '800' }}>{item.label}</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: panelTheme.sectionHint }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>風險專案</div>
            {spotlightProjects.length === 0 ? (
              <div style={{
                borderRadius: '18px',
                padding: '18px',
                background: panelTheme.sectionMutedBg,
                border: `1px solid ${panelTheme.sectionBorder}`,
                fontSize: '13px',
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
                        <div style={{ fontSize: '13px', fontWeight: '800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.project_name ?? project.name}
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: panelTheme.sectionHint }}>
                          {overdue > 0 ? `${overdue} 項逾期` : '目前無逾期項目'}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '900', color: tone }}>
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
            <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', color: panelTheme.sectionLabel }}>行動建議</div>
            {insightCards.length === 0 ? (
              <div style={{
                borderRadius: '18px',
                padding: '18px',
                background: panelTheme.sectionMutedBg,
                border: `1px solid ${panelTheme.sectionBorder}`,
                fontSize: '13px',
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
                  <div style={{ fontSize: '13px', fontWeight: '800' }}>{item.title}</div>
                  <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.7, color: panelTheme.sectionBody }}>
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
// Asana 風格「首頁」
// ════════════════════════════════════════════════════════════
function HomePage({ currentUser, onNavigate, dashData }) {
  const { isDark } = useTheme();
  const { projects, workload, loading, error, refresh } = dashData;
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
    if (!currentUser?.companyId) return;
    setTasksLoading(true);
    fetch(`${API_BASE}/api/projects/tasks?companyId=${currentUser.companyId}`)
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
  }, [currentUser?.companyId]);

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
  const guideCards = [
    {
      icon: Ic.myTasks,
      title: '整理個人任務',
      desc: '以截止日與優先順序檢視今天該推進的工作。',
      nav: 'my-tasks',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(56, 33, 43, 0.68), rgba(29, 36, 48, 0.96))'
        : T.brandSoftStrong,
      accent: T.accent,
    },
    {
      icon: Ic.projects,
      title: '檢查專案狀態',
      desc: '查看專案健康度、進度與待處理風險。',
      nav: 'projects',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(61, 45, 18, 0.7), rgba(29, 36, 48, 0.96))'
        : 'color-mix(in srgb, var(--xc-warning-soft) 48%, var(--xc-surface))',
      accent: isDark ? T.warning : '#8A5D3B',
    },
    {
      icon: Ic.rules,
      title: '設定自動化規則',
      desc: '把固定流程交給系統處理，減少手動追蹤。',
      nav: 'rules',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(36, 42, 78, 0.68), rgba(29, 36, 48, 0.96))'
        : 'color-mix(in srgb, var(--xc-info-soft) 28%, var(--xc-surface))',
      accent: '#5B57D9',
    },
    {
      icon: Ic.goals,
      title: '追蹤年度目標',
      desc: '從目標頁確認專案輸出是否對齊階段成果。',
      nav: 'goals',
      tone: isDark
        ? 'linear-gradient(180deg, rgba(22, 53, 36, 0.68), rgba(29, 36, 48, 0.96))'
        : T.successSoft,
      accent: T.success,
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
  const guideIconShadow = isDark ? '0 10px 24px rgba(2, 6, 23, 0.28)' : '0 6px 14px rgba(52, 36, 30, 0.06)';
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
      padding: '32px 36px 40px',
      boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '18px',
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
              fontSize: '11px',
              fontWeight: '800',
              letterSpacing: '0.05em',
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.accent }} />
              PERSONAL WORKSPACE
            </div>

            <div style={{ marginTop: '18px', fontSize: '13px', color: T.t3 }}>{dateStr}</div>
            <h1 style={{ margin: '8px 0 0', fontSize: '30px', fontWeight: '900', color: T.t1, letterSpacing: '-0.04em' }}>
              {currentUser ? `${currentUser.name}，${greeting}` : greeting}
            </h1>
            <p style={{ margin: '14px 0 0', maxWidth: '42rem', fontSize: '14px', lineHeight: 1.8, color: T.t2 }}>
              首頁整理了今天最需要注意的任務、專案與協作狀態。先看即將到期的工作，再檢查進度異常的專案，日常節奏會更穩。
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '22px' }}>
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: T.accent,
                  color: '#fff',
                  fontSize: '13px',
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
                  fontSize: '13px',
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
              <div style={{ fontSize: '11px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>
                今日重點
              </div>
              <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
                <div style={{ paddingBottom: '12px', borderBottom: `1px solid ${T.div}` }}>
                  <div style={{ fontSize: '12px', color: T.t3 }}>下一個截止</div>
                  <div style={{ marginTop: '5px', fontSize: '15px', fontWeight: '800', color: T.t1 }}>
                    {nextDueTask ? (nextDueTask.title || nextDueTask.name) : '目前沒有本週截止項目'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: T.t2 }}>
                    {nextDueTask?.dueDate
                      ? `截止於 ${new Date(nextDueTask.dueDate).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}`
                      : '可以安排整理待辦或補充資料'}
                  </div>
                </div>
                <div style={{ paddingBottom: '12px', borderBottom: `1px solid ${T.div}` }}>
                  <div style={{ fontSize: '12px', color: T.t3 }}>逾期關注</div>
                  <div style={{ marginTop: '5px', fontSize: '22px', fontWeight: '900', color: tabTasks.overdue.length > 0 ? T.accent : T.t1 }}>
                    {tabTasks.overdue.length}
                  </div>
                  <div style={{ marginTop: '2px', fontSize: '12px', color: T.t2 }}>
                    {tabTasks.overdue.length > 0 ? '建議先確認責任人與阻塞原因' : '目前沒有逾期任務'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: T.t3 }}>同步狀態</div>
                  <div style={{ marginTop: '5px', fontSize: '14px', fontWeight: '700', color: T.t1 }}>
                    {loading ? '正在更新首頁資料' : error ? '資料更新時發生問題' : '首頁資料已同步'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: T.t2 }}>
                    {error ? '可稍後重新整理，或檢查後端服務狀態。' : '任務、專案與工作負載會在這裡彙整顯示。'}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
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
              <div style={{ fontSize: '11px', fontWeight: '800', color: T.t3, letterSpacing: '0.04em' }}>{item.label}</div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '28px', fontWeight: '900', color: item.accent, letterSpacing: '-0.05em' }}>{item.value}</span>
                <span style={{ fontSize: '13px', color: T.t2 }}>{item.unit}</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: T.t2, lineHeight: 1.7 }}>
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
            <div style={{ fontSize: '11px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>首頁配置</div>
            <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: '800', color: T.t1 }}>
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
                fontSize: '13px',
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
                fontSize: '13px',
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
                <div style={{ fontSize: '13px', fontWeight: '800', color: T.t1, marginBottom: '12px' }}>
                  顯示項目
                </div>
                {[
                  { key: 'tasks',    label: '我的任務面板' },
                  { key: 'projects', label: '專案概覽面板' },
                  { key: 'learn',    label: '常用入口面板' },
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
                    <span style={{ fontSize: '13px', color: T.t1 }}>{w.label}</span>
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
                    background: T.accent,
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 0',
                    fontSize: '13px',
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '18px',
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
                  <div style={{ fontSize: '11px', color: T.t3, fontWeight: '800', letterSpacing: '0.04em' }}>個人工作台</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: T.t1 }}>我的任務</div>
                </div>
              </div>
              <button
                onClick={() => onNavigate('my-tasks')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent2, fontSize: '12px', fontWeight: '700', padding: 0 }}
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
                      fontSize: '12.5px',
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
                        fontSize: '10.5px',
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
                <div style={{ padding: '28px 20px', textAlign: 'center', color: T.t3, fontSize: '13px' }}>正在整理任務資料…</div>
              ) : displayTasks.length === 0 ? (
                <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: T.t1 }}>
                    {myTasksTab === 'upcoming' ? '目前沒有本週截止項目' :
                     myTasksTab === 'overdue' ? '沒有逾期任務' : '最近七天尚未完成任務'}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: T.t2, lineHeight: 1.7 }}>
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
                        fontSize: '10px',
                      }}>
                        {isDone ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px',
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
                          <span style={{ fontSize: '11px', color: T.t3 }}>
                            {task.project?.name || '未指定專案'}
                          </span>
                          {task.dueDate && (
                            <span style={{
                              fontSize: '11px',
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
                  <div style={{ fontSize: '11px', color: T.t3, fontWeight: '800', letterSpacing: '0.04em' }}>專案概覽</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: T.t1 }}>重點專案</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => refresh()}
                  title="更新專案資料"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.t2, fontSize: '12px', fontWeight: '700', padding: 0 }}
                >
                  更新資料
                </button>
                <button
                  onClick={() => onNavigate('projects')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent2, fontSize: '12px', fontWeight: '700', padding: 0 }}
                >
                  查看全部
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 0 8px', minHeight: '220px', maxHeight: '360px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: T.t3, fontSize: '13px' }}>正在同步專案資料…</div>
              ) : recentProjects.length === 0 ? (
                <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: T.t1 }}>目前沒有可顯示的專案</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: T.t2 }}>建立專案後，首頁會自動整理進度與風險。</div>
                </div>
              ) : (
                recentProjects.map((p, i) => {
                  const colors = ['#B4233C', '#2C6ECB', '#2F855A', '#A5662B', '#5B57D9', '#18776B'];
                  const color = colors[i % colors.length];
                  const overdue = p.overdue_tasks ?? p.taskOverdue ?? 0;
                  const total   = p.total_tasks ?? p.taskTotal ?? 0;
                  const done    = p.done_tasks ?? p.taskDone ?? 0;
                  const pct = Math.round(parseFloat(p.completion_pct ?? p.completion ?? 0));
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
                        <div style={{ fontSize: '13.5px', fontWeight: '700', color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.project_name ?? p.name}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '11.5px', color: overdue > 0 ? T.accent : T.t2, fontWeight: overdue > 0 ? '700' : '600' }}>
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
                            <span style={{ fontSize: '11px', fontWeight: '800', color: overdue > 0 ? T.accent : color }}>{pct}%</span>
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

        <div style={{
          ...cardShell,
          padding: '20px',
          display: homeWidgets.learn ? 'block' : 'none',
        }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>常用入口</div>
            <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: '800', color: T.t1 }}>你可能接下來會用到</div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
          }}>
            {guideCards.map((card) => (
              <button
                key={card.title}
                onClick={() => onNavigate(card.nav)}
                style={{
                  padding: '18px',
                  borderRadius: '14px',
                  border: `1px solid ${T.border}`,
                  background: card.tone,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: T.cardBg,
                  color: card.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: guideIconShadow,
                }}>
                  {card.icon}
                </div>
                <div style={{ marginTop: '14px', fontSize: '14px', fontWeight: '800', color: T.t1 }}>
                  {card.title}
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.7, color: T.t2 }}>
                  {card.desc}
                </div>
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
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', color: T.t2, fontSize: '13.5px', marginBottom: '22px', padding: 0, fontFamily: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.color = T.t1}
        onMouseOut={e => e.currentTarget.style.color = T.t2}
      >
        {Ic.arrowLeft} 返回首頁
      </button>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, padding: '30px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '22px', boxShadow: T.shadow }}>
        <div style={{ width: '70px', height: '70px', flexShrink: 0, borderRadius: '50%', background: 'linear-gradient(135deg,#C94A5D,#9E1830)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '26px', boxShadow: '0 10px 18px rgba(180, 35, 60, 0.18)' }}>
          {currentUser ? currentUser.name.slice(0, 1) : '?'}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '800', color: T.t3, letterSpacing: '0.05em' }}>帳戶資訊</div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: T.t1, marginTop: '6px' }}>{currentUser?.name ?? '—'}</div>
          <div style={{ fontSize: '13.5px', color: T.t2, marginTop: '4px' }}>{ROLE_LABEL[currentUser?.role] ?? '—'} · {currentUser?.company?.name ?? '—'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '4px 10px', background: statusBadgeBg, color: T.info, borderRadius: '999px', fontSize: '11.5px', fontWeight: '700' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: T.info, display: 'inline-block' }} />
            帳戶已啟用
          </div>
        </div>
      </div>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, overflow: 'hidden', marginBottom: '16px', boxShadow: T.shadow }}>
        {INFO_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < INFO_ROWS.length - 1 ? `1px solid ${T.div}` : 'none' }}>
            <div style={{ width: '96px', fontSize: '12.5px', color: T.t3, flexShrink: 0 }}>{row.label}</div>
            <div style={{ fontSize: '13px', color: T.t1, fontWeight: '600' }}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: T.cardBg, borderRadius: '18px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: T.shadow }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${T.div}`, fontSize: '13px', fontWeight: '800', color: T.t1 }}>帳戶設定</div>
        {[
          { label: '修改密碼', desc: '定期更換密碼以保護帳戶安全', onClick: null },
          { label: '通知偏好', desc: '設定 Email / App 通知類型', onClick: null },
          { label: '語言與時區', desc: '繁體中文 / Asia/Taipei', onClick: null },
          { label: '登出', desc: '結束目前登入階段', danger: true, onClick: onLogout },
        ].map((item, i, arr) => (
          <button key={item.label}
            onClick={item.onClick || undefined}
            style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${T.div}` : 'none', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            onMouseOver={e => e.currentTarget.style.background = item.danger ? dangerHoverBg : hoverBg}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: item.danger ? T.accent : T.t1 }}>{item.label}</div>
              <div style={{ fontSize: '11.5px', color: T.t3, marginTop: '2px' }}>{item.desc}</div>
            </div>
            <span style={{ color: T.t3, fontSize: '18px' }}>›</span>
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

  const [activeNav,       setActiveNav]       = useState(readHashNav);
  const [settingsState,   setSettingsState]   = useState(null);
  const [inboxCount,      setInboxCount]      = useState(0);
  const [showDarkPanel,   setShowDarkPanel]   = useState(false);
  const [sbCollapsed,     setSbCollapsed]     = useState(() => {
    try { return localStorage.getItem('xcloud-sb-collapsed') === '1'; } catch { return false; }
  });
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
    setSbCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('xcloud-sb-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
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
          if (settings.app_desktop) {
            dispatchDesktopNotification(item);
          }
          if (settings.app_sound) {
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
    if (activeNav === 'inbox')         return <InboxPage />;
    if (activeNav === 'my-tasks')      return <MyTasksWorkspacePage />;
    if (activeNav === 'projects')      return <ProjectsPage />;
    if (activeNav === 'tasks')         return <TaskKanbanPage />;
    if (activeNav === 'gantt')         return <GanttPage />;
    if (activeNav === 'workflow')      return <WorkflowDiagramPage onNavigate={navigate} />;
    if (activeNav === 'rules')         return <RulesPage />;
    if (activeNav === 'time')          return <TimeTrackingPage />;
    if (activeNav === 'goals')         return <GoalsPage />;
    if (activeNav === 'portfolios')    return <PortfoliosPage onNavigate={navigate} />;
    if (activeNav === 'workload')      return <WorkloadPage onNavigate={navigate} />;
    if (activeNav === 'reports')       return <ReportsPage />;
    if (activeNav === 'team')          return <TeamPage />;
    if (activeNav === 'settings')      return <SettingsPage initialTab={settingsState?.initialTab} callbackState={settingsState} />;
    if (activeNav === 'ai-center')     return <AiDecisionCenter />;
    if (activeNav === 'mcp-console')   return <McpConsolePage />;
    if (activeNav === 'forms')         return <FormsPage />;
    if (activeNav === 'custom-fields') return <CustomFieldsPage onNavigate={navigate} />;
    if (activeNav === 'profile')       return <ProfilePage onBack={() => navigate('home')} currentUser={currentUser} onLogout={logout} />;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '14px' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: T.brandSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>🚧</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: T.t1 }}>開發中</div>
        <div style={{ fontSize: '13.5px', color: T.t3 }}>此功能即將上線，敬請期待</div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.pageBg, color: isDark ? T.t1 : undefined }}>
      <Sidebar
        active={activeNav}
        onChange={navigate}
        currentUser={currentUser}
        isCollapsed={sbCollapsed}
        onToggleCollapse={toggleSidebar}
        authFetch={authFetch}
        inboxCount={inboxCount}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minWidth: 0 }}>
        <Topbar
          activeNav={activeNav}
          onNavigate={navigate}
          onToggleSidebar={toggleSidebar}
          onTogglePanel={() => setShowDarkPanel((current) => !current)}
          panelOpen={showDarkPanel}
          panelMode={themeMode}
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

        <main style={{ flex: 1, minWidth: 0 }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
