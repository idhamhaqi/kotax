const { Pool } = require('pg');
require('dotenv').config();

const dbPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kuota_aggregator',
    port: process.env.DB_PORT || 5432,
});

async function cleanAndMigrate() {
    try {
        console.log('🧹 Starting database cleanup and migration for PPOB Agregator B2B model...');

        // 1. Add new tracking columns to users table
        await dbPool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_processed_amount NUMERIC(15,2) DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_processed_date DATE;
        `);
        console.log('✅ Added daily_processed_amount and last_processed_date columns to users table.');

        // 2. Truncate all transaction and operational history tables
        console.log('🗑️  Cleaning old transaction and history records...');
        await dbPool.query(`
            TRUNCATE TABLE conversions, deposits, fill_order_history, transactions, withdrawals, referral_bonuses, referrals, bank_notifications RESTART IDENTITY CASCADE;
        `);
        console.log('✅ Cleaned all transaction, deposit, conversion, history, and referral tables.');

        // 3. Reset user balances and daily allocation fields
        await dbPool.query(`
            UPDATE users 
            SET balance = 0, quota_gb = 0, last_fill_at = 0, last_conversion_date = NULL, daily_processed_amount = 0, last_processed_date = NULL;
        `);
        console.log('✅ Reset all user balances, quotas, and daily allocation counters to 0.');

        console.log('🎉 Database cleanup and migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during cleanup and migration:', error);
        process.exit(1);
    } finally {
        await dbPool.end();
    }
}

cleanAndMigrate();
