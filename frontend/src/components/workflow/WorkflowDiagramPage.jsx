/**
 * WorkflowDiagramPage — Asana 風格工作流程圖
 *
 * 設計參考：Workflow Diagram: Symbols, Uses, and Examples (Asana 2026)
 *
 * 版面結構：
 *   ① 頁首：標題 + 專案篩選 + 各階段計數徽章
 *   ② 流程符號列：● 開始 → □ 待辦 → □ 進行中 → ◇ 審核 → □ 完成 → ● 結束
 *   ③ 泳道主體：每個專案一列，橫向展示各階段任務卡片
 *   ④ 符號說明欄：解釋各圖形代表意義
 *
 * 標準流程圖符號：
 *   橢圓（Terminator）= 起訖點
 *   矩形（Process）   = 任務節點
 *   菱形（Decision）  = 審核決策點
 *   箭頭（Arrow）     = 流程方向
 *
 * 資料來源：GET /api/gantt?companyId=2
 */

import { useState, useEffect } from 'react';

const API_BASE   = '';
const COMPANY_ID = 2;

// ── 流程階段定義 ─────────────────────────────────────────────
const STAGES = [
  {
    id: 'todo',
    label: '待辦',
    sublabel: 'To Do',
    type: 'process',
    color: '#475569',
    bg: '#F8FAFC',
    border: '#CBD5E1',
    icon: '▭',
  },
  {
    id: 'in_progress',
    label: '進行中',
    sublabel: 'In Progress',
    type: 'process',
    color: '#C41230',
    bg: '#FFF0F2',
    border: '#FECDD3',
    icon: '▭',
  },
  {
    id: 'review',
    label: '審核',
    sublabel: 'Review',
    type: 'decision',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: '◇',
  },
  {
    id: 'done',
    label: '完成',
    sublabel: 'Done',
    type: 'process',
    color: '#15803D',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    icon: '▭',
  },
];

const PRIORITY_COLOR = {
  urgent: '#DC2626',
  high:   '#EA580C',
  medium: '#C41230',
  low:    '#16A34A',
};
const PRIORITY_LABEL = { urgent: '緊急', high: '高', medium: '中', low: '低' };
const PROJECT_STATUS_COLOR = {
  planning:  '#7C3AED',
  active:    '#C41230',
  on_hold:   '#D97706',
  completed: '#16A34A',
  cancelled: '#6B7280',
};
const PROJECT_STATUS_LABEL = {
  planning:  '規劃中',
  active:    '進行中',
  on_hold:   '暫停',
  completed: '已完成',
  cancelled: '已取消',
};

function initials(name = '') { return name.slice(0, 1) || '?'; }
function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function isOverdue(iso, status) {
  return iso && new Date(iso) < new Date() && status !== 'done';
}

// ════════════════════════════════════════════════════════════
// 流程符號元件（SVG-based，符合標準流程圖規範）
// ════════════════════════════════════════════════════════════

/** 橢圓起訖符號（Terminator）*/
function TerminalSymbol({ label, color, size = 'md' }) {
  const pad = size === 'sm' ? '5px 14px' : '7px 20px';
  const fs  = size === 'sm' ? '11px' : '12.5px';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: pad, borderRadius: '99px',
      background: color, color: 'white',
      fontSize: fs, fontWeight: '700',
      whiteSpace: 'nowrap',
      boxShadow: `0 2px 8px ${color}44`,
      flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

/** 矩形流程符號（Process）*/
function ProcessSymbol({ stage, count, size = 'md' }) {
  const pad = size === 'sm' ? '5px 12px' : '8px 16px';
  const fs  = size === 'sm' ? '11px' : '12.5px';
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: pad,
      borderRadius: '7px',
      background: stage.bg,
      border: `1.5px solid ${stage.border}`,
      minWidth: size === 'sm' ? '60px' : '76px',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: fs, fontWeight: '700', color: stage.color, whiteSpace: 'nowrap' }}>
        {stage.label}
      </span>
      {count != null && (
        <span style={{
          fontSize: '10px', color: stage.color,
          background: `${stage.color}18`, borderRadius: '99px',
          padding: '1px 8px', marginTop: '3px', fontWeight: '600',
        }}>
          {count} 個
        </span>
      )}
    </div>
  );
}

