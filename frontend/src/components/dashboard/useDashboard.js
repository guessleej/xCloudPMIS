import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

export function useDashboard() {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [summary,  setSummary]  = useState(null);
  const [projects, setProjects] = useState([]);
  const [insights, setInsights] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const refresh = useCallback(async () => {
    if (!companyId || !authFetch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`/api/dashboard/summary?companyId=${companyId}`);
      if (res.ok) {
        const json = await res.json();
        // 後端 stub 回傳 { success, data } 或完整物件
        const d = json.data || json;
        setSummary(d.summary || d);
        setProjects(Array.isArray(d.projects) ? d.projects : []);
        setInsights(Array.isArray(d.insights) ? d.insights : []);
        setWorkload(d.workload || null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch]);

  useEffect(() => { refresh(); }, [refresh]);

  return { summary, projects, insights, workload, loading, error, refresh };
}
