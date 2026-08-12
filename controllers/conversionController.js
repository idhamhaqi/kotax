const db = require('../config/database');

const RATE_PER_GB = 2000;
const MIN_QUOTA = 1;
const MAX_QUOTA = 10000;

// Convert balance to quota (legacy endpoint - updated for PPOB B2B model)
async function convertBalanceToQuota(req, res) {
    return res.json({
        success: false,
        message: 'Di PPOB Agregator B2B, Saldo Deposit Anda dapat digunakan secara langsung untuk memproses orderan di Dashboard tanpa perlu konversi kuota.'
    });
}

// Validate conversion feasibility (legacy endpoint - updated for PPOB B2B model)
async function validateConversion(req, res) {
    return res.json({
        success: false,
        message: 'Di PPOB Agregator B2B, Saldo Deposit Anda dapat digunakan secara langsung untuk memproses orderan di Dashboard tanpa perlu konversi kuota.'
    });
}

// Get conversion history with pagination
async function getConversionHistory(req, res) {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const offset = page * limit;

    try {
        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM conversions WHERE user_id = $1',
            [userId]
        );
        const total = countResult[0].total;

        const [conversions] = await db.query(
            `SELECT * FROM conversions
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            success: true,
            conversions,
            hasMore: (offset + limit) < total,
            total
        });
    } catch (error) {
        console.error('Error fetching conversion history:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Server-Sent Events (SSE) for conversion process (legacy endpoint)
async function streamConversion(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: 'Di PPOB Agregator B2B, Saldo Deposit Anda dapat digunakan secara langsung untuk memproses orderan di Dashboard.' })}\n\n`);
    res.end();
}

module.exports = {
    validateConversion,
    convertBalanceToQuota,
    streamConversion,
    getConversionHistory,
    RATE_PER_GB
};
