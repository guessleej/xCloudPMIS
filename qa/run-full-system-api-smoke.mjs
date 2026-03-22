import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3010';
const ADMIN_EMAIL = 'admin@dev.local';
const ADMIN_PASSWORD = 'dev@2026';

function artifactPath(name) {
  return path.join(process.cwd(), 'qa', 'artifacts', name);
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: res.status, ok: res.ok, json, text };
}

const login = await request('/api/auth/login', {
  method: 'POST',
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});

if (!login.ok || !login.json?.token) {
  throw new Error(`API 登入失敗: ${login.text}`);
}

const token = login.json.token;
const user = login.json.user;

const checks = [
  { name: 'health_root', path: '/health', expected: [200] },
  { name: 'system_status', path: '/api/status', expected: [200] },
  { name: 'auth_me', path: '/api/auth/me', expected: [200], auth: true },
  { name: 'projects', path: `/api/projects?companyId=${user.companyId}`, expected: [200], auth: true },
  { name: 'project_tasks_opt_fields', path: '/api/projects/7/tasks?limit=10&offset=0&opt_fields=gid,name,status,assignees.name,num_subtasks,custom_fields.display_value', expected: [200], auth: true },
  { name: 'team', path: `/api/team?companyId=${user.companyId}`, expected: [200], auth: true },
  { name: 'settings_company', path: `/api/settings/company?companyId=${user.companyId}`, expected: [200], auth: true },
  { name: 'settings_profile', path: `/api/settings/profile?userId=${user.id}`, expected: [200], auth: true },
  { name: 'settings_system', path: `/api/settings/system?companyId=${user.companyId}`, expected: [200], auth: true },
  { name: 'notifications', path: `/api/notifications?companyId=${user.companyId}&recipientId=${user.id}&limit=10&offset=0`, expected: [200], auth: true },
  { name: 'rules', path: `/api/rules?companyId=${user.companyId}`, expected: [200], auth: true },
  { name: 'outlook_oauth_status', path: '/auth/microsoft/status', expected: [200], auth: true, allowFailure: true },
  { name: 'outlook_email_health', path: '/api/health/email', expected: [200, 207], allowFailure: true },
];

const report = {
  project: 'pmis開發案',
  executedAt: new Date().toISOString(),
  user: {
    id: user.id,
    email: user.email,
    companyId: user.companyId,
  },
  checks: [],
};

for (const check of checks) {
  const result = await request(check.path, { token: check.auth ? token : undefined });
  const passed = check.expected.includes(result.status);
  const entry = {
    name: check.name,
    path: check.path,
    status: result.status,
    passed,
  };

  if (result.json) {
    entry.preview = result.json;
  } else {
    entry.preview = result.text.slice(0, 400);
  }

  if (!passed && check.allowFailure) {
    entry.blocked = true;
  }

  report.checks.push(entry);
  console.log(`[API] ${check.name}: ${result.status}${passed ? ' OK' : check.allowFailure ? ' BLOCKED' : ' FAIL'}`);
}

fs.mkdirSync(path.dirname(artifactPath('dummy')), { recursive: true });
fs.writeFileSync(
  artifactPath('pmis-full-system-api-smoke.json'),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify({
  total: report.checks.length,
  passed: report.checks.filter((item) => item.passed).length,
  blocked: report.checks.filter((item) => item.blocked).length,
  failed: report.checks.filter((item) => !item.passed && !item.blocked).length,
  report: artifactPath('pmis-full-system-api-smoke.json'),
}, null, 2));
