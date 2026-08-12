const { Pool } = require('pg');
require('dotenv').config();

// Connect to the default 'postgres' database first to create our app database if it doesn't exist
const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres', // default db
    port: process.env.DB_PORT || 5432,
});

async function ensureDatabase() {
    const targetDbName = process.env.DB_NAME || 'kuota_aggregator';
    
    try {
        const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
        if (res.rows.length === 0) {
            console.log(`Database "${targetDbName}" not found. Creating it...`);
            // Cannot use parameters for database names in CREATE DATABASE
            await adminPool.query(`CREATE DATABASE "${targetDbName}"`);
            console.log(`✅ Database "${targetDbName}" created successfully.`);
        } else {
            console.log(`✅ Database "${targetDbName}" already exists.`);
        }
    } catch (error) {
        console.error('❌ Error checking/creating database:', error);
        throw error;
    } finally {
        await adminPool.end();
    }
}

async function ensureTables() {
    // Connect to the specific database
    const dbPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'kuota_aggregator',
        port: process.env.DB_PORT || 5432,
    });

    try {
        console.log('Creating tables if they do not exist...');
        
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                phone VARCHAR(20),
                whatsapp VARCHAR(20),
                province VARCHAR(100),
                city VARCHAR(100),
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'agen',
                is_verified BOOLEAN DEFAULT FALSE,
                otp_code VARCHAR(10),
                otp_expires_at TIMESTAMP,
                balance NUMERIC(15,2) DEFAULT 0,
                hold_balance NUMERIC(15,2) DEFAULT 0,
                quota_gb NUMERIC(15,2) DEFAULT 0,
                bank_name VARCHAR(100),
                bank_account_number VARCHAR(50),
                referral_code VARCHAR(10) UNIQUE,
                referred_by VARCHAR(10),
                last_fill_at BIGINT DEFAULT 0,
                last_conversion_date DATE,
                user_type VARCHAR(20) DEFAULT 'real',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) DEFAULT 'real';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS hold_balance NUMERIC(15,2) DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_processed_amount NUMERIC(15,2) DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_processed_date DATE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_allocation_base NUMERIC(15,2) DEFAULT 0;
        `);

        await dbPool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='transaction_pin') THEN
                    ALTER TABLE users ADD COLUMN transaction_pin VARCHAR(255) DEFAULT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='reset_password_token') THEN
                    ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255) DEFAULT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='reset_password_expires_at') THEN
                    ALTER TABLE users ADD COLUMN reset_password_expires_at TIMESTAMP DEFAULT NULL;
                END IF;
            END $$;
        `);
        console.log('✅ Added transaction_pin and reset_password columns to users table (if missing).');

        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS conversions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(15,2) NOT NULL,
                quota_received NUMERIC(15,2) NOT NULL,
                tier_level INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_conversions_user_tier ON conversions(user_id, tier_level);

            CREATE TABLE IF NOT EXISTS payment_methods (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) DEFAULT 'Bank Transfer',
                account_number VARCHAR(100),
                account_holder VARCHAR(100) NOT NULL,
                logo_url VARCHAR(255),
                qr_code_url VARCHAR(255),
                min_deposit NUMERIC(15,2) DEFAULT 100000,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pm_is_active ON payment_methods(is_active);

            CREATE TABLE IF NOT EXISTS deposits (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(15,2) NOT NULL,
                unique_amount NUMERIC(15,2) NOT NULL,
                proof_image VARCHAR(255),
                sender_name VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending',
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS raw_qris TEXT DEFAULT NULL;
            ALTER TABLE deposits ADD COLUMN IF NOT EXISTS sender_name VARCHAR(100);
            ALTER TABLE deposits ADD COLUMN IF NOT EXISTS payment_method_name VARCHAR(100);
            ALTER TABLE deposits ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(100);
            ALTER TABLE deposits ADD COLUMN IF NOT EXISTS dynamic_qris_string TEXT DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON deposits(user_id, status);
            CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

            CREATE TABLE IF NOT EXISTS fill_order_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                order_id VARCHAR(50) NOT NULL,
                provider VARCHAR(50) NOT NULL,
                phone_number VARCHAR(50) NOT NULL,
                quota_gb NUMERIC(15,2) NOT NULL,
                price NUMERIC(15,2) NOT NULL,
                profit NUMERIC(15,2) NOT NULL,
                source VARCHAR(255) NOT NULL,
                source_type VARCHAR(20) NOT NULL,
                is_settled BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE fill_order_history ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT false;
            CREATE INDEX IF NOT EXISTS idx_foh_user_id ON fill_order_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_foh_created_at ON fill_order_history(created_at);
            CREATE INDEX IF NOT EXISTS idx_foh_user_date ON fill_order_history(user_id, created_at);

            CREATE TABLE IF NOT EXISTS referral_bonuses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bonus_type VARCHAR(20) NOT NULL,
                amount NUMERIC(15,2) NOT NULL,
                level INTEGER NOT NULL,
                percentage NUMERIC(5,2) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_rb_user_id ON referral_bonuses(user_id);
            CREATE INDEX IF NOT EXISTS idx_rb_from_user_id ON referral_bonuses(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_rb_bonus_type ON referral_bonuses(bonus_type);
            CREATE INDEX IF NOT EXISTS idx_rb_created_at ON referral_bonuses(created_at);

            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bonus_amount NUMERIC(15,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (referrer_id, referred_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ref_referred_id ON referrals(referred_id);
            CREATE INDEX IF NOT EXISTS idx_ref_referrer_id ON referrals(referrer_id);

            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key);

            CREATE TABLE IF NOT EXISTS webhook_logs (
                id SERIAL PRIMARY KEY,
                provider VARCHAR(100) NOT NULL DEFAULT 'PPOB Aggregator',
                event_type VARCHAR(100) DEFAULT 'transaction_update',
                status VARCHAR(50) DEFAULT 'success',
                http_code INTEGER DEFAULT 200,
                payload JSONB,
                ip_address VARCHAR(50),
                response_body TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(20) NOT NULL,
                amount NUMERIC(15,2) NOT NULL,
                quota_amount NUMERIC(15,2),
                provider VARCHAR(50),
                phone_number VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_trans_user_type ON transactions(user_id, type);
            CREATE INDEX IF NOT EXISTS idx_trans_created_at ON transactions(created_at);

            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(15,2) NOT NULL,
                bank_name VARCHAR(100),
                bank_account_number VARCHAR(50),
                account_holder_name VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending',
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bank_notifications (
                id SERIAL PRIMARY KEY,
                package_name VARCHAR(100),
                app_name VARCHAR(100),
                title TEXT,
                text TEXT,
                amount NUMERIC(15,2),
                device_identifier VARCHAR(100),
                notification_timestamp BIGINT,
                status VARCHAR(20) DEFAULT 'unmatched',
                deposit_id INTEGER REFERENCES deposits(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_bn_timestamp_device ON bank_notifications(notification_timestamp, device_identifier);
            CREATE INDEX IF NOT EXISTS idx_bn_status ON bank_notifications(status);

            CREATE TABLE IF NOT EXISTS pending_order_fills (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                order_id VARCHAR(100) NOT NULL UNIQUE,
                provider VARCHAR(50) NOT NULL,
                package_name VARCHAR(150),
                phone_number VARCHAR(50) NOT NULL,
                quota_gb NUMERIC(15,2) NOT NULL,
                base_price NUMERIC(15,2) NOT NULL,
                price NUMERIC(15,2) NOT NULL,
                profit NUMERIC(15,2) NOT NULL,
                source VARCHAR(255) NOT NULL,
                source_type VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'processing',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pof_user_status ON pending_order_fills(user_id, status);

            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                ticket_code VARCHAR(20) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(200) NOT NULL,
                category VARCHAR(50) DEFAULT 'Umum',
                status VARCHAR(20) DEFAULT 'open',
                priority VARCHAR(20) DEFAULT 'normal',
                attachment_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_st_user_status ON support_tickets(user_id, status);
            CREATE INDEX IF NOT EXISTS idx_st_code ON support_tickets(ticket_code);

            CREATE TABLE IF NOT EXISTS support_ticket_messages (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
                sender_type VARCHAR(20) NOT NULL,
                sender_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                attachment_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_stm_ticket ON support_ticket_messages(ticket_id);
        `);

        // Seed default admin if not existing
        const bcrypt = require('bcryptjs');
        const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
        const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
        const [existingAdmin] = (await dbPool.query('SELECT id FROM admins WHERE username = $1', [defaultAdminUsername])).rows;

        if (!existingAdmin) {
            console.log(`Seeding default admin user "${defaultAdminUsername}"...`);
            const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);
            await dbPool.query('INSERT INTO admins (username, password) VALUES ($1, $2)', [defaultAdminUsername, hashedPassword]);
            console.log('✅ Default admin user created successfully.');
        }

        // Seed default settings if they don't exist
        console.log('Seeding default settings...');
        const defaultSettings = [
            { key: 'deposit_bank_name', value: 'Seabank' },
            { key: 'deposit_bank_account', value: '901062002267' },
            { key: 'deposit_account_holder', value: 'Muha**** idh** ha**' },
            { key: 'admin_contact', value: 'kuotax7' },
            { key: 'order_multiplier', value: '2' },
            { key: 'order_profit_multiplier', value: '2' }
        ];

        for (const setting of defaultSettings) {
            await dbPool.query(`
                INSERT INTO settings (setting_key, setting_value)
                VALUES ($1, $2)
                ON CONFLICT (setting_key) DO NOTHING
            `, [setting.key, setting.value]);
        }

        // Seed default payment methods if table is empty
        const [existingMethods] = (await dbPool.query('SELECT COUNT(*)::INTEGER as count FROM payment_methods')).rows;
        if (existingMethods.count === 0) {
            console.log('Seeding default payment methods...');
            await dbPool.query(`
                INSERT INTO payment_methods (name, category, account_number, account_holder, min_deposit, is_active)
                VALUES 
                ('SeaBank', 'Bank Transfer', '901062002267', 'Muha**** idh** ha**', 100000, TRUE),
                ('DANA', 'E-Wallet', '081234567890', 'KUOTAX OFFICIAL', 100000, TRUE)
            `);
            console.log('✅ Default payment methods seeded successfully.');
        }

        console.log('✅ All tables and default settings have been provisioned successfully!');
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        throw error;
    } finally {
        await dbPool.end();
    }
}

async function run() {
    try {
        await ensureDatabase();
        await ensureTables();
        console.log('🎉 Auto-setup complete.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to setup database', error);
        process.exit(1);
    }
}

run();
