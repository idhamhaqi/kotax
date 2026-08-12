const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { verifyToken } = require('../middleware/auth');

router.post('/pre-check', verifyToken, withdrawalController.preCheckWithdrawal);
router.post('/create', verifyToken, withdrawalController.createWithdrawal);
router.get('/history', verifyToken, withdrawalController.getWithdrawalHistory);

module.exports = router;
