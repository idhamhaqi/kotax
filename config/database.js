const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool using PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kuota_aggregator',
    port: process.env.DB_PORT || 5432,
    
    // PostgreSQL pool settings
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Helper wrapper to make it compatible with the previous mysql2/promise syntax
// so we don't have to change everywhere from db.execute to db.query if any exist.
const db = {
    // In pg, query returns { rows, rowCount, command, oid, fields }
    // We wrap it to return an array [rows, fields] like mysql2/promise does.
    query: async (text, params) => {
        const result = await pool.query(text, params);
        return [result.rows, result.fields, result.rowCount];
    },
    execute: async (text, params) => {
        const result = await pool.query(text, params);
        return [result.rows, result.fields, result.rowCount];
    },
    // Expose the raw pool if someone needs to acquire a client for transactions
    getConnection: async () => {
        const client = await pool.connect();
        
        // Wrapper object to avoid mutating the original pg client.
        // Mutating the client causes pg-pool callbacks to be dropped, leading to infinity hangs.
        const wrapper = {
            query: async (text, params) => {
                const result = await client.query(text, params);
                return [result.rows, result.fields, result.rowCount];
            },
            execute: async (text, params) => {
                const result = await client.query(text, params);
                return [result.rows, result.fields, result.rowCount];
            },
            beginTransaction: async () => {
                await client.query('BEGIN');
            },
            commit: async () => {
                await client.query('COMMIT');
            },
            rollback: async () => {
                try {
                    await client.query('ROLLBACK');
                } catch (err) {
                    console.error('Database rollback error (ignored to prevent leak):', err);
                }
            },
            release: () => {
                client.release();
            },
            _client: client // Keep reference to original client just in case
        };
        
        return wrapper;
    },
    pool: pool
};

// Test connection
pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL database');
        client.release();
    })
    .catch(err => {
        console.error('❌ PostgreSQL connection error:', err.message);
    });

module.exports = db;
