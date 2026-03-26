/**
 * useUrgency — 逾期 & 即將截止任務資料 hook
 *
 * 呼叫 GET /api/dashboard/urgency?companyId=N
 * 回傳 { overdue, upcoming, overdueByPriority, overdueByProject, loading, error, refresh }
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

export function useUrgency(days = 14) {
  const { user, authFetch } = useAuth();
  const companyId = user?.companyId;

  const [overdue,           setOverdue]           = useState([]);
  const [upcoming,          setUpcoming]          = useState([]);
  const [overdueByPriority, setOverdueByPriority] = useState([]);
  const [overdueByProject,  setOverdueByProject]  = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(null);

  const refresh = useCallback(async () => {
    if (!companyId || !authFetch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`/api/dashboard/urgency?companyId=${companyId}&days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d    = json.data || json;
      setOverdue(          Array.isArray(d.overdue)           ? d.overdue           : []);
      setUpcoming(         Array.isArray(d.upcoming)          ? d.upcoming          : []);
      setOverdueByPriority(Array.isArray(d.overdueByPriority) ? d.overdueByPriority : []);
      setOverdueByProject( Array.isArray(d.overdueByProject)  ? d.overdueByProject  : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authFetch, days]);

  useEffect(() => { refresh(); }, [refresh]);

  return { overdue, upcoming, overdueByPriority, overdueByProject, loading, error, refresh };
}
