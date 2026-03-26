const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json({ success: true, data: [], meta: {} }));
router.post('/', (req, res) => res.json({ success: true }));
router.get('/:id', (req, res) => res.json({ success: true, data: null }));
router.patch('/:id', (req, res) => res.json({ success: true }));
router.delete('/:id', (req, res) => res.json({ success: true }));
module.exports = router;
