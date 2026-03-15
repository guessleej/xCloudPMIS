/**
 * FormsPage — 表單管理
 *
 * Asana Forms-inspired form management page for xCloud PMIS.
 * Features:
 *  ① Left sidebar with project filter and form list
 *  ② Three-tab right panel: Preview, Builder, Settings
 *  ③ New form modal with default fields
 *  ④ localStorage persistence under 'xcloud-forms'
 *  ⑤ POST to tasks API on form submission
 */

import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3010';
const COMPANY_ID = 2;
const LS_KEY = 'xcloud-forms';

// ── Design Tokens ───────────────────────────────────────────
const C = {
  accent:   '#C41230',
  accentDk: '#8B0020',
  accentLt: '#FFF0F2',
  pageBg:   '#F7F2F2',
  white:    '#FFFFFF',
  ink:      '#111827',
  ink2:     '#374151',
  ink3:     '#6B7280',
  ink4:     '#9CA3AF',
  line:     '#E5E7EB',
  lineL:    '#F3F4F6',
  green:    '#16A34A',
  greenLt:  '#F0FDF4',
  amber:    '#D97706',
  amberLt:  '#FFFBEB',
};

// ── Helpers ──────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadForms() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {/* ignore */}
  return null;
}

function saveForms(forms) {
  localStorage.setItem(LS_KEY, JSON.stringify(forms));
}

// ── Seed Data ────────────────────────────────────────────────
const SEED_FORMS = [
  {
    id: 'form-001',
    name: '需求申請單',
    projectId: null,
    projectName: '未分配',
    description: '用於收集內部需求，提交後自動建立任務並分派至對應專案。',
    createdAt: '2026-01-10T08:00:00Z',
    submissionsCount: 14,
    active: true,
    fields: [
      { id: 'f1', type: 'text',     label: '申請人姓名',   placeholder: '請輸入您的姓名',       required: true,  options: [] },
      { id: 'f2', type: 'select',   label: '需求類型',     placeholder: '',                      required: true,  options: ['功能新增', '錯誤修正', '效能優化', '其他'] },
      { id: 'f3', type: 'textarea', label: '需求說明',     placeholder: '請詳細描述您的需求…',  required: true,  options: [] },
      { id: 'f4', type: 'select',   label: '優先等級',     placeholder: '',                      required: true,  options: ['低', '中', '高', '緊急'] },
      { id: 'f5', type: 'date',     label: '期望完成日期', placeholder: '',                      required: false, options: [] },
    ],
  },
  {
    id: 'form-002',
    name: '問題回報表',
    projectId: null,
    projectName: '未分配',
    description: '讓使用者快速回報系統問題，包含重現步驟與環境資訊。',
    createdAt: '2026-02-03T10:30:00Z',
    submissionsCount: 7,
    active: true,
    fields: [
      { id: 'g1', type: 'text',     label: '姓名',         placeholder: '您的姓名',              required: true,  options: [] },
      { id: 'g2', type: 'text',     label: '問題標題',     placeholder: '一句話描述問題',        required: true,  options: [] },
      { id: 'g3', type: 'textarea', label: '詳細描述',     placeholder: '問題內容與重現步驟…',  required: true,  options: [] },
      { id: 'g4', type: 'select',   label: '問題嚴重性',   placeholder: '',                      required: true,  options: ['輕微', '一般', '嚴重', '致命'] },
      { id: 'g5', type: 'text',     label: '作業系統/瀏覽器', placeholder: 'e.g. Windows 11 / Chrome 120', required: false, options: [] },
      { id: 'g6', type: 'checkbox', label: '我已確認這不是已知問題', placeholder: '', required: true, options: [] },
    ],
  },
];

const FIELD_TYPES = [
  { type: 'text',     icon: 'T',  label: '文字單行' },
  { type: 'textarea', icon: '≡',  label: '多行文字' },
  { type: 'select',   icon: '▼',  label: '下拉選單' },
  { type: 'date',     icon: '📅', label: '日期' },
  { type: 'number',   icon: '#',  label: '數字' },
  { type: 'checkbox', icon: '☑',  label: '核取方塊' },
];

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

