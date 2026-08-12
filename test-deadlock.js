const db = require('./config/database');

async function test() {
    try {
        // Test 1: pool query (auto-commit)
        console.time('pool-query');
        const [rows] = await db.query('SELECT balance, quota_gb FROM users WHERE id = $1', [2]);
        console.timeEnd('pool-query');
        console.log('Pool query result:', rows[0]);

        // Test 2: Simulate the EXACT fill-order flow
        // Step A: cooldown UPDATE via pool (like server.js line 183)
        console.time('cooldown-update');
        const now = Date.now();
        const [updateResult] = await db.query(
            `UPDATE users SET last_fill_at = $1 WHERE id = $2 AND ($1 - COALESCE(last_fill_at, 0) >= $3) RETURNING id`,
            [now, 2, 3000]
        );
        console.timeEnd('cooldown-update');
        console.log('Cooldown update rows:', updateResult.length);

        // Step B: getConnection + BEGIN + SELECT FOR UPDATE (like orderService.fillOrder)
        console.time('get-connection');
        const conn = await db.getConnection();
        console.timeEnd('get-connection');
        console.log('Got connection from pool');

        console.time('begin-tx');
        await conn.beginTransaction();
        console.timeEnd('begin-tx');
        console.log('Transaction started');

        console.time('select-for-update');
        const [users] = await conn.query(
            'SELECT quota_gb, balance FROM users WHERE id = $1 FOR UPDATE',
            [2]
        );
        console.timeEnd('select-for-update');
        console.log('FOR UPDATE result:', users[0]);

        await conn.rollback();
        conn.release();
        console.log('Connection released');
        
        console.log('Pool stats before update:', db.pool.totalCount, db.pool.idleCount, db.pool.waitingCount);

        console.time('final-update');
        const [updateResult2] = await db.query('UPDATE users SET last_fill_at = 0 WHERE id = $1', [2]);
        console.timeEnd('final-update');
        console.log('Final update done');

        console.log('\n=== ALL STEPS COMPLETED - NO DEADLOCK ===');
    } catch (e) {
        console.error('ERROR:', e.message);
    }
    process.exit();
}

test();
