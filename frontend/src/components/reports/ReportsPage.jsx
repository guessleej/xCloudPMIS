/**
 * ReportsPage — 報表匯出頁面
 *
 * 版面配置：
 *   ┌───────────────────────────────────────────────────────┐
 *   │ 頁面標題列                                              │
 *   ├──────────────────────┬────────────────────────────────┤
 *   │ 左側：報表類型選單     │ 右側主內容區                    │
 *   │  ○ 專案進度報表       │  ┌─ 篩選列 ─────────────────┐  │
 *   │  ○ 任務統計報表       │  │  下拉 / 日期 / 群組選項   │  │
 *   │  ○ 工時統計報表       │  └───────────────────────────┘  │
 *   │  ○ 里程碑報表         │  ┌─ 摘要卡片 ────────────────┐  │
 *   │                      │  └───────────────────────────┘  │
 *   │                      │  ┌─ 資料表格 ────────────────┐  │
 *   │                      │  │  … 分頁 …                 │  │
 *   │                      │  └───────────────────────────┘  │
 *   └──────────────────────┴────────────────────────────────┘
 */

import { useState, useEffect, useCallback } from 'react';

// ── 常數 ─────────────────────────────────────────────────────
const API_BASE   = 'http://localhost:3010';
const COMPANY_ID = 2;
const PAGE_SIZE  = 15; // 每頁顯示筆數

// ── 報表類型定義 ──────────────────────────────────────────────
const REPORT_TYPES = [
  {
    id:          'projects',
    icon:        '🏗️',
    label:       '專案進度報表',
    description: '各專案的任務完成率、工時、里程碑達成狀況',
    color:       '#3b82f6',
  },
  {
    id:          'tasks',
    icon:        '✅',
    label:       '任務統計報表',
    description: '依狀態、優先度分析所有任務',
    color:       '#8b5cf6',
  },
  {
    id:          'timelog',
    icon:        '⏱️',
    label:       '工時統計報表',
    description: '工時記錄依專案、成員或任務彙總統計',
    color:       '#10b981',
  },
  {
    id:          'milestones',
    icon:        '🎯',
    label:       '里程碑報表',
    description: '各專案里程碑達成情況與延誤風險',
    color:       '#f59e0b',
  },
];

// ── 工具函式 ─────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 狀態/優先度徽章顏色 ──────────────────────────────────────
const STATUS_BADGE = {
  '待處理': { bg: '#f3f4f6', text: '#6b7280' },
  '進行中': { bg: '#dbeafe', text: '#1d4ed8' },
  '審查中': { bg: '#fef3c7', text: '#d97706' },
  '已完成': { bg: '#d1fae5', text: '#065f46' },
  '規劃中': { bg: '#ede9fe', text: '#7c3aed' },
  '暫停':   { bg: '#fee2e2', text: '#dc2626' },
  '已取消': { bg: '#f3f4f6', text: '#9ca3af' },
};
const PRIORITY_BADGE = {
  '緊急': { bg: '#fee2e2', text: '#dc2626' },
  '高':   { bg: '#ffedd5', text: '#c2410c' },
  '中':   { bg: '#fef9c3', text: '#a16207' },
  '低':   { bg: '#f3f4f6', text: '#6b7280' },
};
const MILESTONE_BADGE = {
  '已達成':   { bg: '#d1fae5', text: '#065f46' },
  '已延誤':   { bg: '#fee2e2', text: '#dc2626' },
  '即將到期': { bg: '#fef3c7', text: '#d97706' },
  '進行中':   { bg: '#dbeafe', text: '#1d4ed8' },
};