// ── Toast ────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === 'success' ? C.green : C.accent;

  return (
    <div style={{
      position: 'fixed', bottom: 32, right: 32, zIndex: 9999,
      background: bg, color: '#fff',
      padding: '12px 20px', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 14, fontWeight: 500,
      animation: 'fadeUp 0.25s ease',
    }}>
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
      <button onClick={onClose} style={{
        background: 'transparent', border: 'none', color: '#fff',
        cursor: 'pointer', fontSize: 16, marginLeft: 8, lineHeight: 1,
      }}>×</button>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────
function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${C.lineL}`,
      borderTopColor: C.accent,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
    }} />
  );
}

// ── Badge ────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, lineHeight: '18px',
      color: color || C.ink3,
      background: bg || C.lineL,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// ── ActiveToggle ─────────────────────────────────────────────
function ActiveToggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? C.green : C.ink4,
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: 3, left: value ? 23 : 3,
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

// ── FormCard (sidebar) ────────────────────────────────────────
function FormCard({ form, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: selected ? C.accentLt : C.white,
        border: `1.5px solid ${selected ? C.accent : C.line}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: form.active ? C.green : C.ink4,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 13, fontWeight: 600, color: C.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>{form.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {form.projectName && (
          <Badge
            label={form.projectName}
            color={C.accent}
            bg={C.accentLt}
          />
        )}
        <span style={{ fontSize: 11, color: C.ink4, marginLeft: 'auto' }}>
          {form.submissionsCount} 次提交
        </span>
      </div>
    </div>
  );
}

// ── FieldTypeIcon ─────────────────────────────────────────────
function FieldTypeIcon({ type }) {
  const def = FIELD_TYPES.find(f => f.type === type) || FIELD_TYPES[0];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 6,
      background: C.lineL, color: C.ink3,
      fontSize: 12, fontWeight: 700, flexShrink: 0,
    }}>{def.icon}</span>
  );
}

