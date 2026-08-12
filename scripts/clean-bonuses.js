const db = require('../config/database');

async function cleanDatabase() {
    try {
        console.log('Cleaning up old bonus and conversion data...');
        
        // Wipe all referral bonuses (start fresh)
        const bonusRes = await db.query('DELETE FROM referral_bonuses');
        console.log(`Deleted ${bonusRes.rowCount} rows from referral_bonuses`);

        // Wipe conversions as it's no longer used
        const convRes = await db.query('DELETE FROM conversions');
        console.log(`Deleted ${convRes.rowCount} rows from conversions`);

        // Also clean up any legacy user quota (optional, but good for starting fresh)
        const userRes = await db.query('UPDATE users SET quota_gb = 0');
        console.log(`Reset quota for ${userRes.rowCount} users`);

        console.log('Database cleanup complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error cleaning database:', error);
        process.exit(1);
    }
}

cleanDatabase();
