const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

router.get('/stats', verifyToken, async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT balance, hold_balance, quota_gb, referral_code FROM users WHERE id = $1',
            [req.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];
        const balance = Number(user.balance || 0);
        const holdBalance = Number(user.hold_balance || 0);

        // Get referral count
        const [referrals] = await db.query(
            'SELECT COUNT(*)::INTEGER as count FROM referrals WHERE referrer_id = $1',
            [req.userId]
        );

        // Get fill order statistics
        const [fillStats] = await db.query(
            `SELECT
                COUNT(*)::INTEGER as total_orders,
                COALESCE(SUM(price), 0)::NUMERIC as total_volume,
                COALESCE(SUM(profit), 0)::NUMERIC as total_profit
             FROM fill_order_history
             WHERE user_id = $1`,
            [req.userId]
        );

        const stats = fillStats[0];

        // Get target monthly ROI from settings
        const [roiRows] = await db.query(
            "SELECT setting_value FROM settings WHERE setting_key = 'target_monthly_roi'"
        );
        const targetMonthlyRoi = roiRows.length > 0 ? (parseInt(roiRows[0].setting_value) || 30) : 30;

        res.json({
            success: true,
            stats: {
                balance: balance,
                holdBalance: holdBalance,
                quotaGb: Number(user.quota_gb || 0),
                referralCode: user.referral_code,
                referralCount: Number(referrals[0].count),
                totalOrders: Number(stats.total_orders),
                totalVolume: Number(stats.total_volume),
                totalProfit: Number(stats.total_profit),
                targetMonthlyRoi: targetMonthlyRoi
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
});

// Get transaction history
router.get('/transactions', verifyToken, async (req, res) => {
    try {
        const [transactions] = await db.query(
            'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [req.userId]
        );

        res.json({ success: true, transactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
