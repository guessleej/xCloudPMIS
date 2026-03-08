/**
 * Dashboard — 主管決策儀表板主頁
 *
 * 版面配置：
 *   ┌─────────────────────────────────────────┐
 *   │  側邊欄（Sidebar）  │  主要內容區         │
 *   │  - 導覽選單         │  - 頂部數字卡片      │
 *   │  - 用戶資訊         │  - 圓餅圖 + 專案列表 │
 *   │                     │  - 熱力圖           │
 *   │                     │  - 行動建議         │
 *   └─────────────────────────────────────────┘
 */

import { useState } from 'react';
import { useDashboard } from './useDashboard';
import SummaryCards       from './SummaryCards';
import HealthPieChart     from './HealthPieChart';
import ProjectHealthList  from './ProjectHealthList';
import WorkloadHeatmap    from './WorkloadHeatmap';
import ActionableInsights from './ActionableInsights';

// ── 側邊欄導覽項目 ──────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',    icon: '📊', label: '儀表板' },
  { id: 'projects',     icon: '📁', label: '專案管理' },
  { id: 'tasks',        icon: '✅', label: '任務看板' },
  { id: 'gantt',        icon: '📅', label: '甘特圖' },
  { id: 'time',         icon: '⏱️', label: '工時記錄' },
  { id: 'reports',      icon: '📄', label: '報表匯出' },
  { id: 'team',         icon: '👥', label: '團隊管理' },
  { id: 'settings',     icon: '⚙️', label: '系統設定' },
];

// ── 側邊欄元件 ──────────────────────────────────────────────
function Sidebar({ active, onChange }) {
  return (
    <aside style={{
      width: '220px', flexShrink: 0,
      background: '#1e293b', // 深藍色背景，企業感
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo 區 */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ fontWeight: '800', fontSize: '18px', color: 'white', letterSpacing: '-0.5px' }}>
          ☁️ xCloudPMIS
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
          企業專案管理系統
        </div>
      </div>

      {/* 導覽選單 */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              width:        '100%',
              display:      'flex',
              alignItems:   'center',
              gap:          '10px',
              padding:      '10px 12px',
              borderRadius: '8px',
              border:       'none',
              background:   active === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
              color:        active === item.id ? 'white' : '#94a3b8',
              fontSize:     '14px',
              fontWeight:   active === item.id ? '600' : '400',
              cursor:       'pointer',
              textAlign:    'left',
              marginBottom: '2px',
              transition:   'all 0.15s',
            }}
            onMouseOver={e => {
              if (active !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseOut={e => {
              if (active !== item.id) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* 用戶資訊（底部） */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '14px',
          }}>
            陳
          </div>
          <div>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: '600' }}>陳志明</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>系統管理員</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── 頂部 Header ─────────────────────────────────────────────
function Header({ onRefresh, loading }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <header style={{
      padding:         '16px 24px',
      background:      'white',
      borderBottom:    '1px solid #e5e7eb',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>
          主管決策儀表板
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#9ca3af' }}>
          {dateStr}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          background:   loading ? '#e5e7eb' : '#3b82f6',
          color:        loading ? '#9ca3af' : 'white',
          border:       'none',
          borderRadius: '8px',
          padding:      '8px 16px',
          fontSize:     '13px',
          fontWeight:   '600',
          cursor:       loading ? 'not-allowed' : 'pointer',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
        }}
      >
        {loading ? '⏳ 載入中...' : '🔄 重新整理'}
      </button>
    </header>
  );
}

// ── 卡片容器（白底陰影的格子） ───────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background:   'white',
      border:       '1px solid #e5e7eb',
      borderRadius: '12px',
      padding:      '20px',
      boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
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
      color: '#9ca3af',
    }}>
      <div style={{ fontSize: '40px', animation: 'spin 1s linear infinite' }}>⏳</div>
      <div style={{ fontSize: '14px' }}>資料載入中，請稍候...</div>
    </div>
  );
}

// ── 錯誤畫面 ───────────────────────────────────────────────
function ErrorScreen({ error, onRetry }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '400px', flexDirection: 'column', gap: '16px',
    }}>
      <div style={{ fontSize: '40px' }}>😢</div>
      <div style={{ fontWeight: '600', color: '#374151' }}>載入失敗</div>
      <div style={{ fontSize: '13px', color: '#9ca3af', maxWidth: '300px', textAlign: 'center' }}>
        {error}
      </div>
      <button
        onClick={onRetry}
        style={{
          background: '#3b82f6', color: 'white',
          border: 'none', borderRadius: '8px',
          padding: '8px 20px', fontSize: '14px', cursor: 'pointer',
        }}
      >
        重試
      </button>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// 主元件：Dashboard
// ════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [activeNav,    setActiveNav]    = useState('dashboard');
  const [healthFilter, setHealthFilter] = useState(null);
  const { summary, projects, workload, insights, loading, error, refresh } = useDashboard();

  // 篩選後的專案列表（圓餅圖點擊後篩選）
  const filteredProjects = healthFilter
    ? projects.filter(p => p.health_status === healthFilter)
    : projects;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* 側邊欄 */}
      <Sidebar active={activeNav} onChange={setActiveNav} />

      {/* 主要內容區 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <Header onRefresh={refresh} loading={loading} />

        <main style={{ flex: 1, padding: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>

          {loading ? (
            <LoadingScreen />
          ) : error ? (
            <ErrorScreen error={error} onRetry={refresh} />
          ) : (
            <>
              {/* 頂部關鍵數字卡片 */}
              <SummaryCards summary={summary} />

              {/* 中間區域：圓餅圖 + 行動建議（左右並排）*/}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}>
                <Card>
                  <HealthPieChart summary={summary} onFilter={setHealthFilter} />
                </Card>
                <Card>
                  <ActionableInsights insights={insights} />
                </Card>
              </div>

              {/* 專案列表（若有篩選顯示篩選標題）*/}
              <Card style={{ marginBottom: '16px' }}>
                {healthFilter && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '12px', padding: '8px 12px',
                    background: '#fef9c3', borderRadius: '8px',
                    fontSize: '13px', color: '#854d0e',
                  }}>
                    <span>
                      目前篩選：
                      {healthFilter === 'red' ? '🔴 危險專案' : healthFilter === 'yellow' ? '🟡 需關注' : '🟢 正常'}
                      （{filteredProjects.length} 個）
                    </span>
                    <button
                      onClick={() => setHealthFilter(null)}
                      style={{
                        background: 'none', border: 'none',
                        color: '#854d0e', cursor: 'pointer', fontSize: '13px',
                        textDecoration: 'underline',
                      }}
                    >
                      清除篩選
                    </button>
                  </div>
                )}
                <ProjectHealthList projects={filteredProjects} />
              </Card>

              {/* 人力負載熱力圖 */}
              <Card>
                <WorkloadHeatmap workload={workload} />
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
