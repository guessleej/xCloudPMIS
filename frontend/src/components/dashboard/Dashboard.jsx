/**
 * Dashboard — 主管決策儀表板主頁
 *
 * 版面配置：
 *   ┌─────────────────────────────────────────┐
 *   │  側邊欄            │  主要內容區         │
 *   │  - 導覽選單         │  - 頂部數字卡片      │
 *   │  - 用戶資訊         │  - 圓餅圖 + 專案列表 │
 *   │                     │  - 熱力圖           │
 *   │                     │  - 行動建議         │
 *   └─────────────────────────────────────────┘
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
import AiDecisionCenter   from '../ai/AiDecisionCenter';
import McpConsolePage     from '../mcp/McpConsolePage';

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
  { id: 'ai-center',    icon: '🤖', label: 'AI 決策中心', divider: true },
  { id: 'mcp-console',  icon: '🌐', label: 'MCP 控制台' },
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
          <div key={item.id}>
            {/* AI 功能區分隔線 */}
            {item.divider && (
              <div style={{
                margin:     '8px 4px',
                borderTop:  '1px solid rgba(255,255,255,0.1)',
                paddingTop: 6,
              }}>
                <div style={{ fontSize: 10, color: '#475569', padding: '0 8px 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
                  AI 功能
                </div>
              </div>
            )}
            <button
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
          </div>
        ))}
      </nav>

      {/* 用戶資訊（底部）— 可點擊前往個人資料 */}
      <div style={{
        padding: '10px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={() => onChange('profile')}
          title="查看個人資料"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: active === 'profile' ? 'rgba(255,255,255,0.12)' : 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseOver={e => {
            if (active !== 'profile') e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
          }}
          onMouseOut={e => {
            if (active !== 'profile') e.currentTarget.style.background = 'transparent';
          }}
        >
          <div style={{
            width: '36px', height: '36px', flexShrink: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '14px',
          }}>
            陳
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: '600' }}>陳志明</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>系統管理員</div>
          </div>
          <span style={{ color: '#475569', fontSize: '12px' }}>›</span>
        </button>
      </div>
    </aside>
  );
}