// ════════════════════════════════════════════════════════════
// 摘要卡片列
// ════════════════════════════════════════════════════════════
function SummaryCards({ type, summary }) {
  if (!summary) return null;

  let cards = [];

  if (type === 'projects') {
    cards = [
      { icon: '📁', label: '專案總數',   value: summary.totalProjects },
      { icon: '🟢', label: '進行中專案', value: summary.activeProjects },
      { icon: '📋', label: '任務總數',   value: summary.totalTasks },
      { icon: '✅', label: '已完成任務', value: summary.doneTasks },
      { icon: '📊', label: '整體完成率', value: `${summary.overallRate}%` },
    ];
  } else if (type === 'tasks') {
    cards = [
      { icon: '📋', label: '任務總數', value: summary.total },
      { icon: '⬜', label: '待處理', value: summary.byStatus.todo },
      { icon: '🔵', label: '進行中', value: summary.byStatus.in_progress },
      { icon: '🟡', label: '審查中', value: summary.byStatus.review },
      { icon: '🟢', label: '已完成', value: summary.byStatus.done },
      { icon: '🔴', label: '緊急任務', value: summary.byPriority.urgent },
    ];
  } else if (type === 'timelog') {
    cards = [
      { icon: '📝', label: '記錄筆數', value: summary.totalEntries },
      { icon: '⏱️', label: '總工時',   value: summary.totalDisplay },
      { icon: '📅', label: '統計區間', value: `${summary.rangeStart} ~ ${summary.rangeEnd}` },
    ];
  } else if (type === 'milestones') {
    cards = [
      { icon: '🎯', label: '里程碑總數', value: summary.total },
      { icon: '✅', label: '已達成',     value: summary.achieved },
      { icon: '🔴', label: '已延誤',     value: summary.late },
      { icon: '⏳', label: '即將到期（30天內）', value: summary.upcoming },
    ];
  }

  return (
    <div style={{
      display:       'flex',
      gap:           '10px',
      flexWrap:      'wrap',
      marginBottom:  '16px',
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background:   'white',
          border:       '1px solid #e5e7eb',
          borderRadius: '10px',
          padding:      '14px 18px',
          minWidth:     '110px',
          flex:         1,
          boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
            {c.icon} {c.label}
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 資料表格
// ════════════════════════════════════════════════════════════
function DataTable({ columns, rows, currentPage, onPageChange }) {
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows   = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const renderCell = (col, row) => {
    const val = row[col.key];

    if (col.type === 'percent') {
      const pct = Number(val) || 0;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px',
            minWidth: '60px',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: pct >= 80 ? '#10b981' : pct >= 50 ? '#3b82f6' : '#f59e0b',
              borderRadius: '3px',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: '12px', color: '#374151', minWidth: '32px' }}>
            {pct}%
          </span>
        </div>
      );
    }

    if (col.type === 'status') {
      const badge = STATUS_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '500',
        }}>{val}</span>
      );
    }

    if (col.type === 'priority') {
      const badge = PRIORITY_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '600',
        }}>{val}</span>
      );
    }

    if (col.type === 'milestone-status') {
      const badge = MILESTONE_BADGE[val] || { bg: '#f3f4f6', text: '#6b7280' };
      return (
        <span style={{
          background: badge.bg, color: badge.text,
          padding: '2px 8px', borderRadius: '12px',
          fontSize: '12px', fontWeight: '500',
        }}>{val}</span>
      );
    }

    if (col.type === 'milestone-color') {
      const colorMap = { '紅（高風險）': '#dc2626', '黃（需注意）': '#d97706', '綠（正常）': '#16a34a' };
      const color = colorMap[val] || '#6b7280';
      return (
        <span style={{ color, fontWeight: '500', fontSize: '13px' }}>
          ● {val}
        </span>
      );
    }

    if (col.type === 'number') {
      return (
        <span style={{ fontFamily: 'tabular-nums', color: '#374151' }}>
          {val ?? '—'}
        </span>
      );
    }

    return (
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'block', maxWidth: '280px',
        color: '#374151',
      }}>
        {val || '—'}
      </span>
    );
  };

  return (
    <div>
      {/* 表格 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width:           '100%',
          borderCollapse:  'collapse',
          fontSize:        '13px',
        }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding:   '10px 14px',
                  textAlign: col.type === 'number' || col.type === 'percent' ? 'center' : 'left',
                  fontWeight: '600',
                  color:     '#6b7280',
                  fontSize:  '12px',
                  whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{
                  padding: '40px', textAlign: 'center', color: '#9ca3af',
                }}>
                  無資料
                </td>
              </tr>
            ) : pageRows.map((row, i) => (
              <tr key={row.id ?? i} style={{
                borderBottom: '1px solid #f3f4f6',
                background:   i % 2 === 0 ? 'white' : '#fafafa',
              }}
                onMouseOver={e => e.currentTarget.style.background = '#eff6ff'}
                onMouseOut={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}
              >
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding:   '10px 14px',
                    textAlign: col.type === 'number' || col.type === 'percent' ? 'center' : 'left',
                  }}>
                    {renderCell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '12px 14px',
          borderTop:      '1px solid #e5e7eb',
          background:     '#f8fafc',
        }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            共 {rows.length} 筆，第 {currentPage}/{totalPages} 頁
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <PaginBtn
              label="«"
              disabled={currentPage === 1}
              onClick={() => onPageChange(1)}
            />
            <PaginBtn
              label="‹"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
            />
            {/* 頁碼（最多顯示 5 個） */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <PaginBtn
                  key={page}
                  label={String(page)}
                  active={page === currentPage}
                  onClick={() => onPageChange(page)}
                />
              );
            })}
            <PaginBtn
              label="›"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            />
            <PaginBtn
              label="»"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(totalPages)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PaginBtn({ label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background:   active ? '#3b82f6' : disabled ? '#f9fafb' : 'white',
        color:        active ? 'white'   : disabled ? '#d1d5db' : '#374151',
        border:       '1px solid #e5e7eb',
        borderRadius: '6px',
        padding:      '4px 10px',
        fontSize:     '12px',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontWeight:   active ? '600' : '400',
      }}
    >
      {label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════
// 篩選列
// ════════════════════════════════════════════════════════════
function FilterBar({ type, filters, projects, onChange, onGenerate, loading }) {
  const today   = todayStr();
  const ago30   = daysAgoStr(29);

  return (
    <div style={{
      display:      'flex',
      flexWrap:     'wrap',
      gap:          '10px',
      alignItems:   'flex-end',
      padding:      '14px 16px',
      background:   '#f8fafc',
      borderBottom: '1px solid #e5e7eb',
    }}>
      {/* 依類型顯示不同篩選選項 */}

      {/* 任務報表：專案篩選 + 狀態篩選 */}
      {type === 'tasks' && (
        <>
          <FilterItem label="所屬專案">
            <select
              value={filters.projectId || ''}
              onChange={e => onChange('projectId', e.target.value || null)}
              style={filterSelectStyle}
            >
              <option value="">全部專案</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FilterItem>
          <FilterItem label="任務狀態">
            <select
              value={filters.status || ''}
              onChange={e => onChange('status', e.target.value || null)}
              style={filterSelectStyle}
            >
              <option value="">全部狀態</option>
              <option value="todo">待處理</option>
              <option value="in_progress">進行中</option>
              <option value="review">審查中</option>
              <option value="done">已完成</option>
            </select>
          </FilterItem>
        </>
      )}

      {/* 工時報表：日期範圍 + 群組方式 */}
      {type === 'timelog' && (
        <>
          <FilterItem label="開始日期">
            <input
              type="date"
              value={filters.startDate || ago30}
              onChange={e => onChange('startDate', e.target.value)}
              style={filterInputStyle}
            />
          </FilterItem>
          <FilterItem label="結束日期">
            <input
              type="date"
              value={filters.endDate || today}
              max={today}
              onChange={e => onChange('endDate', e.target.value)}
              style={filterInputStyle}
            />
          </FilterItem>
          <FilterItem label="群組方式">
            <select
              value={filters.groupBy || 'project'}
              onChange={e => onChange('groupBy', e.target.value)}
              style={filterSelectStyle}
            >
              <option value="project">依專案</option>
              <option value="user">依成員</option>
              <option value="task">依任務</option>
            </select>
          </FilterItem>
        </>
      )}

      {/* 生成按鈕 */}
      <button
        onClick={onGenerate}
        disabled={loading}
        style={{
          background:   loading ? '#93c5fd' : '#3b82f6',
          color:        'white',
          border:       'none',
          borderRadius: '8px',
          padding:      '8px 18px',
          fontSize:     '13px',
          fontWeight:   '600',
          cursor:       loading ? 'not-allowed' : 'pointer',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
        }}
      >
        {loading ? '⏳ 載入中...' : '🔍 產生報表'}
      </button>
    </div>
  );
}

function FilterItem({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', fontWeight: '500' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const filterSelectStyle = {
  padding: '7px 10px', border: '1px solid #d1d5db',
  borderRadius: '7px', fontSize: '13px',
  background: 'white', color: '#374151', cursor: 'pointer',
  minWidth: '130px',
};
const filterInputStyle = {
  ...filterSelectStyle,
  cursor: 'text',
};

// ════════════════════════════════════════════════════════════
// 主元件：ReportsPage
// ════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const [activeType,  setActiveType]  = useState('projects');
  const [reportData,  setReportData]  = useState(null);  // { type, title, columns, rows, summary }
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [page,        setPage]        = useState(1);
  const [projects,    setProjects]    = useState([]);
  const [filters,     setFilters]     = useState({
    projectId: null,
    status:    null,
    startDate: daysAgoStr(29),
    endDate:   todayStr(),
    groupBy:   'project',
  });
  const [exporting,   setExporting]   = useState(false);

  // 載入篩選選項（專案清單）
  useEffect(() => {
    fetch(`${API_BASE}/api/reports/filter-options?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  // 切換報表類型時自動產生報表
  useEffect(() => {
    generateReport(activeType);
    setPage(1);
  }, [activeType]);

  // 更新篩選條件
  const updateFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  // 產生報表
  const generateReport = useCallback(async (type = activeType) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      let url = `${API_BASE}/api/reports/${type}?companyId=${COMPANY_ID}`;
      if (type === 'tasks') {
        if (filters.projectId) url += `&projectId=${filters.projectId}`;
        if (filters.status)    url += `&status=${filters.status}`;
      }
      if (type === 'timelog') {
        url += `&startDate=${filters.startDate}&endDate=${filters.endDate}&groupBy=${filters.groupBy}`;
      }

      const res  = await fetch(url);
      if (!res.ok) throw new Error('報表產生失敗');
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeType, filters]);

  // 匯出 CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      let url = `${API_BASE}/api/reports/${activeType}?companyId=${COMPANY_ID}&format=csv`;
      if (activeType === 'tasks') {
        if (filters.projectId) url += `&projectId=${filters.projectId}`;
        if (filters.status)    url += `&status=${filters.status}`;
      }
      if (activeType === 'timelog') {
        url += `&startDate=${filters.startDate}&endDate=${filters.endDate}&groupBy=${filters.groupBy}`;
      }

      // 使用 fetch + Blob 觸發下載（避免直接開新視窗被攔截）
      const res = await fetch(url);
      if (!res.ok) throw new Error('匯出失敗');

      const blob     = await res.blob();
      const fileName = decodeURIComponent(
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'report.csv'
      );
      const blobUrl  = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = blobUrl;
      a.download     = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('匯出失敗：' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const activeReportType = REPORT_TYPES.find(r => r.id === activeType);
  const showFilters = activeType === 'tasks' || activeType === 'timelog';

  // ════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>

      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{
        background:   'white',
        borderBottom: '1px solid #e5e7eb',
        padding:      '14px 24px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        flexShrink:   0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>
            📄 報表匯出
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#9ca3af' }}>
            產生各類分析報表，支援 CSV 格式下載
          </p>
        </div>
        {/* 匯出按鈕 */}
        {reportData && (
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            style={{
              background:   exporting ? '#d1fae5' : '#10b981',
              color:        'white',
              border:       'none',
              borderRadius: '8px',
              padding:      '8px 18px',
              fontSize:     '13px',
              fontWeight:   '600',
              cursor:       exporting ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              boxShadow:    '0 2px 8px rgba(16,185,129,0.3)',
            }}
          >
            {exporting ? '⏳ 匯出中...' : '⬇ 匯出 CSV'}
          </button>
        )}
      </div>

      {/* ── 主要區塊 ───────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 左側：報表類型選單 */}
        <div style={{
          width:        '220px',
          flexShrink:   0,
          background:   'white',
          borderRight:  '1px solid #e5e7eb',
          padding:      '16px 12px',
          overflowY:    'auto',
        }}>
          <div style={{
            fontSize:     '11px',
            fontWeight:   '700',
            color:        '#9ca3af',
            letterSpacing: '0.08em',
            marginBottom: '8px',
            paddingLeft:  '8px',
          }}>
            報表類型
          </div>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setActiveType(rt.id)}
              style={{
                width:        '100%',
                textAlign:    'left',
                border:       'none',
                background:   activeType === rt.id ? `${rt.color}12` : 'transparent',
                borderRadius: '8px',
                padding:      '10px 10px',
                marginBottom: '4px',
                cursor:       'pointer',
                borderLeft:   activeType === rt.id ? `3px solid ${rt.color}` : '3px solid transparent',
                transition:   'all 0.15s',
              }}
            >
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '8px',
                fontSize:   '14px',
                fontWeight: activeType === rt.id ? '600' : '400',
                color:      activeType === rt.id ? rt.color : '#374151',
              }}>
                <span style={{ fontSize: '16px' }}>{rt.icon}</span>
                <span style={{ lineHeight: 1.3 }}>{rt.label}</span>
              </div>
              {activeType === rt.id && (
                <div style={{
                  fontSize:   '11px',
                  color:      '#9ca3af',
                  marginTop:  '4px',
                  paddingLeft: '24px',
                  lineHeight: 1.4,
                }}>
                  {rt.description}
                </div>
              )}
            </button>
          ))}

          {/* 格式說明 */}
          <div style={{
            marginTop:    '24px',
            padding:      '12px',
            background:   '#f0fdf4',
            borderRadius: '8px',
            fontSize:     '11px',
            color:        '#16a34a',
            lineHeight:   1.6,
          }}>
            <div style={{ fontWeight: '700', marginBottom: '4px' }}>📥 匯出格式</div>
            <div>• CSV（Excel 可直接開啟）</div>
            <div>• UTF-8 + BOM 編碼</div>
            <div>• 支援中文欄位名稱</div>
          </div>
        </div>

        {/* 右側：報表內容 */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* 篩選列 */}
          {showFilters && (
            <FilterBar
              type={activeType}
              filters={filters}
              projects={projects}
              onChange={updateFilter}
              onGenerate={() => generateReport(activeType)}
              loading={loading}
            />
          )}

          {/* 報表內容區 */}
          <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto' }}>

            {/* 載入中 */}
            {loading && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '16px',
              }}>
                <div style={{ fontSize: '40px' }}>⏳</div>
                <div style={{ color: '#9ca3af', fontSize: '15px' }}>報表產生中...</div>
              </div>
            )}

            {/* 錯誤 */}
            {!loading && error && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '12px',
              }}>
                <div style={{ fontSize: '40px' }}>😢</div>
                <div style={{ color: '#dc2626' }}>{error}</div>
                <button
                  onClick={() => generateReport(activeType)}
                  style={{
                    background: '#3b82f6', color: 'white', border: 'none',
                    borderRadius: '8px', padding: '8px 18px', cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  重試
                </button>
              </div>
            )}

            {/* 報表資料 */}
            {!loading && !error && reportData && (
              <>
                {/* 報表標題 + 資訊列 */}
                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  marginBottom:   '14px',
                }}>
                  <div>
                    <h2 style={{
                      margin: 0, fontSize: '16px', fontWeight: '700', color: '#111827',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                      <span>{activeReportType?.icon}</span>
                      {reportData.title}
                    </h2>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      產生時間：{new Date(reportData.generatedAt).toLocaleString('zh-TW')}
                      　共 {reportData.rows.length} 筆資料
                    </div>
                  </div>
                </div>

                {/* 摘要卡片 */}
                <SummaryCards type={reportData.type} summary={reportData.summary} />

                {/* 工時報表的群組說明 */}
                {reportData.type === 'timelog' && (
                  <div style={{
                    display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap',
                  }}>
                    {['依專案', '依成員', '依任務'].map((label, i) => {
                      const val = ['project', 'user', 'task'][i];
                      return (
                        <button
                          key={val}
                          onClick={() => {
                            updateFilter('groupBy', val);
                            // 立即重新查詢
                            setTimeout(() => generateReport(activeType), 50);
                          }}
                          style={{
                            background:   filters.groupBy === val ? '#3b82f6' : 'white',
                            color:        filters.groupBy === val ? 'white'   : '#6b7280',
                            border:       '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding:      '5px 14px',
                            fontSize:     '12px',
                            cursor:       'pointer',
                            fontWeight:   filters.groupBy === val ? '600' : '400',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 資料表格 */}
                <div style={{
                  background:   'white',
                  border:       '1px solid #e5e7eb',
                  borderRadius: '10px',
                  overflow:     'hidden',
                  boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <DataTable
                    columns={reportData.columns}
                    rows={reportData.rows}
                    currentPage={page}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}

            {/* 初始未選擇時 */}
            {!loading && !error && !reportData && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '300px', flexDirection: 'column', gap: '12px',
              }}>
                <div style={{ fontSize: '40px' }}>📊</div>
                <div style={{ color: '#9ca3af' }}>選擇左側報表類型開始分析</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
