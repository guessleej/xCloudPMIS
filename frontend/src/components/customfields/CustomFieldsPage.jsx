import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useResponsive';
import { usePermissions } from '../../hooks/usePermissions';

const BRAND = {
  crimson:      '#C70018',
  crimsonDeep:  '#6E0615',
  crimsonNight: '#161112',
  ink:    'var(--xc-text)',
  carbon: 'var(--xc-text-soft)',
  muted:  'var(--xc-text-muted)',
  paper:  'var(--xc-bg)',
  mist:   'var(--xc-border)',
  silver: 'var(--xc-border-strong)',
  surface:      'var(--xc-surface)',
  surfaceSoft:  'var(--xc-surface-soft)',
  surfaceMuted: 'var(--xc-surface-muted)',
  white:  'var(--xc-surface-strong)',
  accentSoft:    'color-mix(in srgb, #C70018 12%, var(--xc-surface-soft))',
  accentSurface: 'color-mix(in srgb, #C70018  8%, var(--xc-surface))',
  accentBorder:  'color-mix(in srgb, #C70018 28%, var(--xc-border))',
  heroBg: 'linear-gradient(135deg, #161112 0%, #6E0615 44%, #C70018 100%)',
  success: 'var(--xc-success)',
  warning: 'var(--xc-warning)',
  danger:  'var(--xc-danger)',
  info:    'var(--xc-info)',
};

const btnPrimary = { padding:'7px 16px', borderRadius:7, border:'none', background:BRAND.crimson, color:'#fff', fontSize: 15, fontWeight:600, cursor:'pointer' };
const btnGhost   = { padding:'7px 16px', borderRadius:7, border:`1px solid ${BRAND.silver}`, background:'transparent', color:BRAND.carbon, fontSize: 15, cursor:'pointer' };

const TYPE_LABEL = {
  text:          '文字型',
  number:        '數字型',
  currency:      '金額型',
  percent:       '百分比',
  date:          '日期型',
  datetime:      '日期時間',
  single_select: '下拉選單',
  multi_select:  '多選選單',
  checkbox:      '核取方塊',
  people:        '成員選取',
  select:        '下拉選單',
  member:        '成員選取',
};

const SCOPE_LABEL = { task:'任務', project:'專案' };

const FIELD_TYPES = [
  { key:'text',          label:'文字',   desc:'單行或多行文字輸入' },
  { key:'number',        label:'數字',   desc:'整數或小數數值' },
  { key:'currency',      label:'金額',   desc:'貨幣金額格式' },
  { key:'date',          label:'日期',   desc:'日期選擇器' },
  { key:'single_select', label:'下拉',   desc:'單選下拉選單' },
  { key:'checkbox',      label:'核取',   desc:'是 / 否 核取方塊' },
  { key:'people',        label:'成員',   desc:'指派給特定成員' },
];

const TH_STYLE = { fontSize: 13, fontWeight:600, color:BRAND.muted, textTransform:'uppercase', letterSpacing:'0.05em' };

