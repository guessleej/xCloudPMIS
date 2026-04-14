/**
 * mobile-patch.mjs
 * 自動為各頁面元件注入 useIsMobile hook 並替換常見的固定 padding/gap 為響應式值
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const SRC = join(import.meta.dirname, '..', 'src', 'components');

// 要處理的頁面檔案（排除已經處理的 Dashboard.jsx）
const TARGET_FILES = [];

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(jsx|tsx)$/.test(f)) continue;
    if (f === 'Dashboard.jsx') continue; // skip - already handled
    TARGET_FILES.push(full);
  }
}
walk(SRC);

let totalChanges = 0;
let filesChanged = 0;

for (const filePath of TARGET_FILES) {
  let code = readFileSync(filePath, 'utf-8');
  const rel = relative(SRC, filePath);
  let changes = 0;

  // ── 1. 加入 import (如果還沒有) ────────────────────
  if (!code.includes('useIsMobile') && !code.includes('useResponsive')) {
    // 找到最後一個 import 行
    const importRegex = /^import .+$/gm;
    let lastImportEnd = 0;
    let m;
    while ((m = importRegex.exec(code)) !== null) {
      // handle multi-line imports
      let end = m.index + m[0].length;
      // if import has opening brace but no close on same line, scan forward
      if (m[0].includes('{') && !m[0].includes('}')) {
        const closeIdx = code.indexOf('}', end);
        if (closeIdx !== -1) {
          const semiIdx = code.indexOf(';', closeIdx);
          end = semiIdx !== -1 ? semiIdx + 1 : closeIdx + 1;
        }
      }
      lastImportEnd = end;
    }

    if (lastImportEnd > 0) {
      // Calculate relative path from file to hooks
      const fileDir = filePath.replace(/[/\\][^/\\]+$/, '');
      const hooksDir = join(SRC, '..', 'hooks');
      let relPath = relative(fileDir, hooksDir).replace(/\\/g, '/');
      if (!relPath.startsWith('.')) relPath = './' + relPath;

      const importLine = `\nimport { useIsMobile } from '${relPath}/useResponsive';`;
      code = code.slice(0, lastImportEnd) + importLine + code.slice(lastImportEnd);
      changes++;
    }
  }

  // ── 2. 注入 const isMobile = useIsMobile(); ────────
  // 找主元件函式 (export default function Xxx 或 function XxxPage)
  if (!code.includes('useIsMobile()') && !code.includes('useResponsive()')) {
    // Pattern: function ComponentName( or export default function ComponentName(
    const funcRegex = /(?:export\s+default\s+)?function\s+\w+Page\s*\([^)]*\)\s*\{/g;
    const funcMatch = funcRegex.exec(code);
    if (funcMatch) {
      const insertPos = funcMatch.index + funcMatch[0].length;
      code = code.slice(0, insertPos) + '\n  const isMobile = useIsMobile();' + code.slice(insertPos);
      changes++;
    }
  }

  // ── 3. 響應式 padding 替換 ─────────────────────────
  // 常見的大 padding 模式
  const paddingPatterns = [
    // padding: '28px 32px 24px' → isMobile ? '16px' : '28px 32px 24px'
    [/padding:\s*'(2[4-9]|3[0-9])px\s+(2[4-9]|3[0-9])px\s+\d+px'/g,
     (m) => m.replace(/padding:\s*'([^']+)'/, (_, v) => `padding: isMobile ? '14px 16px 12px' : '${v}'`)],
    // padding: '28px 32px' → isMobile ? '14px 16px' : '28px 32px'
    [/padding:\s*'(2[4-9]|3[0-9])px\s+(2[4-9]|3[0-9])px'/g,
     (m) => m.replace(/padding:\s*'([^']+)'/, (_, v) => `padding: isMobile ? '14px 16px' : '${v}'`)],
    // padding: '32px 36px 28px' → responsive
    [/padding:\s*'3[2-6]px\s+3[2-6]px\s+\d+px'/g,
     (m) => m.replace(/padding:\s*'([^']+)'/, (_, v) => `padding: isMobile ? '16px 16px 12px' : '${v}'`)],
  ];

  for (const [pattern, replacer] of paddingPatterns) {
    const before = code;
    code = code.replace(pattern, replacer);
    if (code !== before) changes++;
  }

  // ── 4. gap: 32 → responsive ───────────────────────
  // gap: 32 → isMobile ? 16 : 32
  const gapBefore = code;
  code = code.replace(/gap:\s*(28|32|36)\b(?![\s\S]*isMobile)/g, (m, val) => {
    return `gap: isMobile ? ${Math.round(Number(val) / 2)} : ${val}`;
  });
  // Only count once
  if (code !== gapBefore) changes++;

  if (changes > 0) {
    writeFileSync(filePath, code, 'utf-8');
    totalChanges += changes;
    filesChanged++;
    console.log(`  ✅ ${rel}: ${changes} changes`);
  }
}

console.log(`\n🎉 完成：${filesChanged} 檔案，共 ${totalChanges} 處修改`);