/** 菱形決策符號（Decision）*/
function DecisionSymbol({ stage, count, size = 'md' }) {
  const S = size === 'sm' ? 52 : 64;
  return (
    <div style={{
      position: 'relative', width: S, height: S,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={S} height={S} style={{ position: 'absolute', top: 0, left: 0 }}>
        <polygon
          points={`${S/2},3 ${S-3},${S/2} ${S/2},${S-3} 3,${S/2}`}
          fill={stage.bg}
          stroke={stage.border}
          strokeWidth="2"
        />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', lineHeight: 1.2 }}>
        <div style={{ fontSize: size === 'sm' ? '10px' : '11.5px', fontWeight: '700', color: stage.color }}>
          {stage.label}
        </div>
        {count != null && (
          <div style={{ fontSize: '10px', color: stage.color, fontWeight: '600' }}>{count}</div>
        )}
      </div>
    </div>
  );
}

/** 箭頭連接線 */
function Arrow({ label, color = '#CBD5E1', vertical = false }) {
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0' }}>
        <svg width="14" height="24" viewBox="0 0 14 24">
          <line x1="7" y1="0" x2="7" y2="18" stroke={color} strokeWidth="1.5"/>
          <polygon points="3,18 11,18 7,24" fill={color}/>
        </svg>
        {label && (
          <span style={{ fontSize: '10px', color: '#94A3B8', whiteSpace: 'nowrap', marginTop: '2px' }}>
            {label}
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 2px', flexShrink: 0 }}>
      <svg width="32" height="14" viewBox="0 0 32 14">
        <line x1="0" y1="7" x2="25" y2="7" stroke={color} strokeWidth="1.5"/>
        <polygon points="25,3 32,7 25,11" fill={color}/>
      </svg>
      {label && (
        <span style={{ fontSize: '9px', color: '#94A3B8', marginTop: '1px', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 任務卡片
// ════════════════════════════════════════════════════════════
function TaskCard({ task }) {
  const pColor  = PRIORITY_COLOR[task.priority] || '#94A3B8';
  const pLabel  = PRIORITY_LABEL[task.priority] || task.priority;
  const due     = task.planEnd ? fmtDate(task.planEnd) : null;
  const overdue = isOverdue(task.planEnd, task.status);

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E8EDF4',
        borderLeft: `3px solid ${pColor}`,
        borderRadius: '7px',
        padding: '9px 11px',
        marginBottom: '6px',
        cursor: 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseOver={e => {
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.09)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* 任務名稱 */}
      <div style={{
        fontSize: '12px', fontWeight: '600', color: '#1e293b',
        lineHeight: '1.35', marginBottom: '7px',
      }}>
        {task.title}
      </div>

      {/* 優先度 + 指派人 + 日期 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '10px', fontWeight: '600',
          color: pColor, background: `${pColor}18`,
          borderRadius: '99px', padding: '1px 7px',
        }}>
          {pLabel}
        </span>

        {task.assignee?.name && (
          <div
            title={task.assignee.name}
            style={{
              width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #C41230, #8B0020)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '9px', fontWeight: '700',
            }}
          >
            {initials(task.assignee.name)}
          </div>
        )}

        {due && (
          <span style={{
            fontSize: '10.5px',
            color: overdue ? '#DC2626' : '#94A3B8',
            fontWeight: overdue ? '600' : '400',
          }}>
            {overdue ? '⚠ ' : '📅 '}{due}
          </span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 泳道列
// ════════════════════════════════════════════════════════════
function SwimLaneRow({ project, tasksByStage, isLast }) {
  const totalDone  = (tasksByStage['done'] || []).length;
  const totalAll   = project.totalTasks || 1;
  const progress   = Math.round((totalDone / totalAll) * 100);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px repeat(4, minmax(160px, 1fr))',
      borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
      minHeight: '90px',
    }}>
      {/* 專案標籤欄（凍結左側）*/}
      <div style={{
        padding: '14px 14px',
        borderRight: '2px solid #E2E8F0',
        background: '#FAFAFA',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
        position: 'sticky', left: 0, zIndex: 2,
      }}>
        {/* 狀態點 + 名稱 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
            background: project.statusColor, marginTop: '3px',
          }} />
          <div>
            <div style={{
              fontSize: '12.5px', fontWeight: '700', color: '#1e293b',
              lineHeight: '1.35', wordBreak: 'break-all',
            }}>
              {project.name}
            </div>
            <div style={{
              fontSize: '10px', color: project.statusColor, fontWeight: '600',
              marginTop: '2px',
            }}>
              {PROJECT_STATUS_LABEL[project.status] || project.status}
            </div>
          </div>
        </div>

        {/* 進度條 */}
        <div style={{ marginTop: '10px' }}>
          <div style={{
            height: '4px', borderRadius: '99px',
            background: '#E2E8F0', overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: progress === 100 ? '#16A34A' : '#C41230',
              borderRadius: '99px', transition: 'width 0.4s',
            }} />
          </div>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px' }}>
            完成 {totalDone}/{totalAll} · {progress}%
          </div>
        </div>
      </div>

      {/* 各階段任務格子 */}
      {STAGES.map((stage, si) => (
        <div
          key={stage.id}
          style={{
            padding: '10px 8px',
            borderRight: si < STAGES.length - 1 ? '1px dashed #E8EDF4' : 'none',
            background: (tasksByStage[stage.id] || []).length > 0 ? stage.bg + '80' : 'transparent',
            minHeight: '90px',
          }}
        >
          {(tasksByStage[stage.id] || []).map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {!(tasksByStage[stage.id] || []).length && (
            <div style={{
              height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '20px', opacity: 0.1, userSelect: 'none' }}>—</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：WorkflowDiagramPage
// ════════════════════════════════════════════════════════════
export default function WorkflowDiagramPage() {
  const [projects,       setProjects]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [filterProject,  setFilterProject]  = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/gantt?companyId=${COMPANY_ID}`)
      .then(r => r.json())
      .then(data => { setProjects(data.projects || []); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  // 整理泳道資料
  const processed = projects
    .filter(p => filterProject === 'all' || p.id === Number(filterProject))
    .map(p => {
      const tasksByStage = {};
      STAGES.forEach(s => { tasksByStage[s.id] = []; });
      (p.tasks || []).forEach(t => {
        const sid = t.status === 'planning' ? 'todo' : t.status;
        if (tasksByStage[sid]) tasksByStage[sid].push(t);
      });
      return {
        ...p,
        statusColor: PROJECT_STATUS_COLOR[p.status] || '#94A3B8',
        tasksByStage,
        totalTasks: (p.tasks || []).length,
      };
    });

  // 各階段總數
  const stageCounts = {};
  STAGES.forEach(s => {
    stageCounts[s.id] = processed.reduce((a, p) => a + (p.tasksByStage[s.id]?.length || 0), 0);
  });
  const totalTasks = Object.values(stageCounts).reduce((a, v) => a + v, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── ① 頁首 ─────────────────────────────────────────── */}
      <div style={{
        padding: '18px 28px 14px',
        background: 'white',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* 小流程圖示 */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="6" rx="2" fill="#C41230" opacity="0.2" stroke="#C41230" strokeWidth="1.5"/>
              <line x1="9" y1="4" x2="13" y2="4" stroke="#C41230" strokeWidth="1.5"/>
              <polygon points="13,2.5 16,4 13,5.5" fill="#C41230"/>
              <rect x="13" y="1" width="8" height="6" rx="2" fill="#C41230" opacity="0.2" stroke="#C41230" strokeWidth="1.5"/>
              <line x1="17" y1="7" x2="17" y2="11" stroke="#94A3B8" strokeWidth="1.5"/>
              <polygon points="15.5,11 17,14 18.5,11" fill="#94A3B8"/>
              <polygon points="11,15 17,12 17,21 4,21 4,12" fill="none" stroke="#D97706" strokeWidth="1.5"/>
            </svg>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
              工作流程圖
            </h2>
          </div>
          <p style={{ margin: '2px 0 0 32px', fontSize: '11.5px', color: '#94A3B8' }}>
            Asana 式泳道流程 · 橢圓＝起訖 · 矩形＝流程 · 菱形＝決策
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 篩選器 */}
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: '8px',
              border: '1px solid #E2E8F0', background: 'white',
              fontSize: '12.5px', color: '#374151',
              cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
            }}
          >
            <option value="all">全部專案（{projects.length}）</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* 統計徽章列 */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600',
              background: '#F8FAFC', color: '#475569', border: '1px solid #CBD5E1',
            }}>
              全部 {totalTasks}
            </span>
            {STAGES.map(s => (
              <span key={s.id} style={{
                padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600',
                background: s.bg, color: s.color, border: `1px solid ${s.border}`,
              }}>
                {s.label} {stageCounts[s.id]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── ② 流程符號列 ──────────────────────────────────── */}
      <div style={{
        padding: '14px 28px',
        background: 'linear-gradient(to right, #FAFBFC, #F5F0F1)',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
        overflowX: 'auto', gap: '0', flexShrink: 0,
      }}>
        <span style={{
          fontSize: '10.5px', color: '#94A3B8', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          whiteSpace: 'nowrap', marginRight: '14px', flexShrink: 0,
        }}>
          流程：
        </span>

        <TerminalSymbol label="● 開始" color="#16A34A" />
        <Arrow color="#B2C4D8" />

        {STAGES.map((stage, i) => (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center' }}>
            {stage.type === 'decision'
              ? <DecisionSymbol stage={stage} count={stageCounts[stage.id]} />
              : <ProcessSymbol  stage={stage} count={stageCounts[stage.id]} />
            }
            {i < STAGES.length - 1 && <Arrow color="#B2C4D8" />}
          </div>
        ))}

        <Arrow color="#B2C4D8" />
        <TerminalSymbol label="● 結束" color="#C41230" />

        {/* 決策分支說明 */}
        <div style={{
          marginLeft: '24px', paddingLeft: '20px',
          borderLeft: '1px dashed #E2E8F0',
          display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <polygon points="7,1 13,7 7,13 1,7" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="1.5"/>
            </svg>
            <span style={{ fontSize: '10.5px', color: '#78716C' }}>通過 → 完成</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <polygon points="7,1 13,7 7,13 1,7" fill="#FEF2F2" stroke="#FECACA" strokeWidth="1.5"/>
            </svg>
            <span style={{ fontSize: '10.5px', color: '#78716C' }}>退回 → 修改</span>
          </div>
        </div>
      </div>

      {/* ── ③ 泳道主體 ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>

        {/* 欄位標題列 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '180px repeat(4, minmax(160px, 1fr))',
          borderBottom: '2px solid #E2E8F0',
          background: 'white',
          position: 'sticky', top: 0, zIndex: 10,
          minWidth: '820px',
        }}>
          {/* 泳道標籤欄 */}
          <div style={{
            padding: '11px 14px',
            fontSize: '10.5px', fontWeight: '700', color: '#94A3B8',
            textTransform: 'uppercase', letterSpacing: '0.8px',
            borderRight: '2px solid #E2E8F0',
            position: 'sticky', left: 0, background: 'white', zIndex: 1,
          }}>
            泳道 / 專案
          </div>

          {STAGES.map((stage, si) => (
            <div key={stage.id} style={{
              padding: '8px 10px',
              borderRight: si < STAGES.length - 1 ? '1px solid #F1F5F9' : 'none',
              display: 'flex', alignItems: 'center', gap: '7px',
            }}>
              {/* 流程符號微型圖示 */}
              {stage.type === 'decision' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <polygon points="7,1 13,7 7,13 1,7" fill={stage.bg} stroke={stage.border} strokeWidth="1.5"/>
                </svg>
              ) : (
                <div style={{
                  width: '10px', height: '10px', borderRadius: '2px',
                  background: stage.color, flexShrink: 0,
                }} />
              )}
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: '700', color: stage.color }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>{stage.sublabel}</div>
              </div>
              <span style={{
                marginLeft: 'auto', fontSize: '11px', fontWeight: '700',
                padding: '2px 8px', borderRadius: '99px',
                background: stage.bg, color: stage.color, border: `1px solid ${stage.border}`,
              }}>
                {stageCounts[stage.id]}
              </span>
            </div>
          ))}
        </div>

        {/* 泳道列主體 */}
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{
              display: 'inline-block', width: '36px', height: '36px',
              border: '3px solid #C41230', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ marginTop: '14px', color: '#94A3B8', fontSize: '13.5px' }}>載入中…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ color: '#DC2626', fontWeight: '700', marginBottom: '6px' }}>資料載入失敗</div>
            <div style={{ color: '#94A3B8', fontSize: '12px' }}>{error}</div>
          </div>
        ) : processed.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>📋</div>
            <div style={{ color: '#475569', fontWeight: '700', marginBottom: '6px' }}>目前沒有專案資料</div>
            <div style={{ color: '#94A3B8', fontSize: '12px' }}>請先建立專案再查看工作流程圖</div>
          </div>
        ) : (
          <div style={{ minWidth: '820px' }}>
            {processed.map((project, i) => (
              <SwimLaneRow
                key={project.id}
                project={project}
                tasksByStage={project.tasksByStage}
                isLast={i === processed.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── ④ 底部符號說明 ───────────────────────────────── */}
      <div style={{
        padding: '12px 28px',
        borderTop: '1px solid #E2E8F0',
        background: '#FAFBFC',
        display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: '10.5px', fontWeight: '700', color: '#94A3B8',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          符號說明：
        </span>
        {[
          {
            node: <TerminalSymbol label="●" color="#16A34A" size="sm" />,
            label: '橢圓（Terminator）= 起訖點',
          },
          {
            node: <ProcessSymbol stage={{ label: '▭', color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' }} size="sm" />,
            label: '矩形（Process）= 任務流程節點',
          },
          {
            node: (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <polygon points="9,1 17,9 9,17 1,9" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="2"/>
              </svg>
            ),
            label: '菱形（Decision）= 審核決策點',
          },
          {
            node: <Arrow color="#94A3B8" />,
            label: '箭頭（Arrow）= 流程方向',
          },
          {
            node: (
              <div style={{
                width: '12px', height: '3px', borderRadius: '99px',
                background: '#C41230', opacity: 0.6,
              }} />
            ),
            label: '左側色帶 = 任務優先度',
          },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {item.node}
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
