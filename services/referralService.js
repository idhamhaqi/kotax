const crypto = require('crypto');
const db = require('../config/database');

// Generate unique referral code
async function generateReferralCode() {
    let code;
    let exists = true;

    while (exists) {
        code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const [rows] = await db.query('SELECT id FROM users WHERE referral_code = $1', [code]);
        exists = rows.length > 0;
    }

    return code;
}

// Process referral when user registers
async function processReferral(referralCode, newUserId) {
    if (!referralCode) return;

    try {
        const [referrer] = await db.query('SELECT id FROM users WHERE referral_code = $1', [referralCode]);

        if (referrer.length > 0) {
            const referrerId = referrer[0].id;
            await db.query(
                'INSERT INTO referrals (referrer_id, referred_id, bonus_amount) VALUES ($1, $2, 0)',
                [referrerId, newUserId]
            );
        }
    } catch (error) {
        console.error('Error processing referral:', error);
    }
}

module.exports = { generateReferralCode, processReferral };
