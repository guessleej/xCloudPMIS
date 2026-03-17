/**
 * TimeTrackingPage — 工時記錄頁面
 *
 * 版面配置：
 *   ┌──────────────────────────────────────────────────┐
 *   │ 頁面標題 + 操作按鈕（開始計時 / 手動新增）          │
 *   ├──────────────────────────────────────────────────┤
 *   │ 統計卡片列（今日 / 本週 / 本月 / 計時中）           │
 *   ├──────────────────────────────────────────────────┤
 *   │ 計時進行中 Widget（有計時中記錄時才顯示）            │
 *   ├──────────────────────────────────────────────────┤
 *   │ 日期篩選 Tab（今天 / 本週 / 本月）                  │
 *   ├──────────────────────────────────────────────────┤
 *   │ 工時記錄列表（依日期分組，每組顯示當日合計）          │
 *   └──────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 常數設定 ─────────────────────────────────────────────────
const API_BASE   = '';
const COMPANY_ID = 2;
const CURRENT_USER_ID = 4; // 目前登入使用者（模擬：陳志明，ID=4）

// ── 工具函式 ─────────────────────────────────────────────────

/**
 * 格式化分鐘數為顯示文字
 */
const fmtMinutes = (mins) => {
  if (!mins || mins <= 0) return '0 分鐘';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分鐘`;
};

/**
 * 計算從 startedAt 到現在的經過秒數
 */
const elapsedSeconds = (startedAt) =>
  Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);

/**
 * 秒數 → HH:MM:SS 字串
 */
const secsToHMS = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * 將 ISO 字串格式化為 HH:MM
 */
const fmtTime = (isoStr) => {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * YYYY-MM-DD → 中文日期顯示（含星期）
 */
const fmtDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
};

/**
 * 今天的 YYYY-MM-DD 字串（本地時間）
 */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 本週週一的 YYYY-MM-DD
 */
const weekStartStr = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 本月 1 日的 YYYY-MM-DD
 */
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// ── 日期範圍 Tab 設定 ────────────────────────────────────────
const DATE_RANGES = [
  { id: 'today', label: '今天',  getRange: () => ({ start: todayStr(), end: todayStr() }) },
  { id: 'week',  label: '本週',  getRange: () => ({ start: weekStartStr(), end: todayStr() }) },
  { id: 'month', label: '本月',  getRange: () => ({ start: monthStartStr(), end: todayStr() }) },
];

// ── 共用樣式物件 ─────────────────────────────────────────────
const labelStyle = {
  display:     'block',
  fontSize:    '13px',
  fontWeight:  '600',
  color:       '#374151',
  marginBottom: '6px',
};
const inputStyle = {
  width:        '100%',
  padding:      '9px 12px',
  border:       '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize:     '14px',
  color:        '#111827',
  outline:      'none',
  boxSizing:    'border-box',
};
const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
  background: 'white',
};
const primaryBtnStyle = {
  background:   '#3b82f6',
  color:        'white',
  border:       'none',
  borderRadius: '8px',
  padding:      '9px 20px',
  fontSize:     '14px',
  fontWeight:   '600',
  cursor:       'pointer',
};
const cancelBtnStyle = {
  background:   '#f3f4f6',
  color:        '#374151',
  border:       'none',
  borderRadius: '8px',
  padding:      '9px 20px',
  fontSize:     '14px',
  fontWeight:   '500',
  cursor:       'pointer',
};
const dangerBtnStyle = {
  background:   '#ef4444',
  color:        'white',
  border:       'none',
  borderRadius: '8px',
  padding:      '9px 20px',
  fontSize:     '14px',
  fontWeight:   '600',
  cursor:       'pointer',
};

// ════════════════════════════════════════════════════════════
// Modal 容器（遮罩）
// ════════════════════════════════════════════════════════════
function ModalOverlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position:   'fixed',
        inset:      0,
        background: 'rgba(0,0,0,0.4)',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex:     1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   'white',
          borderRadius: '16px',
          boxShadow:    '0 20px 60px rgba(0,0,0,0.2)',
          position:     'relative',
        }}
      >
        {/* 關閉按鈕 */}
        <button
          onClick={onClose}
          style={{
            position:     'absolute',
            top:          '16px',
            right:        '16px',
            background:   'none',
            border:       'none',
            fontSize:     '20px',
            cursor:       'pointer',
            color:        '#9ca3af',
            lineHeight:   1,
            padding:      '2px',
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 統計卡片元件
// ════════════════════════════════════════════════════════════
function SummaryCard({ icon, label, value, sub, color = '#3b82f6' }) {
  return (
    <div style={{
      background:   'white',
      border:       '1px solid #e5e7eb',
      borderRadius: '12px',
      padding:      '20px',
      boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px',
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 計時進行中 Widget
// ════════════════════════════════════════════════════════════
function ActiveTimerWidget({ entry, onStop }) {
  const [secs, setSecs] = useState(() => elapsedSeconds(entry.startedAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setSecs(elapsedSeconds(entry.startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [entry.startedAt]);

  return (
    <div style={{
      background:   'linear-gradient(135deg, #1e40af, #3b82f6)',
      borderRadius: '12px',
      padding:      '20px 24px',
      color:        'white',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      marginBottom: '20px',
      boxShadow:    '0 4px 12px rgba(59,130,246,0.3)',
    }}>
      {/* 左側資訊 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* 跳動的計時指示燈 */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            background: '#4ade80',
            boxShadow: '0 0 0 0 rgba(74,222,128,0.4)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>
            計時進行中
          </div>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>
            {entry.taskTitle}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
            {entry.projectName} · 從 {fmtTime(entry.startedAt)} 開始
          </div>
          {entry.description && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
              {entry.description}
            </div>
          )}
        </div>
      </div>

      {/* 右側計時器 + 停止按鈕 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize:   '32px',
          fontWeight: '700',
          letterSpacing: '2px',
          minWidth:   '100px',
          textAlign:  'center',
        }}>
          {secsToHMS(secs)}
        </div>
        <button
          onClick={() => onStop(entry.id)}
          style={{
            background:   '#dc2626',
            border:       'none',
            borderRadius: '8px',
            padding:      '10px 20px',
            color:        'white',
            fontWeight:   '700',
            fontSize:     '14px',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            gap:          '6px',
          }}
        >
          ⏹ 停止
        </button>
      </div>

      {/* CSS 動畫 */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(74,222,128,0); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 開始計時 Modal
// ════════════════════════════════════════════════════════════
function StartTimerModal({ tasks, onClose, onSubmit }) {
  const [taskId,      setTaskId]      = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const handleSubmit = async () => {
    if (!taskId) return;
    setSubmitting(true);
    await onSubmit({ taskId: parseInt(taskId), userId: CURRENT_USER_ID, description });
    setSubmitting(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '24px', minWidth: '400px' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#111827' }}>
          ⏱️ 開始計時
        </h2>

        {/* 任務選擇 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>選擇任務 *</label>
          <select
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— 請選擇任務 —</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>
                [{t.project.name}] {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* 工作描述 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>工作描述（選填）</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="今天要做什麼？"
            style={inputStyle}
          />
        </div>

        {/* 按鈕列 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button
            onClick={handleSubmit}
            disabled={!taskId || submitting}
            style={{
              ...primaryBtnStyle,
              opacity: (!taskId || submitting) ? 0.5 : 1,
              cursor:  (!taskId || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '⏳ 啟動中...' : '▶ 開始計時'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ════════════════════════════════════════════════════════════
// 手動新增 Modal
// ════════════════════════════════════════════════════════════
function ManualAddModal({ tasks, onClose, onSubmit }) {
  const today = todayStr();
  const [form, setForm] = useState({
    taskId:      '',
    date:        today,
    startTime:   '09:00',
    endTime:     '10:00',
    description: '',
  });
  const [submitting,      setSubmitting]      = useState(false);
  const [durationPreview, setDurationPreview] = useState('');

  // 更新時長預覽
  useEffect(() => {
    if (form.startTime && form.endTime) {
      const start = new Date(`${form.date}T${form.startTime}:00`);
      const end   = new Date(`${form.date}T${form.endTime}:00`);
      const mins  = Math.ceil((end - start) / 60000);
      setDurationPreview(mins > 0 ? fmtMinutes(mins) : '⚠️ 結束時間必須晚於開始時間');
    }
  }, [form.date, form.startTime, form.endTime]);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.taskId || !form.date || !form.startTime || !form.endTime) return;
    const startedAt = new Date(`${form.date}T${form.startTime}:00`);
    const endedAt   = new Date(`${form.date}T${form.endTime}:00`);
    if (endedAt <= startedAt) return;

    setSubmitting(true);
    await onSubmit({
      taskId:      parseInt(form.taskId),
      userId:      CURRENT_USER_ID,
      startedAt:   startedAt.toISOString(),
      endedAt:     endedAt.toISOString(),
      description: form.description,
    });
    setSubmitting(false);
  };

  const isValid = form.taskId && form.date && form.startTime && form.endTime
    && new Date(`${form.date}T${form.endTime}:00`) > new Date(`${form.date}T${form.startTime}:00`);

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '24px', minWidth: '460px' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#111827' }}>
          ➕ 手動新增工時
        </h2>

        {/* 任務 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>選擇任務 *</label>
          <select value={form.taskId} onChange={e => update('taskId', e.target.value)} style={selectStyle}>
            <option value="">— 請選擇任務 —</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>
                [{t.project.name}] {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* 日期 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>日期 *</label>
          <input
            type="date"
            value={form.date}
            onChange={e => update('date', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 時間範圍 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>開始時間 *</label>
            <input
              type="time"
              value={form.startTime}
              onChange={e => update('startTime', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>結束時間 *</label>
            <input
              type="time"
              value={form.endTime}
              onChange={e => update('endTime', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* 時長預覽 */}
        {durationPreview && (
          <div style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: durationPreview.startsWith('⚠️') ? '#fef2f2' : '#f0fdf4',
            borderRadius: '6px',
            fontSize: '13px',
            color: durationPreview.startsWith('⚠️') ? '#dc2626' : '#16a34a',
            fontWeight: '500',
          }}>
            {durationPreview.startsWith('⚠️') ? durationPreview : `🕐 時長：${durationPreview}`}
          </div>
        )}

        {/* 描述 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>工作描述（選填）</label>
          <input
            type="text"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="說明完成了哪些工作..."
            style={inputStyle}
          />
        </div>

        {/* 按鈕列 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            style={{
              ...primaryBtnStyle,
              opacity: (!isValid || submitting) ? 0.5 : 1,
              cursor:  (!isValid || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '⏳ 儲存中...' : '💾 儲存'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ════════════════════════════════════════════════════════════
// 編輯工時記錄 Modal
// ════════════════════════════════════════════════════════════
function EditEntryModal({ entry, tasks, onClose, onSaved }) {
  const [form, setForm] = useState({
    taskId:      String(entry.taskId),
    date:        entry.date,
    startTime:   fmtTime(entry.startedAt),
    endTime:     entry.endedAt ? fmtTime(entry.endedAt) : '',
    description: entry.description || '',
  });
  const [submitting,      setSubmitting]      = useState(false);
  const [durationPreview, setDurationPreview] = useState('');
  const [error,           setError]           = useState('');

  const isActive = entry.isActive; // 計時中的記錄

  // 更新時長預覽
  useEffect(() => {
    if (!isActive && form.startTime && form.endTime) {
      const start = new Date(`${form.date}T${form.startTime}:00`);
      const end   = new Date(`${form.date}T${form.endTime}:00`);
      const mins  = Math.ceil((end - start) / 60000);
      setDurationPreview(mins > 0 ? fmtMinutes(mins) : '⚠️ 結束時間必須晚於開始時間');
    }
  }, [form.date, form.startTime, form.endTime, isActive]);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setError('');

    // 組合更新資料
    const payload = {
      description: form.description,
      taskId:      parseInt(form.taskId),
    };

    if (!isActive) {
      // 已完成記錄：也更新時間
      if (!form.taskId || !form.date || !form.startTime || !form.endTime) {
        setError('請填寫所有必填欄位');
        return;
      }
      const startedAt = new Date(`${form.date}T${form.startTime}:00`);
      const endedAt   = new Date(`${form.date}T${form.endTime}:00`);
      if (endedAt <= startedAt) {
        setError('結束時間必須晚於開始時間');
        return;
      }
      payload.startedAt = startedAt.toISOString();
      payload.endedAt   = endedAt.toISOString();
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/time-tracking/${entry.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '更新失敗');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = isActive
    ? !!form.taskId
    : form.taskId && form.date && form.startTime && form.endTime
      && new Date(`${form.date}T${form.endTime}:00`) > new Date(`${form.date}T${form.startTime}:00`);

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '24px', minWidth: '460px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '700', color: '#111827' }}>
          ✏️ 編輯工時記錄
        </h2>
        {isActive && (
          <div style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: '#eff6ff',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#1d4ed8',
          }}>
            ⏱️ 計時進行中 — 只能編輯任務與描述，停止後才可修改時間
          </div>
        )}

        {/* 任務 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>選擇任務 *</label>
          <select value={form.taskId} onChange={e => update('taskId', e.target.value)} style={selectStyle}>
            <option value="">— 請選擇任務 —</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>
                [{t.project.name}] {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* 已完成記錄才能改時間 */}
        {!isActive && (
          <>
            {/* 日期 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>日期 *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => update('date', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* 時間範圍 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>開始時間 *</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={e => update('startTime', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>結束時間 *</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => update('endTime', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* 時長預覽 */}
            {durationPreview && (
              <div style={{
                marginBottom: '16px',
                padding: '8px 12px',
                background: durationPreview.startsWith('⚠️') ? '#fef2f2' : '#f0fdf4',
                borderRadius: '6px',
                fontSize: '13px',
                color: durationPreview.startsWith('⚠️') ? '#dc2626' : '#16a34a',
                fontWeight: '500',
              }}>
                {durationPreview.startsWith('⚠️') ? durationPreview : `🕐 時長：${durationPreview}`}
              </div>
            )}
          </>
        )}

        {/* 描述 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>工作描述（選填）</label>
          <input
            type="text"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="說明完成了哪些工作..."
            style={inputStyle}
          />
        </div>

        {/* 錯誤訊息 */}
        {error && (
          <div style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: '#fef2f2',
            borderRadius: '6px',
            color: '#dc2626',
            fontSize: '13px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 按鈕列 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button
            onClick={handleSave}
            disabled={!isValid || submitting}
            style={{
              ...primaryBtnStyle,
              opacity: (!isValid || submitting) ? 0.5 : 1,
              cursor:  (!isValid || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '⏳ 儲存中...' : '💾 儲存'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ════════════════════════════════════════════════════════════
// 刪除工時記錄確認 Modal
// ════════════════════════════════════════════════════════════
function DeleteEntryModal({ entry, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirmed(entry.id);
    setLoading(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: '28px 24px', minWidth: '380px', maxWidth: '440px' }}>
        {/* 圖示 + 標題 */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>🗑️</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: '700', color: '#111827' }}>
            刪除工時記錄
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>確定要刪除以下工時記錄嗎？</p>
        </div>

        {/* 記錄資訊卡 */}
        <div style={{
          background:   '#f9fafb',
          border:       '1px solid #e5e7eb',
          borderRadius: '10px',
          padding:      '14px 16px',
          marginBottom: '18px',
        }}>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827', marginBottom: '4px' }}>
            {entry.taskTitle}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>
            {entry.projectName}
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
            <span>
              🕐 {fmtTime(entry.startedAt)}
              {entry.endedAt ? ` – ${fmtTime(entry.endedAt)}` : ' – 進行中'}
            </span>
            {entry.durationMinutes > 0 && (
              <span>⏱ {fmtMinutes(entry.durationMinutes)}</span>
            )}
          </div>
          {entry.description && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
              「{entry.description}」
            </div>
          )}
        </div>

        {entry.isActive && (
          <div style={{
            background:   '#fff7ed',
            border:       '1px solid #fed7aa',
            borderRadius: '6px',
            padding:      '8px 12px',
            color:        '#c2410c',
            fontSize:     '12px',
            marginBottom: '16px',
          }}>
            ⚠️ 此為計時進行中的記錄，刪除後計時將立即停止。
          </div>
        )}

        {/* 按鈕列 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{ ...dangerBtnStyle, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '⏳ 刪除中...' : '🗑️ 確認刪除'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ════════════════════════════════════════════════════════════
// 工時記錄列（單筆）
// ════════════════════════════════════════════════════════════
function EntryRow({ entry, onEditRequest, onDeleteRequest }) {
  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        '12px',
      padding:    '12px 16px',
      borderBottom: '1px solid #f3f4f6',
    }}>
      {/* 時間範圍 */}
      <div style={{
        minWidth:   '100px',
        fontSize:   '13px',
        color:      '#6b7280',
        fontFamily: 'monospace',
      }}>
        {fmtTime(entry.startedAt)}
        {entry.endedAt ? ` – ${fmtTime(entry.endedAt)}` : ' – 進行中'}
      </div>

      {/* 任務 + 專案 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:    '14px',
          fontWeight:  '500',
          color:       '#111827',
          overflow:    'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:  'nowrap',
        }}>
          {entry.taskTitle}
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>
          {entry.projectName}
        </div>
        {entry.description && (
          <div style={{
            fontSize: '12px',
            color:    '#6b7280',
            marginTop: '2px',
            fontStyle: 'italic',
          }}>
            {entry.description}
          </div>
        )}
      </div>

      {/* 時長 */}
      <div style={{
        minWidth:   '80px',
        textAlign:  'right',
        fontSize:   '14px',
        fontWeight: '600',
        color:      entry.isActive ? '#3b82f6' : '#374151',
      }}>
        {entry.isActive
          ? <ActiveDuration startedAt={entry.startedAt} />
          : fmtMinutes(entry.durationMinutes)
        }
      </div>

      {/* 操作按鈕：✏️ 編輯 + 🗑 刪除 */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={() => onEditRequest(entry)}
          title="編輯此記錄"
          style={{
            background:   'none',
            border:       '1px solid #e5e7eb',
            color:        '#9ca3af',
            cursor:       'pointer',
            fontSize:     '13px',
            padding:      '4px 8px',
            borderRadius: '6px',
            lineHeight:   1,
            transition:   'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#e0f2fe'; e.currentTarget.style.color = '#0369a1'; e.currentTarget.style.borderColor = '#bae6fd'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
        >
          ✏️
        </button>
        <button
          onClick={() => onDeleteRequest(entry)}
          title="刪除此記錄"
          style={{
            background:   'none',
            border:       '1px solid #e5e7eb',
            color:        '#9ca3af',
            cursor:       'pointer',
            fontSize:     '13px',
            padding:      '4px 8px',
            borderRadius: '6px',
            lineHeight:   1,
            transition:   'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// 進行中記錄的即時時長顯示
function ActiveDuration({ startedAt }) {
  const [secs, setSecs] = useState(() => elapsedSeconds(startedAt));
  useEffect(() => {
    const timer = setInterval(() => setSecs(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <span style={{ fontFamily: 'monospace' }}>{secsToHMS(secs)}</span>;
}

// ════════════════════════════════════════════════════════════
// 日期群組（一天的所有記錄）
// ════════════════════════════════════════════════════════════
function DateGroup({ date, entries, onEditRequest, onDeleteRequest }) {
  // 計算已完成的當日合計分鐘
  const totalMins = entries
    .filter(e => !e.isActive)
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  const isToday = date === todayStr();

  return (
    <div style={{
      background:   'white',
      border:       '1px solid #e5e7eb',
      borderRadius: '12px',
      marginBottom: '12px',
      overflow:     'hidden',
      boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* 群組標題列 */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding:    '12px 16px',
        background: isToday ? '#eff6ff' : '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isToday && (
            <span style={{
              background: '#3b82f6',
              color: 'white',
              fontSize: '10px',
              fontWeight: '700',
              padding: '2px 6px',
              borderRadius: '4px',
            }}>今天</span>
          )}
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            {fmtDate(date)}
          </span>
        </div>
        <span style={{
          fontSize:   '13px',
          fontWeight: '600',
          color:      '#6b7280',
        }}>
          合計：{fmtMinutes(totalMins)}
        </span>
      </div>

      {/* 記錄列表 */}
      {entries.map(entry => (
        <EntryRow
          key={entry.id}
          entry={entry}
          onEditRequest={onEditRequest}
          onDeleteRequest={onDeleteRequest}
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 主元件：TimeTrackingPage
// ════════════════════════════════════════════════════════════
export default function TimeTrackingPage() {
  // ── 狀態 ─────────────────────────────────────────────────
  const [entries,          setEntries]          = useState([]);
  const [summary,          setSummary]          = useState(null);
  const [tasks,            setTasks]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [activeRange,      setActiveRange]      = useState('today');
  const [showStartModal,   setShowStartModal]   = useState(false);
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [editEntry,        setEditEntry]        = useState(null); // 待編輯的記錄
  const [deleteEntry,      setDeleteEntry]      = useState(null); // 待刪除的記錄
  const [toast,            setToast]            = useState('');   // Toast 通知

  // ── Toast 輔助函式 ────────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── 資料載入 ─────────────────────────────────────────────
  const loadData = useCallback(async (rangeId = activeRange) => {
    setLoading(true);
    setError(null);
    try {
      const range = DATE_RANGES.find(r => r.id === rangeId) || DATE_RANGES[0];
      const { start, end } = range.getRange();

      const [entriesRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE}/api/time-tracking?companyId=${COMPANY_ID}&startDate=${start}&endDate=${end}`),
        fetch(`${API_BASE}/api/time-tracking/tasks?companyId=${COMPANY_ID}`),
      ]);

      if (!entriesRes.ok || !tasksRes.ok) throw new Error('資料載入失敗');

      const entriesData = await entriesRes.json();
      const tasksData   = await tasksRes.json();

      setEntries(entriesData.entries);
      setSummary(entriesData.summary);
      setTasks(tasksData.tasks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeRange]);

  useEffect(() => {
    loadData(activeRange);
  }, [activeRange]);

  // ── 開始計時 ─────────────────────────────────────────────
  const handleStartTimer = async (data) => {
    try {
      const res = await fetch(`${API_BASE}/api/time-tracking/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '開始計時失敗');
        return;
      }
      setShowStartModal(false);
      await loadData(activeRange);
      showToast('▶ 計時已開始');
    } catch {
      alert('網路錯誤，請稍後再試');
    }
  };

  // ── 停止計時 ─────────────────────────────────────────────
  const handleStopTimer = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/time-tracking/${id}/stop`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '停止計時失敗');
        return;
      }
      await loadData(activeRange);
      showToast('⏹ 計時已停止');
    } catch {
      alert('網路錯誤，請稍後再試');
    }
  };

  // ── 手動新增 ─────────────────────────────────────────────
  const handleManualAdd = async (data) => {
    try {
      const res = await fetch(`${API_BASE}/api/time-tracking`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '新增失敗');
        return;
      }
      setShowAddModal(false);
      await loadData(activeRange);
      showToast('✅ 工時記錄已新增');
    } catch {
      alert('網路錯誤，請稍後再試');
    }
  };

  // ── 編輯記錄（Modal 呼叫完 API 後的 callback） ───────────
  const handleEditSaved = async () => {
    setEditEntry(null);
    await loadData(activeRange);
    showToast('✅ 工時記錄已更新');
  };

  // ── 刪除記錄（DeleteEntryModal 確認後呼叫） ──────────────
  const handleDeleteConfirmed = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/time-tracking/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || '刪除失敗');
        return;
      }
      setDeleteEntry(null);
      await loadData(activeRange);
      showToast('🗑️ 工時記錄已刪除');
    } catch {
      alert('網路錯誤，請稍後再試');
    }
  };

  // ── 依日期分組 ───────────────────────────────────────────
  const groupByDate = (entries) => {
    const map = new Map();
    for (const e of entries) {
      const key = e.isActive ? todayStr() : e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]));
  };

  // ── 進行中的記錄 ─────────────────────────────────────────
  const activeEntry = entries.find(e => e.isActive);
  const grouped     = groupByDate(entries);

  // ═══════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '0' }}>

      {/* ── 頁面標題列 ─────────────────────────────────── */}
      <div style={{
        background:     'white',
        borderBottom:   '1px solid #e5e7eb',
        padding:        '16px 24px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>
            ⏱️ 工時記錄
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#9ca3af' }}>
            記錄每日工作時間，追蹤任務實際投入
          </p>
        </div>
        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background:   '#f3f4f6',
              color:        '#374151',
              border:       'none',
              borderRadius: '8px',
              padding:      '8px 16px',
              fontSize:     '13px',
              fontWeight:   '500',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
            }}
          >
            ➕ 手動新增
          </button>
          <button
            onClick={() => setShowStartModal(true)}
            disabled={!!activeEntry}
            title={activeEntry ? '已有計時進行中' : '開始計時'}
            style={{
              background:   activeEntry ? '#e5e7eb' : '#3b82f6',
              color:        activeEntry ? '#9ca3af' : 'white',
              border:       'none',
              borderRadius: '8px',
              padding:      '8px 16px',
              fontSize:     '13px',
              fontWeight:   '600',
              cursor:       activeEntry ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
            }}
          >
            ▶ 開始計時
          </button>
        </div>
      </div>

      {/* ── 主要內容區 ─────────────────────────────────── */}
      <div style={{ padding: '20px 24px' }}>

        {/* 統計卡片 */}
        {summary && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <SummaryCard
              icon="☀️"
              label="今日工時"
              value={summary.todayDisplay}
              sub={`${summary.todayMinutes} 分鐘`}
              color="#f59e0b"
            />
            <SummaryCard
              icon="📅"
              label="本週工時"
              value={summary.weekDisplay}
              sub={`${summary.weekMinutes} 分鐘`}
              color="#8b5cf6"
            />
            <SummaryCard
              icon="📊"
              label="本月工時"
              value={summary.monthDisplay}
              sub={`${summary.monthMinutes} 分鐘`}
              color="#3b82f6"
            />
            <SummaryCard
              icon="🔴"
              label="計時進行中"
              value={`${summary.activeCount} 筆`}
              color="#dc2626"
            />
          </div>
        )}

        {/* 計時進行中 Widget */}
        {activeEntry && (
          <ActiveTimerWidget entry={activeEntry} onStop={handleStopTimer} />
        )}

        {/* 日期範圍 Tab */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   '16px',
        }}>
          <div style={{
            display:      'flex',
            background:   'white',
            border:       '1px solid #e5e7eb',
            borderRadius: '8px',
            padding:      '3px',
            gap:          '2px',
          }}>
            {DATE_RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveRange(r.id)}
                style={{
                  background:   activeRange === r.id ? '#3b82f6' : 'transparent',
                  color:        activeRange === r.id ? 'white' : '#6b7280',
                  border:       'none',
                  borderRadius: '6px',
                  padding:      '6px 16px',
                  fontSize:     '13px',
                  fontWeight:   activeRange === r.id ? '600' : '400',
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadData(activeRange)}
            disabled={loading}
            style={{
              background:   'none',
              border:       'none',
              color:        '#9ca3af',
              cursor:       loading ? 'not-allowed' : 'pointer',
              fontSize:     '13px',
              display:      'flex',
              alignItems:   'center',
              gap:          '4px',
            }}
          >
            🔄 {loading ? '載入中...' : '重新整理'}
          </button>
        </div>

        {/* 工時記錄列表 */}
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '200px', color: '#9ca3af', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '32px' }}>⏳</div>
            <div>載入中...</div>
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '200px', color: '#dc2626', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '32px' }}>😢</div>
            <div>{error}</div>
            <button onClick={() => loadData(activeRange)} style={primaryBtnStyle}>重試</button>
          </div>
        ) : grouped.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '200px', color: '#9ca3af', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '40px' }}>📭</div>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#374151' }}>
              {DATE_RANGES.find(r => r.id === activeRange)?.label}沒有工時記錄
            </div>
            <div style={{ fontSize: '13px' }}>
              點擊「開始計時」或「手動新增」來記錄工時
            </div>
          </div>
        ) : (
          grouped.map(([date, dayEntries]) => (
            <DateGroup
              key={date}
              date={date}
              entries={dayEntries}
              onEditRequest={setEditEntry}
              onDeleteRequest={setDeleteEntry}
            />
          ))
        )}
      </div>

      {/* ── 所有 Modal ─────────────────────────────────── */}
      {showStartModal && (
        <StartTimerModal
          tasks={tasks}
          onClose={() => setShowStartModal(false)}
          onSubmit={handleStartTimer}
        />
      )}
      {showAddModal && (
        <ManualAddModal
          tasks={tasks}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleManualAdd}
        />
      )}
      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          tasks={tasks}
          onClose={() => setEditEntry(null)}
          onSaved={handleEditSaved}
        />
      )}
      {deleteEntry && (
        <DeleteEntryModal
          entry={deleteEntry}
          onClose={() => setDeleteEntry(null)}
          onConfirmed={handleDeleteConfirmed}
        />
      )}

      {/* ── Toast 通知 ─────────────────────────────────── */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       28,
          right:        28,
          background:   '#1e293b',
          color:        'white',
          borderRadius: 8,
          padding:      '10px 18px',
          fontSize:     13,
          fontWeight:   600,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
          zIndex:       99999,
          animation:    'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
