/**
 * 全站字體放大腳本
 * 將所有 inline fontSize 值按比例放大 ~2px
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function globRecursive(dir, exts) {
  let results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results = results.concat(globRecursive(full, exts));
    else if (exts.some(e => full.endsWith(e))) results.push(full);
  }
  return results;
}

// 字體放大對照表（原始px → 新px）
const SIZE_MAP = {
  8: 10,
  8.5: 10,
  9: 11,
  9.5: 11,
  10: 12,
  10.5: 12,
  11: 13,
  11.5: 13,
  12: 14,
  12.5: 14,
  13: 15,
  13.5: 15,
  14: 16,
  14.5: 16,
  15: 16,
  16: 17,
  17: 18,
  18: 20,
  19: 21,
  20: 22,
  21: 23,
  22: 24,
  24: 26,
  26: 28,
  28: 30,
  30: 32,
  32: 34,
  36: 38,
  40: 42,
  48: 50,
};

function bumpSize(n) {
  if (SIZE_MAP[n] !== undefined) return SIZE_MAP[n];
  // 未在對照表中的 → 加 2px
  return n + 2;
}

// 匹配 fontSize 的所有模式
// 1) fontSize: '13.5px'  /  fontSize: "13.5px"
// 2) fontSize: 13.5      (數字，無引號無px)
// 3) fontSize: '1.2em'   → 不動
// 4) font-size: 13.5px   (CSS-in-template strings)

const PATTERN = /fontSize:\s*['"](\d+(?:\.\d+)?)px['"]/g;
const PATTERN_NUM = /fontSize:\s*(\d+(?:\.\d+)?)(?=\s*[,}\n\r])/g;

let totalChanges = 0;

const files = globRecursive('c:/Users/EagleWu吳柏緯/Desktop/專案/xCloudPMIS/frontend/src/components', ['.jsx', '.tsx', '.js']);

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  let changed = false;
  let fileChanges = 0;

  // Pattern 1: fontSize: '13.5px' or fontSize: "13.5px"
  content = content.replace(/fontSize:\s*(['"])(\d+(?:\.\d+)?)px\1/g, (match, quote, num) => {
    const n = parseFloat(num);
    const newN = bumpSize(n);
    if (newN !== n) {
      changed = true;
      fileChanges++;
      return `fontSize: ${quote}${newN}px${quote}`;
    }
    return match;
  });

  // Pattern 2: fontSize: 13.5 (bare number, no px)
  content = content.replace(/fontSize:\s*(\d+(?:\.\d+)?)(?=\s*[,}\s\n\r])/g, (match, num) => {
    const n = parseFloat(num);
    // Skip if it looks like a variable reference or already processed
    if (n < 8 || n > 60) return match;
    const newN = bumpSize(n);
    if (newN !== n) {
      changed = true;
      fileChanges++;
      return `fontSize: ${Number.isInteger(newN) ? newN : newN.toFixed(0)}`;
    }
    return match;
  });

  if (changed) {
    writeFileSync(file, content, 'utf-8');
    const shortPath = file.replace(/.*[/\\]frontend[/\\]/, '');
    console.log(`✅ ${shortPath} — ${fileChanges} changes`);
    totalChanges += fileChanges;
  }
}

console.log(`\n🎉 完成！共修改 ${totalChanges} 處字體大小`);
