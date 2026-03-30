/**
 * hooks/useAiDecisions.js
 * ─────────────────────────────────────────────────────────────
 * xCloudPMIS — AI 決策中心 React Hook
 *
 * 封裝所有 AI 決策相關的 API 呼叫與狀態管理，
 * 提供給 AiDecisionCenter.jsx 使用。
 *
 * 功能：
 *   - 自動載入統計數字與決策列表
 *   - 支援批准 / 拒絕 / 回滾操作
 *   - 手動觸發 Agent Loop
 *   - 自動每 30 秒輪詢（有 Staging 決策時提醒）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

// API 使用相對路徑，由 Vite proxy 轉發到後端（見 vite.config.js）
const API = '';

// ════════════════════════════════════════════════════════════
// Hook：useAiDecisions
// ════════════════════════════════════════════════════════════

export function useAiDecisions({ companyId, autoRefresh = true } = {}) {
  const { authFetch } = useAuth();

  // ── API 呼叫工具 ──────────────────────────────────────────
  const apiFetch = useCallback(async (path, options = {}) => {
    const fetcher = authFetch || fetch;
    const res = await fetcher(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '未知錯誤');
    return json;
  }, [authFetch]);

  // ── 狀態 ──────────────────────────────────────────────────
  const [stats,      setStats]      = useState(null);
  const [decisions,  setDecisions]  = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState(null);

  // ── 分頁 & 篩選 ───────────────────────────────────────────
  const [page,      setPage]      = useState(1);
  const [status,    setStatus]    = useState('');      // 空字串 = 全部
  const [agentType, setAgentType] = useState('');
  const LIMIT = 20;

  // ── 自動輪詢 ───────────────────────────────────────────────
  const timerRef = useRef(null);

  // ── 載入資料 ───────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const q = companyId ? `?companyId=${companyId}` : '';
      const { data } = await apiFetch(`/api/ai/decisions/stats${q}`);
      setStats(data);
    } catch (e) {
      // stats 失敗不阻礙列表顯示
      console.warn('[useAiDecisions] stats error:', e.message);
    }
  }, [companyId]);

  const loadDecisions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (companyId) params.set('companyId', companyId);
      if (status)    params.set('status',    status);
      if (agentType) params.set('agentType', agentType);

      const { data, meta } = await apiFetch(`/api/ai/decisions?${params}`);
      setDecisions(data);
      setTotal(meta.total);
    } catch (e) {
      setError(e.message);
    }
  }, [companyId, page, status, agentType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStats(), loadDecisions()]);
    } finally {
      setLoading(false);
    }
  }, [loadStats, loadDecisions]);

  // ── 首次載入 & 參數變化重新載入 ───────────────────────────
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── 自動輪詢（30 秒）─────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;

    timerRef.current = setInterval(() => {
      // 靜默更新，不重置 loading 狀態（避免頁面閃爍）
      Promise.all([loadStats(), loadDecisions()]).catch(() => {});
    }, 30_000);

    return () => clearInterval(timerRef.current);
  }, [autoRefresh, loadStats, loadDecisions]);

  // ════════════════════════════════════════════════════════
  // 操作函式
  // ════════════════════════════════════════════════════════

  /** 批准 Staging 決策 */
  const approveDecision = useCallback(async (id, userId = 1) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/ai/decisions/${id}/approve`, {
        method: 'POST',
        body:   JSON.stringify({ userId }),
      });
      await refresh();
      return true;
    } catch (e) {
      setActionError(e.message);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [refresh]);

  /** 拒絕 Staging 決策 */
  const rejectDecision = useCallback(async (id, userId = 1, note) => {
    if (!note?.trim()) {
      setActionError('請填寫拒絕原因');
      return false;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/ai/decisions/${id}/reject`, {
        method: 'POST',
        body:   JSON.stringify({ userId, note }),
      });
      await refresh();
      return true;
    } catch (e) {
      setActionError(e.message);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [refresh]);

  /** 回滾已完成決策 */
  const rollbackDecision = useCallback(async (id, userId = 1) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/ai/decisions/${id}/rollback`, {
        method: 'POST',
        body:   JSON.stringify({ userId }),
      });
      await refresh();
      return true;
    } catch (e) {
      setActionError(e.message);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [refresh]);

  /** 取得單一決策詳情（含 Logs 與完整推理鏈）*/
  const getDecisionDetail = useCallback(async (id) => {
    try {
      const { data } = await apiFetch(`/api/ai/decisions/${id}`);
      return data;
    } catch (e) {
      setActionError(e.message);
      return null;
    }
  }, []);

  /** 手動觸發 Agent Loop */
  const runAgentNow = useCallback(async (dryRun = false) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`${API}/api/ai/agent/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyId, dryRun }),
      });
      const json = await res.json();
      // 202 Accepted 是正常回應
      if (res.status !== 202 && !json.success) throw new Error(json.error);
      return json.message;
    } catch (e) {
      setActionError(e.message);
      return null;
    } finally {
      setActionLoading(false);
      // 5 秒後刷新，看看是否有新決策
      setTimeout(() => refresh(), 5_000);
    }
  }, [companyId, refresh]);

  return {
    // 資料
    stats,
    decisions,
    total,
    pages: Math.ceil(total / LIMIT),
    // 狀態
    loading,
    error,
    actionLoading,
    actionError,
    // 篩選 & 分頁
    page,
    status,
    agentType,
    setPage,
    setStatus,
    setAgentType,
    // 操作
    refresh,
    approveDecision,
    rejectDecision,
    rollbackDecision,
    getDecisionDetail,
    runAgentNow,
    clearActionError: () => setActionError(null),
  };
}
