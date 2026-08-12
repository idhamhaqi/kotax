const db = require('../config/database');

// Get history page
async function getHistoryPage(req, res) {
    try {
        res.render('history', { page: 'history' });
    } catch (error) {
        console.error('Error rendering history:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
}

// Get fill order history
async function getFillOrderHistory(req, res) {
    try {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        // Get fill order history with pagination
        const [history] = await db.query(
            `SELECT
                order_id,
                provider,
                phone_number,
                quota_gb,
                price,
                profit,
                source,
                source_type,
                created_at
             FROM fill_order_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        // Get total count for pagination
        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM fill_order_history WHERE user_id = $1',
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
        console.error('Error getting fill order history:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Helper to group midnight settlement credits into 1 collapsible row per date
function groupMutasiTransactions(rawTransactions) {
    const processed = [];
    const settlementGroups = {};

    rawTransactions.forEach(tx => {
        const txDate = new Date(tx.created_at);
        const dateKey = txDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD

        // Group all fill_order_credit transactions by settlement date into 1 single collapsible group
        if (tx.type === 'fill_order_credit') {
            if (!settlementGroups[dateKey]) {
                settlementGroups[dateKey] = {
                    isGroup: true,
                    groupId: `group-${dateKey}`,
                    type: 'settlement_group',
                    title: 'Pencairan Audit Settlement Vendor',
                    dateKey: dateKey,
                    totalAmount: 0,
                    transactionCount: 0,
                    created_at: tx.created_at,
                    items: []
                };
                processed.push(settlementGroups[dateKey]);
            }
            const grp = settlementGroups[dateKey];
            grp.totalAmount += Number(tx.amount || 0);
            grp.transactionCount += 1;
            grp.items.push(tx);
        } else {
            processed.push(tx);
        }
    });

    return processed;
}

// Get mutasi saldo (transactions) history
async function getMutasiHistory(req, res) {
    try {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        // Fetch all transactions for user ordered by date to group settlement credits correctly
        const [allTransactions] = await db.query(
            `SELECT id, type, amount, quota_amount, provider, phone_number, description, created_at
             FROM transactions
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC`,
            [userId]
        );

        // Group settlement credits into single collapsible rows
        const groupedTransactions = groupMutasiTransactions(allTransactions);

        // Paginate over the grouped array
        const paginated = groupedTransactions.slice(offset, offset + limit);

        res.json({
            success: true,
            transactions: paginated,
            pagination: {
                total: groupedTransactions.length,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < groupedTransactions.length
            }
        });
    } catch (error) {
        console.error('Error getting mutasi history:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    getHistoryPage,
    getFillOrderHistory,
    getMutasiHistory
};