export default function CustomFieldsPage() {
  const isMobile = useIsMobile();
  const { user, authFetch } = useAuth();
  const { canManageFields } = usePermissions();

  const [fields,     setFields]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editField,  setEditField]  = useState(null);
  const [form,       setForm]       = useState({ name:'', type:'text', scope:'task', required:false });

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const res  = await authFetch(`/api/custom-fields?companyId=${user.companyId}`);
      const json = await res.json();
      if (json.success) {
        setFields(json.data || []);
      }
    } catch (e) {
      console.error('[CustomFieldsPage load]', e);
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => { load(); }, [load]);

  const taskCount    = fields.filter(f => f.entityType === 'task'    || f.scope === 'task').length;
  const projectCount = fields.filter(f => f.entityType === 'project' || f.scope === 'project').length;

  const kpis = [
    { label:'欄位總數',   value: fields.length },
    { label:'任務欄位',   value: taskCount },
    { label:'專案欄位',   value: projectCount },
  ];

  function openAdd() {
    setEditField(null);
    setForm({ name:'', type:'text', scope:'task', required:false });
    setShowModal(true);
  }

  function openEdit(field) {
    setEditField(field);
    setForm({
      name:     field.name,
      type:     field.fieldType || field.type,
      scope:    field.entityType || field.scope,
      required: field.isRequired || field.required || false,
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    try {
      if (editField) {
        await authFetch(`/api/custom-fields/${editField.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            companyId:  user.companyId,
            name:       form.name,
            fieldType:  form.type,
            entityType: form.scope,
            isRequired: form.required,
          }),
        });
      } else {
        await authFetch('/api/custom-fields', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            companyId:  user.companyId,
            name:       form.name,
            fieldType:  form.type,
            entityType: form.scope,
            isRequired: form.required,
          }),
        });
      }
      setShowModal(false);
      await load();
    } catch (e) {
      console.error('[CustomFieldsPage handleSubmit]', e);
    }
  }

  async function deleteField(id) {
    try {
      await authFetch(`/api/custom-fields/${id}?companyId=${user.companyId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('[CustomFieldsPage deleteField]', e);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:BRAND.paper, fontFamily:'inherit' }}>
      {/* Hero */}
      <div style={{ background:BRAND.heroBg, padding: isMobile ? '14px 16px 12px' : '28px 32px 24px', color:'#fff' }}>
        <div style={{ fontSize: 13, fontWeight:600, letterSpacing:'0.1em', opacity:0.6, textTransform:'uppercase', marginBottom:8 }}>
          custom fields
        </div>
        <h1 style={{ fontSize: 28, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.02em' }}>自訂欄位</h1>
        <p style={{ fontSize: 15, opacity:0.7, margin:0 }}>為任務與專案新增自訂資料欄位，擴充系統預設屬性</p>
        <div style={{ display:'flex', gap:32, marginTop:20 }}>
          {kpis.map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 26, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize: 13, opacity:0.6, marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? '14px 16px' : '24px 32px' }}>
        {/* Field type legend */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:16, padding:'14px 20px', background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, marginBottom:20 }}>
          {FIELD_TYPES.map(ft => (
            <div key={ft.key} style={{ display:'flex', alignItems:'baseline', gap:6 }}>
              <span style={{ fontSize: 14, fontWeight:600, color:BRAND.ink }}>{ft.label}</span>
              <span style={{ fontSize: 13, color:BRAND.muted }}>{ft.desc}</span>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontSize: 16, fontWeight:600, color:BRAND.ink }}>欄位列表</div>
          {canManageFields && <button style={btnPrimary} onClick={openAdd}>+ 新增欄位</button>}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>載入中…</div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{ background:BRAND.white, borderRadius:10, border:`1px solid ${BRAND.mist}`, overflowX:'auto' }}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 110px 90px 60px 110px 100px',
              padding:'10px 16px', borderBottom:`1px solid ${BRAND.mist}`,
              background:BRAND.surfaceSoft, gap:8, alignItems:'center',
            }}>
              {['欄位名稱','類型','套用範圍','必填','建立日期','操作'].map(h => (
                <span key={h} style={TH_STYLE}>{h}</span>
              ))}
            </div>

            {fields.length === 0 && (
              <div style={{ padding:'40px 16px', textAlign:'center', color:BRAND.muted, fontSize: 15 }}>尚無自訂欄位</div>
            )}

            {fields.map((f, idx) => {
              const fieldType   = f.fieldType || f.type;
              const entityType  = f.entityType || f.scope;
              const isRequired  = f.isRequired || f.required;
              const createdDate = f.createdAt ? new Date(f.createdAt).toLocaleDateString('zh-TW') : '—';

              return (
                <div
                  key={f.id}
                  style={{
                    display:'grid', gridTemplateColumns:'1fr 110px 90px 60px 110px 100px',
                    padding:'13px 16px',
                    borderBottom: idx < fields.length - 1 ? `1px solid ${BRAND.mist}` : 'none',
                    gap:8, alignItems:'center', transition:'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = BRAND.surfaceSoft}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 15, color:BRAND.ink, fontWeight:500 }}>{f.name}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon }}>{TYPE_LABEL[fieldType] || fieldType}</span>
                  <span style={{ fontSize: 14, color:BRAND.carbon }}>{SCOPE_LABEL[entityType] || entityType}</span>
                  <span style={{ fontSize: 15, fontWeight:600, color: isRequired ? BRAND.crimson : BRAND.muted }}>
                    {isRequired ? '是' : '否'}
                  </span>
                  <span style={{ fontSize: 14, color:BRAND.muted }}>{createdDate}</span>
                  <span style={{ display:'flex', gap:10 }}>
                    {canManageFields && <button onClick={() => openEdit(f)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.carbon, padding:0 }}>編輯</button>}
                    {canManageFields && <button onClick={() => deleteField(f.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize: 14, color:BRAND.muted, padding:0 }}>刪除</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:BRAND.white, borderRadius:12, padding: isMobile ? '14px 16px' : '28px 32px', width:480, maxWidth:'90vw' }}>
            <h2 style={{ fontSize: 20, fontWeight:700, margin:'0 0 20px', color:BRAND.ink }}>
              {editField ? '編輯欄位' : '新增欄位'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                欄位名稱
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='輸入欄位名稱'
                  style={{ display:'block', marginTop:5, width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                />
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                欄位類型
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  {FIELD_TYPES.map(ft => <option key={ft.key} value={ft.key}>{ft.label}（{TYPE_LABEL[ft.key]}）</option>)}
                </select>
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon }}>
                套用範圍
                <select
                  value={form.scope}
                  onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}
                  style={{ display:'block', marginTop:5, width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${BRAND.silver}`, fontSize: 15, background:BRAND.surface, color:BRAND.ink }}
                >
                  <option value='task'>任務</option>
                  <option value='project'>專案</option>
                </select>
              </label>

              <label style={{ fontSize: 14, fontWeight:600, color:BRAND.carbon, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input
                  type='checkbox'
                  checked={form.required}
                  onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                  style={{ width:14, height:14, cursor:'pointer', accentColor:BRAND.crimson }}
                />
                必填欄位
              </label>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:24 }}>
              <button style={btnGhost} onClick={() => setShowModal(false)}>取消</button>
              <button style={btnPrimary} onClick={handleSubmit}>{editField ? '儲存變更' : '建立欄位'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
