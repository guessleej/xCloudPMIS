import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE = '';

const toneStyles = {
  create: { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', dot: '#10B981' },
  update: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
  status: { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
  done:   { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
  delete: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
};

const statusLabels = {
  todo: '待辦',
  pending: '待處理',
  in_progress: '進行中',
  review: '審核中',
  done: '已完成',
  completed: '已完成',
  cancelled: '已取消',
};

function toDateInput(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return toDateInput(d);
}

function dateKey(value) {
  return toDateInput(value);
}

function formatDayLabel(key) {
  const today = toDateInput(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateInput(yesterdayDate);
  const date = new Date(`${key}T00:00:00`);
  const label = new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
  if (key === today) return `今天 · ${label}`;
  if (key === yesterday) return `昨天 · ${label}`;
  return label;
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function groupByDay(records) {
  return records.reduce((acc, record) => {
    const key = dateKey(record.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});
}

function ProgressSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ height: 88, borderRadius: 18, background: 'linear-gradient(90deg,#F1F5F9,#E2E8F0,#F1F5F9)', opacity: 0.85 }} />
      ))}
    </div>
  );
}

export default function DailyProgressPage({ onNavigate }) {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;
  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [scope, setScope] = useState('mine');
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProjects = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await authFetch(`${API_BASE}/api/projects?companyId=${companyId}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.projects || []);
      setProjects(list);
    } catch (_) {
      setProjects([]);
    }
  }, [authFetch, companyId]);

  const fetchProgress = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ companyId, from, to, scope });
      if (projectId) params.set('projectId', projectId);
      const res = await authFetch(`${API_BASE}/api/dashboard/daily-progress?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '讀取每日進度失敗');
      setRecords(data.data?.records || []);
    } catch (e) {
      setError(e.message || '讀取每日進度失敗');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, companyId, from, to, projectId, scope]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const groups = useMemo(() => groupByDay(records), [records]);
  const dayKeys = useMemo(() => Object.keys(groups).sort((a, b) => b.localeCompare(a)), [groups]);
  const summary = useMemo(() => {
    const projectCount = new Set(records.map(r => r.projectId).filter(Boolean)).size;
    const taskCount = new Set(records.map(r => r.taskId).filter(Boolean)).size;
    return { projectCount, taskCount, recordCount: records.length };
  }, [records]);

  const goTask = (record) => {
    if (!record?.taskId || !onNavigate) return;
    onNavigate('tasks', {
      taskId: record.taskId,
      projectId: record.projectId,
      source: 'daily-progress',
    });
  };

  return (
    <div style={{ padding: '22px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        alignItems: 'flex-start',
        marginBottom: 18,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em' }}>每日專案進度更新</div>
          <div style={{ marginTop: 6, color: '#64748B', fontSize: 14 }}>
            依日期彙整任務異動紀錄，點擊任一紀錄即可直接前往任務看板並開啟該任務。
          </div>
        </div>
        <button
          onClick={fetchProgress}
          style={{
            border: '1px solid #E2E8F0',
            background: '#FFFFFF',
            color: '#0F172A',
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 8px 22px rgba(15,23,42,0.06)',
          }}
        >
          重新整理
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}>
        {[
          ['進度紀錄', summary.recordCount],
          ['相關任務', summary.taskCount],
          ['相關專案', summary.projectCount],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: 16, boxShadow: '0 10px 28px rgba(15,23,42,0.05)' }}>
            <div style={{ color: '#64748B', fontSize: 13, fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: 6, color: '#0F172A', fontSize: 28, fontWeight: 900 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        padding: 14,
        marginBottom: 18,
        boxShadow: '0 10px 28px rgba(15,23,42,0.05)',
      }}>
        <div style={{ display: 'flex', gap: 6, background: '#F1F5F9', padding: 4, borderRadius: 12 }}>
          {[
            ['mine', '我的紀錄'],
            ['all', '團隊全部'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              style={{
                border: 'none',
                borderRadius: 9,
                padding: '8px 12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: scope === value ? '#C41230' : 'transparent',
                color: scope === value ? '#FFFFFF' : '#475569',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 13, fontWeight: 700 }}>
          起日
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 13, fontWeight: 700 }}>
          迄日
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, minWidth: 190 }}>
          <option value="">全部專案</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ marginBottom: 14, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 14, padding: '12px 14px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {loading ? <ProgressSkeleton /> : dayKeys.length === 0 ? (
        <div style={{
          minHeight: 280,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          color: '#64748B',
        }}>
          <div>
            <div style={{ fontSize: 42, marginBottom: 10 }}>📌</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A' }}>這段期間尚無進度紀錄</div>
            <div style={{ marginTop: 6 }}>可以調整日期、專案或切換到「團隊全部」查看。</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {dayKeys.map(key => (
            <section key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0F172A' }}>{formatDayLabel(key)}</div>
                <div style={{ height: 1, flex: 1, background: '#E2E8F0' }} />
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 800 }}>{groups[key].length} 筆</div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {groups[key].map(record => {
                  const tone = toneStyles[record.tone] || toneStyles.update;
                  return (
                    <button
                      key={record.id}
                      onClick={() => goTask(record)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: '1px solid #E2E8F0',
                        background: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        cursor: 'pointer',
                        boxShadow: '0 10px 28px rgba(15,23,42,0.05)',
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 14,
                        alignItems: 'start',
                      }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 14, background: tone.bg, border: `1px solid ${tone.border}`, display: 'grid', placeItems: 'center' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 99, background: tone.dot }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ ...pillStyle, background: '#F8FAFC', color: '#334155', borderColor: '#E2E8F0' }}>{record.projectName}</span>
                          {record.taskStatus && <span style={{ ...pillStyle, background: tone.bg, color: tone.color, borderColor: tone.border }}>{statusLabels[record.taskStatus] || record.taskStatus}</span>}
                          <span style={{ color: '#94A3B8', fontSize: 12, fontWeight: 700 }}>{formatTime(record.createdAt)}</span>
                        </div>
                        <div style={{ color: '#0F172A', fontWeight: 900, fontSize: 15, lineHeight: 1.5 }}>
                          {record.actor?.name || '系統'} {record.text}
                        </div>
                        <div style={{ marginTop: 5, color: '#64748B', fontSize: 13 }}>
                          任務：{record.taskTitle}
                        </div>
                      </div>
                      <div style={{ color: '#C41230', fontSize: 13, fontWeight: 900, paddingTop: 8, whiteSpace: 'nowrap' }}>
                        前往任務 →
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  border: '1px solid #CBD5E1',
  borderRadius: 10,
  padding: '9px 10px',
  color: '#0F172A',
  background: '#FFFFFF',
  fontWeight: 700,
};

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 12,
  fontWeight: 800,
};
