/**
 * useDashboard — 儀表板資料抓取自訂鉤子
 *
 * 什麼是自訂鉤子？
 *   把「抓資料、管狀態」的邏輯抽出來，
 *   讓 UI 元件只負責「顯示」，更清楚、更好維護。
 */

import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3010';
const COMPANY_ID = 2; // 之後改成從身分驗證令牌取得

/**
 * 從 API 抓資料的通用函數
 * @param {string} path - API 路徑，例如 '/api/dashboard/executive-summary'
 */
async function fetchDashboard(path) {
  const url = `${API}${path}?companyId=${COMPANY_ID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

/**
 * useDashboard 自訂鉤子
 * 回傳：{ summary（摘要）, projects（專案列表）, workload（工作負載）, insights（行動建議）, loading（載入中）, error（錯誤）, refresh（重新整理） }
 */
export function useDashboard() {
  const [summary,   setSummary]   = useState(null);
  const [projects,  setProjects]  = useState([]);
  const [workload,  setWorkload]  = useState(null);
  const [insights,  setInsights]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 四個 API 同時發出請求（平行，不是一個等一個）
      const [s, p, w, i] = await Promise.all([
        fetchDashboard('/api/dashboard/executive-summary'),
        fetchDashboard('/api/dashboard/projects-health'),
        fetchDashboard('/api/dashboard/workload'),
        fetchDashboard('/api/dashboard/actionable-insights'),
      ]);
      setSummary(s);
      setProjects(p);
      setWorkload(w);
      setInsights(i);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 元件掛載時自動載入
  useEffect(() => { load(); }, [load]);

  return { summary, projects, workload, insights, loading, error, refresh: load };
}
