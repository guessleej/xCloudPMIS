/**
 * cleanTestData.js — 一次清除所有測試資料
 * 保留：Company、User、AutomationRule（可複用）
 * 刪除：所有專案、任務、OKR、里程碑、通知、留言、表單、自訂欄位等
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function clean() {
  console.log('🗑️  開始清除測試資料…\n');

  // 依 FK 順序由葉 → 根逐層刪除
  const steps = [
    ['Notification',           () => p.notification.deleteMany()],
    ['ActivityLog',            () => p.activityLog.deleteMany()],
    ['Comment',                () => p.comment.deleteMany()],
    ['Attachment',             () => p.attachment.deleteMany()],
    ['MyFile',                 () => p.myFile.deleteMany()],
    ['TimeEntry',              () => p.timeEntry.deleteMany()],
    ['WorkTimeLog',            () => p.workTimeLog.deleteMany()],
    ['ChecklistItem',          () => p.checklistItem.deleteMany()],
    ['CustomFieldValueOption', () => p.customFieldValueOption.deleteMany()],
    ['CustomFieldValue',       () => p.customFieldValue.deleteMany()],
    ['TaskTag',                () => p.taskTag.deleteMany()],
    ['TaskAssigneeLink',       () => p.taskAssigneeLink.deleteMany()],
    ['TaskProject',            () => p.taskProject.deleteMany()],
    ['TaskDependency',         () => p.taskDependency.deleteMany()],
    ['Task',                   () => p.task.deleteMany()],
    ['Milestone',              () => p.milestone.deleteMany()],
    ['ProjectCustomField',     () => p.projectCustomField.deleteMany()],
    ['ProjectMember',          () => p.projectMember.deleteMany()],
    ['AutomationRuleProject',  () => p.automationRuleProject.deleteMany()],
    ['AutomationRuleRun',      () => p.automationRuleRun.deleteMany()],
    ['Project',                () => p.project.deleteMany()],
    ['KeyResult',              () => p.keyResult.deleteMany()],
    ['Goal',                   () => p.goal.deleteMany()],
    ['Form',                   () => p.form.deleteMany()],
    ['CustomFieldOption',      () => p.customFieldOption.deleteMany()],
    ['CustomFieldDefinition',  () => p.customFieldDefinition.deleteMany()],
    ['Tag',                    () => p.tag.deleteMany()],
    ['Workflow',               () => p.workflow.deleteMany()],
    ['AiSuggestion',           () => p.aiSuggestion.deleteMany()],
    ['AiDecision',             () => p.aiDecision.deleteMany()],
    ['AiAgentLog',             () => p.aiAgentLog.deleteMany()],
    ['WorkspaceMember',        () => p.workspaceMember.deleteMany()],
    ['Workspace',              () => p.workspace.deleteMany()],
  ];

  let total = 0;
  for (const [name, fn] of steps) {
    const result = await fn();
    if (result.count > 0) {
      console.log(`  ✅ ${name}: 刪除 ${result.count} 筆`);
      total += result.count;
    }
  }

  // 重置 sequences（讓 id 從 1 開始）
  const sequences = [
    'projects_id_seq', 'tasks_id_seq', 'milestones_id_seq',
    'notifications_id_seq', 'comments_id_seq', 'activity_logs_id_seq',
    'attachments_id_seq', 'time_entries_id_seq', 'checklist_items_id_seq',
    'task_dependencies_id_seq', 'tags_id_seq', 'goals_id_seq',
    'key_results_id_seq', 'forms_id_seq', 'workflows_id_seq',
    'custom_field_definitions_id_seq', 'custom_field_options_id_seq',
    'custom_field_values_id_seq', 'my_files_id_seq',
    'work_time_logs_id_seq', 'ai_suggestions_id_seq',
    'ai_decisions_id_seq', 'ai_agent_logs_id_seq', 'workspaces_id_seq',
  ];
  for (const seq of sequences) {
    try {
      await p.$executeRawUnsafe(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    } catch (_) { /* sequence 可能不存在，跳過 */ }
  }
  console.log('\n  🔄 已重置 ID 序列');

  console.log(`\n🎉 清除完成！共刪除 ${total} 筆測試資料`);
  console.log('   保留：Company (xCloud 科技)、User (admin, Eagle Wu)、AutomationRule');
  await p.$disconnect();
}

clean().catch(e => { console.error('❌ 清除失敗:', e.message); process.exit(1); });
