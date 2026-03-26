const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json({ error: 'OAUTH_NOT_CONFIGURED', message: 'Microsoft OAuth 尚未設定' }));
router.get('/callback', (req, res) => res.redirect('http://localhost:3838/#settings?msError=OAUTH_NOT_CONFIGURED'));
router.get('/status', (req, res) => res.json({ connected: false, configured: false }));
router.delete('/revoke', (req, res) => res.json({ success: true }));
router.post('/config', (req, res) => res.json({ success: true, message: '設定已儲存（stub）' }));
module.exports = router;