// ── Preview Tab ───────────────────────────────────────────────
function PreviewTab({ form, onToast }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(fieldId, value) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.projectId) {
      onToast('此表單尚未綁定專案，無法建立任務', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const labeledAnswers = {};
      form.fields.forEach(f => {
        labeledAnswers[f.label] = answers[f.id] || '';
      });
      const res = await fetch(`${API}/api/projects/${form.projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `表單提交：${form.name}`,
          description: JSON.stringify(labeledAnswers, null, 2),
          status: 'todo',
          priority: 'medium',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnswers({});
      onToast('表單已成功提交，任務已建立！');
    } catch (err) {
      onToast(`提交失敗：${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Form header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDk} 100%)`,
        borderRadius: 12, padding: '28px 32px', marginBottom: 24, color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{form.name}</h2>
        {form.description && (
          <p style={{ margin: 0, fontSize: 14, opacity: 0.85, lineHeight: 1.6 }}>{form.description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {form.fields.map(field => (
          <div key={field.id} style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: C.ink2, marginBottom: 6,
            }}>
              {field.label}
              {field.required && <span style={{ color: C.accent, marginLeft: 4 }}>*</span>}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                placeholder={field.placeholder}
                value={answers[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                required={field.required}
                style={inputStyle}
              />
            )}
            {field.type === 'number' && (
              <input
                type="number"
                placeholder={field.placeholder}
                value={answers[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                required={field.required}
                style={inputStyle}
              />
            )}
            {field.type === 'date' && (
              <input
                type="date"
                value={answers[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                required={field.required}
                style={inputStyle}
              />
            )}
            {field.type === 'textarea' && (
              <textarea
                placeholder={field.placeholder}
                value={answers[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                required={field.required}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            )}
            {field.type === 'select' && (
              <select
                value={answers[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
                required={field.required}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">請選擇…</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
            {field.type === 'checkbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!answers[field.id]}
                  onChange={e => handleChange(field.id, e.target.checked)}
                  required={field.required}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: C.accent }}
                />
                <span style={{ fontSize: 14, color: C.ink2 }}>{field.placeholder || field.label}</span>
              </label>
            )}
          </div>
        ))}

        {form.fields.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 0', color: C.ink4,
            fontSize: 14,
          }}>
            此表單尚無欄位，請至「編輯欄位」頁新增。
          </div>
        )}

        {form.fields.length > 0 && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.line}` }}>
            <button
              type="submit"
              disabled={submitting}
              style={primaryBtnStyle(submitting)}
            >
              {submitting ? <Spinner size={16} /> : null}
              {submitting ? '提交中…' : '提交表單'}
            </button>
            {!form.projectId && (
              <p style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>
                ⚠ 此表單未綁定專案，提交後不會建立任務。
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

// ── Builder Tab ───────────────────────────────────────────────
function BuilderTab({ form, onSave, onToast }) {
  const [fields, setFields] = useState(form.fields.map(f => ({ ...f })));
  const [addingField, setAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [newField, setNewField] = useState({
    type: 'text', label: '', placeholder: '', required: false,
    options: [],
  });
  const [optionsInput, setOptionsInput] = useState('');

  // sync when form changes
  useEffect(() => {
    setFields(form.fields.map(f => ({ ...f })));
    setAddingField(false);
    setEditingFieldId(null);
  }, [form.id]);

  function startAddField() {
    setNewField({ type: 'text', label: '', placeholder: '', required: false, options: [] });
    setOptionsInput('');
    setAddingField(true);
    setEditingFieldId(null);
  }

  function cancelAdd() {
    setAddingField(false);
  }

  function confirmAdd() {
    if (!newField.label.trim()) {
      onToast('請輸入欄位名稱', 'error');
      return;
    }
    const opts = newField.type === 'select'
      ? optionsInput.split('\n').map(s => s.trim()).filter(Boolean)
      : [];
    const field = { ...newField, id: genId(), options: opts };
    setFields(prev => [...prev, field]);
    setAddingField(false);
  }

  function deleteField(id) {
    setFields(prev => prev.filter(f => f.id !== id));
  }

  function moveField(id, dir) {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function startEditField(field) {
    setEditingFieldId(field.id);
    setNewField({ ...field });
    setOptionsInput(field.options.join('\n'));
    setAddingField(false);
  }

  function confirmEdit() {
    if (!newField.label.trim()) {
      onToast('請輸入欄位名稱', 'error');
      return;
    }
    const opts = newField.type === 'select'
      ? optionsInput.split('\n').map(s => s.trim()).filter(Boolean)
      : [];
    setFields(prev => prev.map(f =>
      f.id === editingFieldId ? { ...newField, id: f.id, options: opts } : f
    ));
    setEditingFieldId(null);
  }

  function cancelEdit() {
    setEditingFieldId(null);
  }

  function handleSave() {
    onSave({ ...form, fields });
    onToast('欄位設定已儲存！');
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>
          欄位清單 <span style={{ color: C.ink4, fontWeight: 400, fontSize: 13 }}>（{fields.length} 個）</span>
        </h3>
        <button onClick={startAddField} style={outlineBtnStyle} disabled={addingField}>
          + 新增欄位
        </button>
      </div>

      {/* Field list */}
      {fields.length === 0 && !addingField && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.ink4, fontSize: 14 }}>
          尚無欄位，點擊「新增欄位」開始。
        </div>
      )}

      {fields.map((field, idx) => (
        <div key={field.id}>
          {/* Edit mode */}
          {editingFieldId === field.id ? (
            <FieldEditor
              field={newField}
              optionsInput={optionsInput}
              onChange={setNewField}
              onOptionsChange={setOptionsInput}
              onConfirm={confirmEdit}
              onCancel={cancelEdit}
              title="編輯欄位"
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: C.white, borderRadius: 10,
              border: `1px solid ${C.line}`,
              marginBottom: 8,
            }}>
              {/* Drag handle (visual only) */}
              <div style={{ cursor: 'grab', color: C.ink4, fontSize: 14, lineHeight: 1, userSelect: 'none' }}>
                ⣿
              </div>

              <FieldTypeIcon type={field.type} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                  {field.label}
                  {field.required && <span style={{ color: C.accent, marginLeft: 4, fontSize: 11 }}>必填</span>}
                </div>
                <div style={{ fontSize: 11, color: C.ink4 }}>
                  {FIELD_TYPES.find(f => f.type === field.type)?.label}
                  {field.type === 'select' && field.options.length > 0 && (
                    <span style={{ marginLeft: 6 }}>· {field.options.length} 個選項</span>
                  )}
                </div>
              </div>

              {/* Move buttons */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => moveField(field.id, -1)}
                  disabled={idx === 0}
                  style={iconBtnStyle(idx === 0)}
                  title="上移"
                >↑</button>
                <button
                  onClick={() => moveField(field.id, 1)}
                  disabled={idx === fields.length - 1}
                  style={iconBtnStyle(idx === fields.length - 1)}
                  title="下移"
                >↓</button>
                <button
                  onClick={() => startEditField(field)}
                  style={iconBtnStyle(false)}
                  title="編輯"
                >✎</button>
                <button
                  onClick={() => deleteField(field.id)}
                  style={{ ...iconBtnStyle(false), color: C.accent }}
                  title="刪除"
                >✕</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add new field inline */}
      {addingField && (
        <FieldEditor
          field={newField}
          optionsInput={optionsInput}
          onChange={setNewField}
          onOptionsChange={setOptionsInput}
          onConfirm={confirmAdd}
          onCancel={cancelAdd}
          title="新增欄位"
        />
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <button onClick={handleSave} style={primaryBtnStyle(false)}>
          儲存欄位設定
        </button>
      </div>
    </div>
  );
}

// ── FieldEditor (shared add/edit) ─────────────────────────────
function FieldEditor({ field, optionsInput, onChange, onOptionsChange, onConfirm, onCancel, title }) {
  return (
    <div style={{
      background: C.accentLt,
      border: `1.5px solid ${C.accent}`,
      borderRadius: 10, padding: '16px 18px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 14 }}>{title}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Type */}
        <div>
          <label style={labelStyle}>欄位類型</label>
          <select
            value={field.type}
            onChange={e => onChange(f => ({ ...f, type: e.target.value }))}
            style={inputStyle}
          >
            {FIELD_TYPES.map(t => (
              <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
        {/* Label */}
        <div>
          <label style={labelStyle}>欄位名稱 <span style={{ color: C.accent }}>*</span></label>
          <input
            type="text"
            value={field.label}
            onChange={e => onChange(f => ({ ...f, label: e.target.value }))}
            placeholder="例：申請人姓名"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Placeholder */}
      {field.type !== 'checkbox' && field.type !== 'date' && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>提示文字（Placeholder）</label>
          <input
            type="text"
            value={field.placeholder}
            onChange={e => onChange(f => ({ ...f, placeholder: e.target.value }))}
            placeholder="例：請輸入您的姓名"
            style={inputStyle}
          />
        </div>
      )}

      {/* Select options */}
      {field.type === 'select' && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>選項列表（每行一個）</label>
          <textarea
            value={optionsInput}
            onChange={e => onOptionsChange(e.target.value)}
            placeholder={'選項一\n選項二\n選項三'}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      )}

      {/* Required */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={field.required}
          onChange={e => onChange(f => ({ ...f, required: e.target.checked }))}
          style={{ width: 15, height: 15, accentColor: C.accent }}
        />
        <span style={{ fontSize: 13, color: C.ink2 }}>此欄位為必填</span>
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} style={primaryBtnStyle(false)}>確認</button>
        <button onClick={onCancel} style={ghostBtnStyle}>取消</button>
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────
function SettingsTab({ form, projects, onSave, onDelete, onToast }) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description);
  const [projectId, setProjectId] = useState(form.projectId || '');
  const [active, setActive] = useState(form.active);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(form.name);
    setDescription(form.description);
    setProjectId(form.projectId || '');
    setActive(form.active);
    setConfirmDelete(false);
  }, [form.id]);

  const fakeUrl = `https://app.xcloud.io/f/${form.id}`;

  function handleCopy() {
    navigator.clipboard.writeText(fakeUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSave() {
    const selected = projects.find(p => String(p.id) === String(projectId));
    onSave({
      ...form,
      name: name.trim() || form.name,
      description,
      projectId: projectId ? Number(projectId) : null,
      projectName: selected ? selected.name : '未分配',
      active,
    });
    onToast('表單設定已儲存！');
  }

  return (
    <div>
      <div style={{ maxWidth: 560 }}>
        {/* Basic settings */}
        <section style={settingsSectionStyle}>
          <h3 style={settingsHeadingStyle}>基本設定</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>表單名稱 <span style={{ color: C.accent }}>*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>說明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>綁定專案</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">未分配</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}>表單狀態</label>
            <ActiveToggle value={active} onChange={setActive} />
            <span style={{ fontSize: 13, color: active ? C.green : C.ink4, fontWeight: 500 }}>
              {active ? '啟用中' : '已停用'}
            </span>
          </div>
        </section>

        {/* Share link */}
        <section style={settingsSectionStyle}>
          <h3 style={settingsHeadingStyle}>分享連結</h3>
          <p style={{ fontSize: 13, color: C.ink3, margin: '0 0 12px' }}>
            將此連結分享給使用者，他們可直接填寫並提交表單。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={fakeUrl}
              style={{
                ...inputStyle,
                background: C.lineL,
                color: C.ink3,
                flex: 1,
                cursor: 'default',
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                ...outlineBtnStyle,
                minWidth: 72,
                color: copied ? C.green : C.accent,
                borderColor: copied ? C.green : C.accent,
                flexShrink: 0,
              }}
            >
              {copied ? '已複製！' : '複製'}
            </button>
          </div>
        </section>

        {/* Save button */}
        <div style={{ marginBottom: 32 }}>
          <button onClick={handleSave} style={primaryBtnStyle(false)}>
            儲存設定
          </button>
        </div>

        {/* Danger zone */}
        <section style={{
          ...settingsSectionStyle,
          borderColor: '#FECACA',
          background: '#FFF5F5',
        }}>
          <h3 style={{ ...settingsHeadingStyle, color: C.accent }}>危險區域</h3>
          <p style={{ fontSize: 13, color: C.ink3, margin: '0 0 14px' }}>
            刪除後無法復原，所有欄位與提交記錄將一併移除。
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                ...outlineBtnStyle,
                color: C.accent,
                borderColor: C.accent,
              }}
            >
              刪除此表單
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.ink2 }}>確定要刪除「{form.name}」嗎？</span>
              <button
                onClick={() => onDelete(form.id)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: C.accent, color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                確定刪除
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={ghostBtnStyle}
              >
                取消
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── NewFormModal ──────────────────────────────────────────────
function NewFormModal({ projects, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');

  function handleCreate() {
    if (!name.trim()) return;
    const selected = projects.find(p => String(p.id) === String(projectId));
    const newForm = {
      id: `form-${genId()}`,
      name: name.trim(),
      projectId: projectId ? Number(projectId) : null,
      projectName: selected ? selected.name : '未分配',
      description,
      createdAt: new Date().toISOString(),
      submissionsCount: 0,
      active: true,
      fields: [
        { id: genId(), type: 'text',     label: '姓名',     placeholder: '請輸入您的姓名',   required: true,  options: [] },
        { id: genId(), type: 'textarea', label: '請求說明', placeholder: '請詳細描述您的請求…', required: true, options: [] },
        { id: genId(), type: 'select',   label: '優先等級', placeholder: '',                  required: false, options: ['低', '中', '高', '緊急'] },
      ],
    };
    onCreate(newForm);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: C.white, borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>新增表單</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: C.ink4 }}>建立後將自動新增三個預設欄位</p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.ink4, fontSize: 22, lineHeight: 1,
            padding: '0 4px',
          }}>×</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>表單名稱 <span style={{ color: C.accent }}>*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：客戶需求收集表"
              autoFocus
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>說明（選填）</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="簡述此表單的用途…"
              rows={2}
              style={{ ...inputStyle, resize: 'none' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>綁定專案（選填）</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">未分配</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              style={primaryBtnStyle(!name.trim())}
            >
              建立表單
            </button>
            <button onClick={onClose} style={ghostBtnStyle}>取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared style helpers
// ═══════════════════════════════════════════════════════════════
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 8,
  border: `1.5px solid ${C.line}`,
  fontSize: 13, color: C.ink,
  outline: 'none',
  background: C.white,
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: 12, fontWeight: 600,
  color: C.ink3, marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

function primaryBtnStyle(disabled) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 22px', borderRadius: 8,
    border: 'none',
    background: disabled ? C.lineL : `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDk} 100%)`,
    color: disabled ? C.ink4 : '#fff',
    fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s',
    boxShadow: disabled ? 'none' : '0 2px 8px rgba(196,18,48,0.25)',
  };
}

const outlineBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', borderRadius: 8,
  border: `1.5px solid ${C.accent}`, background: 'transparent',
  color: C.accent, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', transition: 'all 0.15s',
};

const ghostBtnStyle = {
  display: 'inline-flex', alignItems: 'center',
  padding: '8px 18px', borderRadius: 8,
  border: `1.5px solid ${C.line}`, background: 'transparent',
  color: C.ink3, fontSize: 13, fontWeight: 500,
  cursor: 'pointer',
};

function iconBtnStyle(disabled) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    border: `1px solid ${C.line}`,
    background: disabled ? C.lineL : C.white,
    color: disabled ? C.ink4 : C.ink2,
    fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s', opacity: disabled ? 0.45 : 1,
  };
}

const settingsSectionStyle = {
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 12, padding: '20px 20px',
  marginBottom: 20,
};

const settingsHeadingStyle = {
  margin: '0 0 16px', fontSize: 14,
  fontWeight: 700, color: C.ink,
};

// ═══════════════════════════════════════════════════════════════
// Main FormsPage
// ═══════════════════════════════════════════════════════════════
export default function FormsPage() {
  const [forms, setForms] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'builder' | 'settings'
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState(null); // { message, type }

  // ── Load forms from localStorage ──────────────────────────
  useEffect(() => {
    const stored = loadForms();
    const initial = stored || SEED_FORMS;
    setForms(initial);
    if (initial.length > 0) setSelectedFormId(initial[0].id);
    if (!stored) saveForms(SEED_FORMS);
  }, []);

  // ── Fetch projects from API ───────────────────────────────
  useEffect(() => {
    setProjectsLoading(true);
    fetch(`${API}/api/projects?companyId=${COMPANY_ID}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const list = Array.isArray(data) ? data : (data.projects || data.data || []);
        setProjects(list);
      })
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, []);

  // ── Derived state ─────────────────────────────────────────
  const filteredForms = filterProjectId
    ? forms.filter(f => String(f.projectId) === String(filterProjectId))
    : forms;

  const selectedForm = forms.find(f => f.id === selectedFormId) || null;

  // ── Handlers ──────────────────────────────────────────────
  function handleUpdateForm(updated) {
    const next = forms.map(f => f.id === updated.id ? updated : f);
    setForms(next);
    saveForms(next);
  }

  function handleDeleteForm(id) {
    const next = forms.filter(f => f.id !== id);
    setForms(next);
    saveForms(next);
    setSelectedFormId(next.length > 0 ? next[0].id : null);
    showToast('表單已刪除');
  }

  function handleCreateForm(newForm) {
    const next = [newForm, ...forms];
    setForms(next);
    saveForms(next);
    setSelectedFormId(newForm.id);
    setShowNewModal(false);
    setActiveTab('preview');
    showToast('新表單已建立！');
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  const TABS = [
    { id: 'preview',  label: '預覽' },
    { id: 'builder',  label: '編輯欄位' },
    { id: 'settings', label: '設定' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* CSS keyframes via style tag */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: ${C.accent} !important;
          box-shadow: 0 0 0 3px rgba(196,18,48,0.12);
        }
        button:active { transform: scale(0.97); }
      `}</style>

      {/* ── Page Header ──────────────────────────────────────── */}
      <div style={{
        background: C.white,
        borderBottom: `1px solid ${C.line}`,
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDk})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18,
          }}>
            ⬜
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>
              表單管理
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: C.ink4 }}>
              標準化請求入口 · 提交即建任務
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          style={primaryBtnStyle(false)}
        >
          + 新增表單
        </button>
      </div>

      {/* ── Body: sidebar + main ───────────────────────────── */}
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* Left Sidebar */}
        <div style={{
          width: 240, flexShrink: 0,
          background: C.white,
          borderRight: `1px solid ${C.line}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Project filter */}
          <div style={{ padding: '16px 14px 8px', borderBottom: `1px solid ${C.lineL}` }}>
            <label style={{ ...labelStyle, marginBottom: 6 }}>依專案篩選</label>
            {projectsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <Spinner size={18} />
              </div>
            ) : (
              <select
                value={filterProjectId}
                onChange={e => setFilterProjectId(e.target.value)}
                style={{ ...inputStyle, fontSize: 12 }}
              >
                <option value="">全部表單</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Form list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
            {filteredForms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 12px', color: C.ink4, fontSize: 12 }}>
                {filterProjectId ? '此專案尚無表單' : '尚無表單'}
              </div>
            ) : (
              filteredForms.map(form => (
                <FormCard
                  key={form.id}
                  form={form}
                  selected={form.id === selectedFormId}
                  onClick={() => {
                    setSelectedFormId(form.id);
                    setActiveTab('preview');
                  }}
                />
              ))
            )}
          </div>

          {/* Add form link */}
          <div style={{
            padding: '12px 14px',
            borderTop: `1px solid ${C.lineL}`,
          }}>
            <button
              onClick={() => setShowNewModal(true)}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                border: `1.5px dashed ${C.line}`,
                background: 'transparent', color: C.ink4,
                fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              + 新增表單
            </button>
          </div>
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedForm ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: C.ink4,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.ink3, margin: '0 0 8px' }}>
                選擇一個表單開始
              </p>
              <p style={{ fontSize: 13, color: C.ink4, margin: 0 }}>
                或點擊「新增表單」建立第一個表單
              </p>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div style={{
                background: C.white,
                borderBottom: `1px solid ${C.line}`,
                padding: '0 32px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {/* Form meta */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedForm.name}
                  </span>
                  <Badge
                    label={selectedForm.active ? '啟用' : '停用'}
                    color={selectedForm.active ? C.green : C.ink4}
                    bg={selectedForm.active ? C.greenLt : C.lineL}
                  />
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: '18px 16px 16px',
                        border: 'none', background: 'transparent',
                        fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                        color: activeTab === tab.id ? C.accent : C.ink3,
                        cursor: 'pointer',
                        borderBottom: `2px solid ${activeTab === tab.id ? C.accent : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
                {activeTab === 'preview' && (
                  <div style={{ maxWidth: 600 }}>
                    <PreviewTab
                      form={selectedForm}
                      onToast={showToast}
                    />
                  </div>
                )}
                {activeTab === 'builder' && (
                  <div style={{ maxWidth: 660 }}>
                    <BuilderTab
                      form={selectedForm}
                      onSave={handleUpdateForm}
                      onToast={showToast}
                    />
                  </div>
                )}
                {activeTab === 'settings' && (
                  <SettingsTab
                    form={selectedForm}
                    projects={projects}
                    onSave={handleUpdateForm}
                    onDelete={handleDeleteForm}
                    onToast={showToast}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Form Modal */}
      {showNewModal && (
        <NewFormModal
          projects={projects}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreateForm}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
