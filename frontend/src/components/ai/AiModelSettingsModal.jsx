/**
 * AiModelSettingsModal.jsx
 * ─────────────────────────────────────────────────────────────
 * AI 模型設定 Modal
 *
 * 功能：
 *   - 選擇 AI 服務供應商（OpenAI / Azure / Ollama / LM Studio / Groq / 自訂）
 *   - 設定 API Base URL、API Key、Heavy Model、Light Model、Max Tokens、Temperature
 *   - 「測試連線」按鈕，即時驗證設定是否可用
 *   - 儲存後自動清除後端 30s 設定快取
 *
 * Props:
 *   open       {boolean}   控制顯示/隱藏
 *   onClose    {function}  關閉 callback
 *   companyId  {number}    公司 ID（預設 2）
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── 供應商預設清單 ──────────────────────────────────────────
const PROVIDERS = [
  {
    id:         'openai',
    label:      'OpenAI',
    baseUrl:    'https://api.openai.com/v1',
    models:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    heavy:      'gpt-4o',
    light:      'gpt-4o-mini',
    keyHint:    'sk-...',
    docsUrl:    'https://platform.openai.com/api-keys',
    color:      '#10A37F',
  },
  {
    id:         'azure',
    label:      'Azure OpenAI',
    baseUrl:    'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
    models:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    heavy:      'gpt-4o',
    light:      'gpt-4o-mini',
    keyHint:    '請輸入 Azure API Key',
    docsUrl:    'https://azure.microsoft.com/products/ai-services/openai-service',
    color:      '#0078D4',
  },
  {
    id:         'groq',
    label:      'Groq（超快推理）',
    baseUrl:    'https://api.groq.com/openai/v1',
    models:     ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    heavy:      'llama-3.1-70b-versatile',
    light:      'llama-3.1-8b-instant',
    keyHint:    'gsk_...',
    docsUrl:    'https://console.groq.com/keys',
    color:      '#F55036',
  },
  {
    id:         'ollama',
    label:      'Ollama（本地端）',
    baseUrl:    'http://host.docker.internal:11434/v1',  // Docker→Host；純本地開發用 localhost
    altUrl:     'http://localhost:11434/v1',              // 非 Docker 環境備用
    models:     ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'codellama', 'deepseek-r1'],
    heavy:      'llama3.1',
    light:      'llama3.2',
    keyHint:    '本地端不需要 API Key（可留空或填任意字元）',
    docsUrl:    'https://ollama.com',
    color:      '#333333',
  },
  {
    id:         'lmstudio',
    label:      'LM Studio（本地端）',
    baseUrl:    'http://host.docker.internal:1234/v1',   // Docker→Host；純本地開發用 localhost
    altUrl:     'http://localhost:1234/v1',
    models:     ['（輸入已載入的模型名稱）'],
    heavy:      '',
    light:      '',
    keyHint:    '本地端不需要 API Key（可留空）',
    docsUrl:    'https://lmstudio.ai',
    color:      '#7B61FF',
  },
  {
    id:         'custom',
    label:      '自訂（OpenAI 相容）',
    baseUrl:    '',
    models:     [],
    heavy:      '',
    light:      '',
    keyHint:    '請輸入對應的 API Key',
    docsUrl:    null,
    color:      '#6B7280',
  },
];

// ── API 呼叫輔助 ────────────────────────────────────────────
const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3010';

async function fetchAiSettings(companyId) {
  const res = await fetch(`${API_BASE}/api/settings/ai?companyId=${companyId}`);
  if (!res.ok) throw new Error(`取得設定失敗：HTTP ${res.status}`);
  return res.json();
}

async function saveAiSettings(payload) {
  const res = await fetch(`${API_BASE}/api/settings/ai`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 顯示後端詳細錯誤（details 欄位）
    throw new Error(body.details || body.error || `儲存失敗：HTTP ${res.status}`);
  }
  return body;
}

async function fetchOllamaModels(baseUrl) {
  const url = `${API_BASE}/api/settings/ai/ollama-models?baseUrl=${encodeURIComponent(baseUrl)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  return res.json();
}

async function testAiConnection(payload) {
  const res = await fetch(`${API_BASE}/api/settings/ai/test`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return res.json();   // 測試端點一律回傳 200（錯誤資訊在 body 內）
}

// ── 主元件 ──────────────────────────────────────────────────
export default function AiModelSettingsModal({ open, onClose, companyId = 2 }) {
  // ── 表單狀態 ──────────────────────────────────────────────
  const [provider,     setProvider]     = useState('openai');
  const [baseUrl,      setBaseUrl]      = useState('https://api.openai.com/v1');
  const [apiKey,       setApiKey]       = useState('');
  const [showKey,      setShowKey]      = useState(false);
  const [modelHeavy,   setModelHeavy]   = useState('gpt-4o');
  const [modelLight,   setModelLight]   = useState('gpt-4o-mini');
  const [maxTokens,    setMaxTokens]    = useState(2000);
  const [temperature,  setTemperature]  = useState(0.3);

  // ── UI 狀態 ───────────────────────────────────────────────
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState(null);
  const [error,         setError]         = useState(null);
  const [saved,         setSaved]         = useState(false);
  const [ollamaModels,  setOllamaModels]  = useState([]);    // Ollama 可用模型清單
  const [loadingModels, setLoadingModels] = useState(false); // 載入 Ollama 模型中

  const currentProvider = PROVIDERS.find(p => p.id === provider) || PROVIDERS[PROVIDERS.length - 1];

  // ── 載入現有設定 ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setTestResult(null);
    setSaved(false);

    fetchAiSettings(companyId)
      .then(({ config }) => {
        // 根據 baseUrl 推斷供應商
        const matched = PROVIDERS.find(p => p.baseUrl && config.baseUrl?.startsWith(p.baseUrl.split('<')[0]));
        setProvider(matched?.id || (config.provider || 'custom'));
        setBaseUrl(config.baseUrl    || '');
        setApiKey(config.apiKey      || '');
        setModelHeavy(config.modelHeavy || 'gpt-4o');
        setModelLight(config.modelLight || 'gpt-4o-mini');
        setMaxTokens(config.maxTokens   || 2000);
        setTemperature(config.temperature ?? 0.3);
      })
      .catch(err => setError('載入設定失敗：' + err.message))
      .finally(() => setLoading(false));
  }, [open, companyId]);

  // ── 切換供應商時自動填入預設值 ───────────────────────────
  const handleProviderChange = useCallback((pid) => {
    setProvider(pid);
    setTestResult(null);
    setOllamaModels([]);
    const p = PROVIDERS.find(x => x.id === pid);
    if (!p) return;
    if (p.baseUrl) setBaseUrl(p.baseUrl);
    if (p.heavy)   setModelHeavy(p.heavy);
    if (p.light)   setModelLight(p.light);
  }, []);

  // ── 載入 Ollama 可用模型 ──────────────────────────────────
  const handleLoadOllamaModels = useCallback(async () => {
    setLoadingModels(true);
    setOllamaModels([]);
    try {
      const result = await fetchOllamaModels(baseUrl);
      if (result.models?.length > 0) {
        setOllamaModels(result.models);
        // 自動填入第一個可用模型（若目前欄位是預設值或空值）
        const defaultHeavy = ['llama3.1', 'llama3.2', ''];
        if (defaultHeavy.includes(modelHeavy)) setModelHeavy(result.models[0].name);
        if (defaultHeavy.includes(modelLight)) setModelLight(result.models[result.models.length > 1 ? 1 : 0].name);
      } else {
        setError(result.error || 'Ollama 目前沒有已下載的模型，請先執行 ollama pull <model>');
      }
    } catch (err) {
      setError('載入 Ollama 模型失敗：' + err.message);
    } finally {
      setLoadingModels(false);
    }
  }, [baseUrl, modelHeavy, modelLight]);

  // ── 測試連線 ──────────────────────────────────────────────
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAiConnection({
        companyId,
        baseUrl:   baseUrl || null,
        apiKey:    apiKey  || '',
        modelHeavy,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }, [companyId, baseUrl, apiKey, modelHeavy]);

  // ── 儲存設定 ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAiSettings({
        companyId,
        provider,
        baseUrl:     baseUrl   || null,
        apiKey:      apiKey    || '',
        modelHeavy,
        modelLight,
        maxTokens:   Number(maxTokens),
        temperature: Number(temperature),
      });
      setSaved(true);
      // 儲存成功後 1 秒自動收起面板
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError('儲存失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  }, [companyId, provider, baseUrl, apiKey, modelHeavy, modelLight, maxTokens, temperature, onClose]);

  if (!open) return null;

  // ── 渲染 ──────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="text-lg font-semibold text-white">AI 模型設定</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                支援 OpenAI、Azure、Groq、Ollama 及任何 OpenAI 相容 API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>載入設定中⋯</span>
            </div>
          )}

          {!loading && (
            <>
              {/* 供應商選擇 */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  服務供應商
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleProviderChange(p.id)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                      style={{
                        background: provider === p.id
                          ? `${p.color}25`
                          : 'rgba(255,255,255,0.04)',
                        border: provider === p.id
                          ? `1px solid ${p.color}60`
                          : '1px solid rgba(255,255,255,0.08)',
                        color: provider === p.id ? '#fff' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: p.color, boxShadow: provider === p.id ? `0 0 6px ${p.color}` : 'none' }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
                {currentProvider.docsUrl && (
                  <a
                    href={currentProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs mt-2 hover:underline"
                    style={{ color: currentProvider.color }}
                  >
                    🔗 取得 API Key
                  </a>
                )}
              </div>

              {/* API Base URL */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  API Base URL
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder={currentProvider.baseUrl || 'https://your-api-endpoint/v1'}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#e2e8f0',
                    outline: 'none',
                  }}
                  onFocus={e  => e.target.style.borderColor = '#6366f1'}
                  onBlur={e   => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                />

                {/* 本地端 Docker 網路說明 */}
                {(provider === 'ollama' || provider === 'lmstudio') && (
                  <div className="mt-2 rounded-lg px-3 py-2.5 text-xs space-y-1.5"
                       style={{ background: 'rgba(255,200,50,0.07)', border: '1px solid rgba(255,200,50,0.2)' }}>
                    <p style={{ color: '#fbbf24', fontWeight: 600 }}>
                      🐳 Docker 後端連到 Host 的本地服務
                    </p>
                    <div className="space-y-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      <p>
                        後端運行在 Docker 內，<code style={{ color: '#f9a8d4' }}>localhost</code> 指容器本身，
                        需改用 <code style={{ color: '#86efac' }}>host.docker.internal</code> 才能連到 Host。
                      </p>
                      <div className="flex gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setBaseUrl(currentProvider.baseUrl)}
                          className="px-2 py-1 rounded text-xs font-mono transition-colors"
                          style={{
                            background: 'rgba(134,239,172,0.12)',
                            border: '1px solid rgba(134,239,172,0.3)',
                            color: '#86efac',
                            cursor: 'pointer',
                          }}
                          title="Docker 環境（推薦）"
                        >
                          🐳 {currentProvider.baseUrl}
                        </button>
                        {currentProvider.altUrl && (
                          <button
                            type="button"
                            onClick={() => setBaseUrl(currentProvider.altUrl)}
                            className="px-2 py-1 rounded text-xs font-mono transition-colors"
                            style={{
                              background: 'rgba(165,180,252,0.10)',
                              border: '1px solid rgba(165,180,252,0.25)',
                              color: '#a5b4fc',
                              cursor: 'pointer',
                            }}
                            title="直接在 Host 執行（非 Docker）"
                          >
                            💻 {currentProvider.altUrl}
                          </button>
                        )}
                      </div>
                      {provider === 'ollama' && (
                        <p className="pt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          ⚠️ Ollama 預設只監聽 <code>127.0.0.1</code>，需先設定：
                          <code className="ml-1 px-1 rounded" style={{ background: 'rgba(0,0,0,0.3)', color: '#fcd34d' }}>
                            OLLAMA_HOST=0.0.0.0 ollama serve
                          </code>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  API Key
                  {(provider === 'ollama' || provider === 'lmstudio') && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                      可選
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={currentProvider.keyHint}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                    title={showKey ? '隱藏 Key' : '顯示 Key'}
                  >
                    {showKey ? '🙈' : '👁️'}
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  API Key 加密儲存於資料庫，顯示時僅呈現末 4 碼
                </p>
              </div>

              {/* Ollama / LM Studio：載入已安裝模型 */}
              {(provider === 'ollama' || provider === 'lmstudio') && (
                <div className="space-y-2">
                  {/* 載入按鈕 + 計數 */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleLoadOllamaModels}
                      disabled={loadingModels}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: loadingModels ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        color: loadingModels ? 'rgba(255,255,255,0.3)' : '#a5b4fc',
                        cursor: loadingModels ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loadingModels ? (
                        <>
                          <span
                            className="inline-block w-3 h-3 rounded-full border-2 animate-spin"
                            style={{ borderColor: 'rgba(165,180,252,0.3)', borderTopColor: '#a5b4fc' }}
                          />
                          載入中⋯
                        </>
                      ) : (
                        <>🔍 載入可用模型</>
                      )}
                    </button>
                    {ollamaModels.length > 0 && (
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        找到 {ollamaModels.length} 個模型 ── 點名稱→主力　點「輕」→輕量
                      </span>
                    )}
                  </div>

                  {/* 模型 Chips */}
                  {ollamaModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ollamaModels.map(m => (
                        <span
                          key={m.name}
                          className="inline-flex items-center"
                          style={{
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.12)',
                          }}
                        >
                          {/* 名稱 → 設為主力模型 */}
                          <button
                            type="button"
                            onClick={() => setModelHeavy(m.name)}
                            className="px-2 py-1 text-xs font-mono transition-colors"
                            style={{
                              background: modelHeavy === m.name
                                ? 'rgba(99,102,241,0.28)'
                                : 'rgba(255,255,255,0.06)',
                              color: modelHeavy === m.name ? '#a5b4fc' : 'rgba(255,255,255,0.7)',
                              borderRight: '1px solid rgba(255,255,255,0.08)',
                            }}
                            title={`設為主力模型${m.size ? `（${m.size}）` : ''}`}
                          >
                            {m.name}
                            {m.size && (
                              <span style={{ marginLeft: 4, color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
                                {m.size}
                              </span>
                            )}
                          </button>
                          {/* 「輕」→ 設為輕量模型 */}
                          <button
                            type="button"
                            onClick={() => setModelLight(m.name)}
                            className="px-1.5 py-1 text-xs transition-colors"
                            style={{
                              background: modelLight === m.name
                                ? 'rgba(139,92,246,0.25)'
                                : 'rgba(255,255,255,0.03)',
                              color: modelLight === m.name ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
                            }}
                            title="設為輕量模型"
                          >
                            輕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 模型設定（兩欄） */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    主力模型 <span className="text-xs opacity-50">（分析 / 拆解）</span>
                  </label>
                  <input
                    type="text"
                    value={modelHeavy}
                    onChange={e => setModelHeavy(e.target.value)}
                    list="heavy-model-list"
                    placeholder="e.g. gpt-4o"
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                  <datalist id="heavy-model-list">
                    {currentProvider.models.map(m => <option key={m} value={m} />)}
                    {ollamaModels.map(m => <option key={`o-h-${m.name}`} value={m.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    輕量模型 <span className="text-xs opacity-50">（週報 / 摘要）</span>
                  </label>
                  <input
                    type="text"
                    value={modelLight}
                    onChange={e => setModelLight(e.target.value)}
                    list="light-model-list"
                    placeholder="e.g. gpt-4o-mini"
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                  <datalist id="light-model-list">
                    {currentProvider.models.map(m => <option key={m} value={m} />)}
                    {ollamaModels.map(m => <option key={`o-l-${m.name}`} value={m.name} />)}
                  </datalist>
                </div>
              </div>

              {/* Max Tokens + Temperature（兩欄） */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    Max Tokens <span className="text-xs opacity-50">（256 ~ 32000）</span>
                  </label>
                  <input
                    type="number"
                    value={maxTokens}
                    onChange={e => setMaxTokens(Number(e.target.value))}
                    min={256} max={32000} step={256}
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    Temperature <span className="text-xs opacity-50">（0 = 精確，2 = 創意）</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      value={temperature}
                      onChange={e => setTemperature(parseFloat(e.target.value))}
                      min={0} max={2} step={0.1}
                      className="flex-1"
                      style={{ accentColor: '#6366f1' }}
                    />
                    <span className="text-sm font-mono w-8 text-right" style={{ color: '#a5b4fc' }}>
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 測試連線結果 */}
              {testResult && (
                <div
                  className="rounded-lg px-4 py-3 text-sm flex items-start gap-3"
                  style={{
                    background: testResult.success ? 'rgba(16,163,127,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${testResult.success ? 'rgba(16,163,127,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}
                >
                  <span className="text-lg flex-shrink-0">{testResult.success ? '✅' : '❌'}</span>
                  <div>
                    <p style={{ color: testResult.success ? '#6ee7b7' : '#fca5a5', fontWeight: 500 }}>
                      {testResult.success
                        ? `連線成功！延遲 ${testResult.latencyMs}ms，模型：${testResult.model}`
                        : (testResult.error || '連線失敗')}
                    </p>
                    {testResult.hint && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        💡 {testResult.hint}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 錯誤訊息 */}
              {error && (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* 儲存成功提示 */}
              {saved && (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ background: 'rgba(16,163,127,0.1)', border: '1px solid rgba(16,163,127,0.25)', color: '#6ee7b7' }}
                >
                  ✅ 設定已儲存，AI 功能將立即使用新設定
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && (
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
          >
            {/* 測試連線 */}
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: testing ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: testing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                cursor: testing ? 'not-allowed' : 'pointer',
              }}
            >
              {testing ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'transparent' }} />
                  測試中⋯
                </>
              ) : (
                <>⚡ 測試連線</>
              )}
            </button>

            {/* 取消 / 儲存 */}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.5)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: saving ? '#4f46e5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: saving ? 'rgba(255,255,255,0.5)' : '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: saving ? 'none' : '0 4px 15px rgba(99,102,241,0.4)',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
              >
                {saving ? '儲存中⋯' : '💾 儲存設定'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
