const db = require('./config/database');
(async () => {
    try {
        const query = 'UPDATE users SET last_fill_at = $1 WHERE id = $2 AND ($1 - COALESCE(last_fill_at, 0) >= $3) RETURNING id';
        const [res] = await db.query(query, [Date.now(), 1, 3000]);
        console.log('Success:', res);
        process.exit(0);
    } catch(e) {
        console.log('Error:', e.message);
        process.exit(1);
    }
})();
