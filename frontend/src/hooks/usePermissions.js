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
 * ┌────────────────────────┬───────┬────────┬────────┐
 * │ 功能                   │ admin │   pm   │ member │
 * ├────────────────────────┼───────┼────────┼────────┤
 * │ 建立專案              │  ✓    │   ✓    │   ✓    │
 * │ 編輯專案              │  ✓    │ 自己的 │ 自己的 │
 * │ 刪除專案              │  ✓    │ 自己的 │ 自己的 │
 * │ 永久刪除專案         │  ✓    │   ✗    │   ✗    │
 * │ 管理專案成員          │  ✓    │ 自己的 │   ✗    │
 * │ 管理規則              │  ✓    │   ✓    │   ✗    │
 * │ 管理自訂欄位         │  ✓    │   ✓    │   ✗    │
 * │ 管理表單              │  ✓    │   ✓    │   ✗    │
 * │ 管理組合              │  ✓    │   ✓    │   ✗    │
 * │ 管理 OKR 目標        │  ✓    │   ✓    │   ✗    │
 * │ 變更團隊角色         │  ✓    │   ✗    │   ✗    │
 * │ 編輯團隊成員         │  ✓    │   ✓    │   ✗    │
 * │ 停用/啟用成員        │  ✓    │   ✗    │   ✗    │
 * │ 提交表單              │  ✓    │   ✓    │   ✓    │
 * │ 建立/編輯/刪除任務    │  ✓    │   ✓    │   ✗    │
 * │ 完成任務/留言           │  ✓    │   ✓    │   ✓    │
 * │ 檢視報表（自己專案）     │  ✓    │   ✓    │   ✗    │
 * └────────────────────────┴───────┴────────┴────────┘
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
    const currentUserId = user?.id || user?.userId;
    const isOwnProject = (project) => {
      if (!project || !currentUserId) return false;
      const uid = Number(currentUserId);
      return Number(project.ownerId) === uid
        || Number(project.createdById) === uid
        || Number(project.owner?.id) === uid;
    };

    return {
      // ── 角色判斷 ────────────────────────
      role,
      isAdmin,
      isPm,
      isMember: role === 'member',
      isAdminOrPm,

      // ── 專案 ────────────────────────────
      canCreateProject:    true,
      canDeleteProject:    isAdminOrPm,    // 顯示删除入口（实際是否可删由 canDeleteProjectRecord 控制）
      canEditProjectRecord:   (project) => isAdmin || isOwnProject(project),   // 僅限 admin 或自己的專案
      canDeleteProjectRecord: (project) => isAdmin || isOwnProject(project),  // 僅限 admin 或自己的專案
      canManageProjectMembers:(project) => isAdmin || isOwnProject(project),  // 補充成員/PM 管理專案成員
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

      // ── 任務 ─────────────────────────────
      canManageTasks:         isAdminOrPm,    // 建立/編輯/刪除（admin/pm）
      canCreateTask:          isAdminOrPm,
      canEditTask:            isAdminOrPm,
      canDeleteTask:          isAdminOrPm,
      canCompleteTask:        true,            // 所有角色可完成任務
      canCommentTask:         true,            // 所有角色可留言
      canAddChecklistItem:    isAdminOrPm,
      canEditChecklistItem:   isAdminOrPm,
      canDeleteChecklistItem: isAdminOrPm,
      canToggleChecklistItem: true,            // 所有角色可勾選待辦
      canAddSubtask:          isAdminOrPm,
      canEditSubtask:         isAdminOrPm,
      canDeleteSubtask:       isAdminOrPm,
      canToggleSubtask:       true,            // 所有角色可完成子任務

      // ── 報表 ────────────────────────────
      canViewReports:         isAdminOrPm,  // admin 全部；pm 限自己的專案（配合 canViewOwnReportsOnly）
      canViewOwnReportsOnly:  isPm,         // true 時報表頁僅顯示本人擁有的專案
    };
  }, [user?.role, user?.id, user?.userId]);
}
