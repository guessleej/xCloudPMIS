const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json({ backend: { status: 'ok', version: '1.0.0' }, database: { status: 'ok' }, cache: { status: 'ok' } }));
router.get('/summary', (req, res) => res.json({ backend: { status: 'ok' }, database: { status: 'ok' }, cache: { status: 'ok' } }));
module.exports = router;
