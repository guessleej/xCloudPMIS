#!/usr/bin/env node
/**
 * ACS Email 發送測試
 * 用法：node scripts/testAcsEmail.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const emailService = require('../src/services/emailService');

async function main() {
  console.log('=== ACS Email 發送測試 ===');
  console.log('ACS_SENDER_EMAIL:', process.env.ACS_SENDER_EMAIL);
  console.log('ACS_CONNECTION_STRING:', process.env.ACS_CONNECTION_STRING ? '✅ 已設定' : '❌ 未設定');
  console.log('');

  try {
    const result = await emailService.sendEmail({
      to: 'eagle_w@cloudinfo.com.tw',
      subject: '🧪 xCloudPMIS ACS 郵件測試',
      htmlBody: emailService.wrapEmailTemplate({
        title: 'ACS 郵件測試',
        accentColor: '#3b82f6',
        content: `
          <h2 style="margin:0 0 16px;color:#1a202c;">測試成功 ✅</h2>
          <p style="font-size:15px;color:#374151;">
            此郵件由 <strong>xCloudPMIS</strong> 透過 Azure Communication Services 發送。
          </p>
          <p style="font-size:14px;color:#6b7280;">
            如果你收到這封信，表示 ACS Email 整合已經正常運作。
          </p>
          <p style="font-size:13px;color:#9ca3af;margin-top:20px;">
            發送時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
          </p>
        `,
      }),
    });
    console.log('');
    console.log('✅ 發送成功！');
    console.log('   messageId:', result.messageId);
    console.log('   recipients:', result.recipients.join(', '));
  } catch (err) {
    console.error('');
    console.error('❌ 發送失敗:', err.message);
    if (err.statusCode) console.error('   HTTP Status:', err.statusCode);
    if (err.code) console.error('   Error Code:', err.code);
    console.error('   Stack:', err.stack);
  }
}

main();
