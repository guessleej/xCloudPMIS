/**
 * usePermissions — 集中式角色權限 Hook
 *
 * 根據 user.role（admin / pm / member）回傳各功能權限布林值，
 * 前端元件直接用來控制 UI 顯示 / 隱藏 / 禁用。
 *
 * 使用方式：
 *   const { canCreateProject, canManageTeamRoles } = usePermissions();
 *   {canCreateProject && <Button>新增專案</Button>}
 *
 * 角色層級（高→低）：admin > pm > member
 *
 * ┌──────────────────┬───────┬──────┬────────┐
 * │ 功能             │ admin │  pm  │ member │
 * ├──────────────────┼───────┼──────┼────────┤
 * │ 建立/刪除專案     │  ✓    │  ✓   │   ✗    │
 * │ 永久刪除專案      │  ✓    │  ✗   │   ✗    │
 * │ 管理規則          │  ✓    │  ✓   │   ✗    │
 * │ 管理自訂欄位      │  ✓    │  ✓   │   ✗    │
 * │ 管理表單          │  ✓    │  ✓   │   ✗    │
 * │ 管理組合          │  ✓    │  ✓   │   ✗    │
 * │ 管理 OKR 目標     │  ✓    │  ✓   │   ✗    │
 * │ 變更團隊角色      │  ✓    │  ✗   │   ✗    │
 * │ 編輯團隊成員      │  ✓    │  ✓   │   ✗    │
 * │ 停用/啟用成員     │  ✓    │  ✗   │   ✗    │
 * │ 提交表單          │  ✓    │  ✓   │   ✓    │
 * │ 任務 CRUD         │  ✓    │  ✓   │   ✓    │
 * │ 檢視報表          │  ✓    │  ✓   │   ✓    │
 * └──────────────────┴───────┴──────┴────────┘
 */
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const role = user?.role || 'member';

    const isAdmin  = role === 'admin';
    const isPm     = role === 'pm';
    const isAdminOrPm = isAdmin || isPm;

    return {
      // ── 角色判斷 ────────────────────────
      role,
      isAdmin,
      isPm,
      isMember: role === 'member',
      isAdminOrPm,

      // ── 專案 ────────────────────────────
      canCreateProject:    isAdminOrPm,
      canDeleteProject:    isAdminOrPm,
      canPermanentDelete:  isAdmin,        // 永久刪除僅限 admin

      // ── 自動化規則 ──────────────────────
      canManageRules:      isAdminOrPm,

      // ── 自訂欄位 ────────────────────────
      canManageFields:     isAdminOrPm,

      // ── 表單 ────────────────────────────
      canManageForms:      isAdminOrPm,
      canSubmitForms:      true,           // 所有角色皆可提交表單

      // ── 組合 ────────────────────────────
      canManagePortfolios: isAdminOrPm,

      // ── OKR 目標 ────────────────────────
      canManageGoals:      isAdminOrPm,

      // ── 團隊管理 ────────────────────────
      canEditTeamMember:   isAdminOrPm,    // 編輯成員資訊（姓名/職稱/部門）
      canManageTeamRoles:  isAdmin,        // 變更角色（僅 admin）
      canToggleActive:     isAdmin,        // 停用/啟用帳號（僅 admin）

      // ── 任務（所有角色） ────────────────
      canManageTasks:      true,

      // ── 報表（所有角色） ────────────────
      canViewReports:      true,
    };
  }, [user?.role]);
}
