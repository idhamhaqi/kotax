const db = require('./config/database');

async function check() {
    try {
        const result1 = await db.pool.query(
            "SELECT pid, state, query, wait_event_type, wait_event FROM pg_stat_activity WHERE datname = current_database() AND state != 'idle'"
        );
        const rows = result1.rows;
        console.log('Active/waiting queries:');
        if (rows.length === 0) {
            console.log('  (none)');
        } else {
            rows.forEach(r => console.log(' ', JSON.stringify(r)));
        }
        
        // Also check for locks
        const lockResult = await db.pool.query(
            "SELECT blocked_locks.pid AS blocked_pid, blocking_locks.pid AS blocking_pid, blocked_activity.query AS blocked_query, blocking_activity.query AS blocking_query FROM pg_catalog.pg_locks blocked_locks JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid AND blocking_locks.pid != blocked_locks.pid JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid WHERE NOT blocked_locks.granted"
        );
        console.log('\nBlocked queries (deadlocks):');
        if (lockResult.rows.length === 0) {
            console.log('  (none)');
        } else {
            lockResult.rows.forEach(r => console.log(' ', JSON.stringify(r)));
        }
    } catch(e) {
        console.error('Error:', e.message);
    }
    process.exit();
}

check();
