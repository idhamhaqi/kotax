const db = require('../config/database');

// Get referral page
async function getReferralPage(req, res) {
    try {
        res.render('referral', { page: 'referral' });
    } catch (error) {
        console.error('Error rendering referral:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
}

// Get referral stats and data
async function getReferralData(req, res) {
    try {
        const userId = req.userId;

        // Get user's referral code
        const [users] = await db.query(
            'SELECT referral_code FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const referralCode = users[0].referral_code;

        // Get total bonus earned
        const [bonusStats] = await db.query(
            `SELECT
                COUNT(*)::INTEGER as total_bonuses,
                COALESCE(SUM(amount), 0) as total_bonus_earned,
                COALESCE(SUM(CASE WHEN bonus_type = 'fill_order' THEN amount ELSE 0 END), 0) as fill_order_bonus
             FROM referral_bonuses
             WHERE user_id = $1`,
            [userId]
        );

        // Get direct referrals count (level 1)
        const [directReferrals] = await db.query(
            'SELECT COUNT(*)::INTEGER as count FROM users WHERE referred_by = $1',
            [referralCode]
        );

        res.json({
            success: true,
            stats: {
                totalBonusEarned: bonusStats[0].total_bonus_earned,
                fillOrderBonus: bonusStats[0].fill_order_bonus,
                totalBonuses: bonusStats[0].total_bonuses,
                directReferrals: directReferrals[0].count,
                level2Referrals: 0,
                level3Referrals: 0
            },
            referralCode: referralCode
        });

    } catch (error) {
        console.error('Error getting referral data:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Get referral list with pagination
async function getReferralList(req, res) {
    try {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        // Get user's referral code
        const [users] = await db.query(
            'SELECT referral_code FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const referralCode = users[0].referral_code;

        // Get direct referrals with their stats
        const [referrals] = await db.query(
            `SELECT
                u.id,
                u.full_name,
                u.email,
                u.created_at,
                COALESCE(SUM(rb.amount), 0) as total_bonus_from_this_user,
                COUNT(DISTINCT CASE WHEN rb.bonus_type = 'conversion' THEN rb.id END) as conversion_count,
                COUNT(DISTINCT CASE WHEN rb.bonus_type = 'fill_order' THEN rb.id END) as fill_order_count
             FROM users u
             LEFT JOIN referral_bonuses rb ON rb.user_id = $1 AND rb.from_user_id = u.id
             WHERE u.referred_by = $2
             GROUP BY u.id, u.full_name, u.email, u.created_at
             ORDER BY u.created_at DESC
             LIMIT $3 OFFSET $4`,
            [userId, referralCode, limit, offset]
        );

        // Get total count for pagination
        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM users WHERE referred_by = $1',
            [referralCode]
        );

        res.json({
            success: true,
            referrals: referrals,
            pagination: {
                total: countResult[0].total,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < countResult[0].total
            }
        });

    } catch (error) {
        console.error('Error getting referral list:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Get bonus history with pagination
async function getBonusHistory(req, res) {
    try {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        // Get bonus history with user info
        const [history] = await db.query(
            `SELECT
                rb.id,
                rb.bonus_type,
                rb.amount,
                rb.level,
                rb.percentage,
                rb.description,
                rb.created_at,
                u.full_name as from_user_name
             FROM referral_bonuses rb
             JOIN users u ON rb.from_user_id = u.id
             WHERE rb.user_id = $1
             ORDER BY rb.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        // Get total count for pagination
        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM referral_bonuses WHERE user_id = $1',
            [userId]
        );

        res.json({
            success: true,
            history: history,
            pagination: {
                total: countResult[0].total,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < countResult[0].total
            }
        });

    } catch (error) {
        console.error('Error getting bonus history:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    getReferralPage,
    getReferralData,
    getReferralList,
    getBonusHistory
};