// ── 頁面頂端標題列 ──────────────────────────────────────────
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
// 個人資料頁面
// ════════════════════════════════════════════════════════════
function ProfilePage({ onBack }) {
  const INFO_ROWS = [
    { label: '姓名',     value: '陳志明' },
    { label: '帳號',     value: 'admin@xcloud.com' },
    { label: '角色',     value: '系統管理員' },
    { label: '所屬公司', value: 'xCloud 科技' },
    { label: '部門',     value: '資訊技術部' },
    { label: '電話',     value: '+886 912-345-678' },
    { label: '加入日期', value: '2023-01-15' },
  ];

  return (
    <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 24px' }}>

      {/* 返回按鈕 */}
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px',
          color: '#64748b', fontSize: '14px', marginBottom: '24px', padding: 0,
        }}
      >
        ← 返回儀表板
      </button>

      {/* 頭像區 */}
      <div style={{
        background: 'white', borderRadius: '16px',
        border: '1px solid #e5e7eb', padding: '32px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '24px',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: '800', fontSize: '28px',
          boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
        }}>
          陳
        </div>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>陳志明</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '2px' }}>系統管理員 · xCloud 科技</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            marginTop: '8px', padding: '3px 10px',
            background: '#dcfce7', color: '#16a34a',
            borderRadius: '20px', fontSize: '12px', fontWeight: '600',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            線上
          </div>
        </div>
      </div>

      {/* 基本資料 */}
      <div style={{
        background: 'white', borderRadius: '16px',
        border: '1px solid #e5e7eb', overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        marginBottom: '16px',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
          fontSize: '13px', fontWeight: '700', color: '#374151',
        }}>
          👤 基本資料
        </div>
        {INFO_ROWS.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 20px',
            borderBottom: i < INFO_ROWS.length - 1 ? '1px solid #f1f5f9' : 'none',
            background: i % 2 === 0 ? 'white' : '#fafafa',
          }}>
            <div style={{ width: '100px', fontSize: '13px', color: '#9ca3af', flexShrink: 0 }}>
              {row.label}
            </div>
            <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500' }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div style={{
        background: 'white', borderRadius: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
          fontSize: '13px', fontWeight: '700', color: '#374151',
        }}>
          ⚙️ 帳戶設定
        </div>
        {[
          { icon: '🔒', label: '修改密碼',     desc: '定期更換密碼以保護帳戶安全' },
          { icon: '🔔', label: '通知偏好',     desc: '設定 Email / App 通知類型' },
          { icon: '🌐', label: '語言與時區',   desc: '繁體中文 / Asia/Taipei' },
          { icon: '🚪', label: '登出',         desc: '結束目前登入階段', danger: true },
        ].map((item, i, arr) => (
          <button
            key={item.label}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 20px',
              borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
              border: 'none', background: 'transparent', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = item.danger ? '#fff5f5' : '#f8fafc')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: item.danger ? '#ef4444' : '#111827' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>{item.desc}</div>
            </div>
            <span style={{ color: '#d1d5db', fontSize: '16px' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// 主元件：Dashboard
// ════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [activeNav,     setActiveNav]     = useState('dashboard');
  const [healthFilter,  setHealthFilter]  = useState(null);
  const [settingsState, setSettingsState] = useState(null); // OAuth 回呼狀態
  const { summary, projects, workload, insights, loading, error, refresh } = useDashboard();

  // ── OAuth 回呼偵測：頁面載入時檢查 URL 參數 ────────────────
  // Microsoft OAuth 完成後會重導向至 /settings/integrations?ms_connected=1&ms_email=xxx
  // 或 /settings/integrations?ms_error=state_mismatch 等
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const msConn   = params.get('ms_connected');
    const msError  = params.get('ms_error');
    const msEmail  = params.get('ms_email');

    if (msConn === '1' || msError) {
      // 切換到系統設定 → 整合服務 tab，並傳入回呼結果
      setActiveNav('settings');
      setSettingsState({ initialTab: 'integrations', msConnected: msConn, msError, msEmail });
      // 清除 URL 參數（保留 SPA 乾淨的根路徑）
      window.history.replaceState({}, document.title, window.location.pathname.replace(/\/settings\/integrations\/?$/, '/') || '/');
    }
  }, []); // 僅執行一次

  // 篩選後的專案列表（圓餅圖點擊後篩選）
  const filteredProjects = healthFilter
    ? projects.filter(p => p.health_status === healthFilter)
    : projects;

  // ── 頁面路由：依 activeNav 決定顯示哪個頁面 ──────────────
  const renderPage = () => {
    if (activeNav === 'projects') return <ProjectsPage />;
    if (activeNav === 'tasks')    return <TaskKanbanPage />;
    if (activeNav === 'gantt')    return <GanttPage />;
    if (activeNav === 'time')     return <TimeTrackingPage />;
    if (activeNav === 'reports')  return <ReportsPage />;
    if (activeNav === 'team')     return <TeamPage />;
    if (activeNav === 'settings')  return (
      <SettingsPage
        initialTab={settingsState?.initialTab}
        callbackState={settingsState}
      />
    );
    if (activeNav === 'ai-center')   return <AiDecisionCenter />;
    if (activeNav === 'mcp-console') return <McpConsolePage />;
    if (activeNav === 'profile')     return <ProfilePage onBack={() => setActiveNav('dashboard')} />;
    // 其他頁面：顯示「開發中」提示（之後逐步補上）
    if (activeNav !== 'dashboard') return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px', color: '#9ca3af' }}>
        <div style={{ fontSize: '48px' }}>🚧</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#374151' }}>
          {NAV_ITEMS.find(n => n.id === activeNav)?.label} 開發中
        </div>
        <div style={{ fontSize: '14px' }}>此功能即將上線，敬請期待</div>
      </div>
    );
    // 預設：儀表板
    return loading ? (
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
          );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* 側邊欄 */}
      <Sidebar active={activeNav} onChange={setActiveNav} />

      {/* 主要內容區 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* Header 只有在儀表板頁面才顯示 */}
        {activeNav === 'dashboard' && (
          <Header onRefresh={refresh} loading={loading} />
        )}

        <main style={{ flex: 1, overflow: 'auto' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
