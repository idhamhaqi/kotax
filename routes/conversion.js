const express = require('express');
const router = express.Router();
const conversionController = require('../controllers/conversionController');
const { verifyToken } = require('../middleware/auth');

// API Routes
router.post('/convert', verifyToken, conversionController.convertBalanceToQuota);
router.post('/validate', verifyToken, conversionController.validateConversion);
router.get('/stream', verifyToken, conversionController.streamConversion);
router.get('/history', verifyToken, conversionController.getConversionHistory);

module.exports = router;
