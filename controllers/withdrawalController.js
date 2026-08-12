const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendWithdrawalEmail } = require('../services/emailService');

const MIN_WITHDRAWAL = 100000;

// Create withdrawal request
async function createWithdrawal(req, res) {
    const { amount, pin } = req.body;
    const userId = req.userId;

    let connection;
    try {
        if (!Number.isFinite(amount) || amount <= 0 || amount < MIN_WITHDRAWAL || amount % 1 !== 0) {
            return res.json({
                success: false,
                message: `Jumlah penarikan tidak valid. Minimal Rp ${MIN_WITHDRAWAL.toLocaleString()}`
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get user data
        const [users] = await connection.query(
            'SELECT email, balance, full_name, bank_name, bank_account_number, transaction_pin FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );

        if (users.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];

        // Check if user has set PIN
        if (!user.transaction_pin) {
            await connection.rollback();
            connection.release();
            return res.json({
                success: false,
                requirePinSetup: true,
                message: 'Anda belum mengatur PIN Transaksi 6-Digit. Silakan buat PIN terlebih dahulu di menu Profil.'
            });
        }

        // Verify PIN
        if (!pin || !/^\d{6}$/.test(String(pin))) {
            await connection.rollback();
            connection.release();
            return res.json({
                success: false,
                message: 'PIN Transaksi 6-Digit harus diisi dengan benar!'
            });
        }

        const validPin = await bcrypt.compare(String(pin), user.transaction_pin);
        if (!validPin) {
            await connection.rollback();
            connection.release();
            return res.json({
                success: false,
                message: 'PIN Transaksi yang Anda masukkan salah!'
            });
        }

        if (!user.bank_name || !user.bank_account_number) {
            await connection.rollback();
            connection.release();
            return res.json({
                success: false,
                message: 'Silakan lengkapi data bank (nama bank & nomor rekening) di menu Profil sebelum membuat penarikan.'
            });
        }

        if (user.balance < amount) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: 'Saldo tidak mencukupi' });
        }

        // Create withdrawal request
        const [result] = await connection.query(
            `INSERT INTO withdrawals (user_id, amount, bank_name, bank_account_number, account_holder_name)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [userId, amount, user.bank_name, user.bank_account_number, user.full_name]
        );

        // Deduct balance
        await connection.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);

        await connection.commit();
        connection.release();

        // Send email notification
        if (user.email) {
            try {
                sendWithdrawalEmail(user.email, user.full_name, amount, 'pending');
            } catch (emailErr) {
                console.error('[Withdrawal Email Error]', emailErr);
            }
        }

        res.json({
            success: true,
            message: 'Permintaan penarikan berhasil dibuat',
            withdrawal: {
                id: result[0].id,
                amount,
                bankName: user.bank_name,
                accountNumber: user.bank_account_number
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Create withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Get user withdrawal history
async function getWithdrawalHistory(req, res) {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const [withdrawals] = await db.query(
            'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
            [userId, limit, offset]
        );

        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM withdrawals WHERE user_id = $1',
            [userId]
        );

        res.json({ 
            success: true, 
            withdrawals,
            pagination: {
                total: countResult[0].total,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < countResult[0].total
            }
        });
    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Pre-check withdrawal eligibility before showing PIN modal
async function preCheckWithdrawal(req, res) {
    const { amount } = req.body;
    const userId = req.userId;

    try {
        const parsedAmount = parseInt(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_WITHDRAWAL) {
            return res.json({
                success: false,
                message: `Jumlah penarikan tidak valid. Minimal penarikan adalah Rp ${MIN_WITHDRAWAL.toLocaleString('id-ID')}`
            });
        }

        const [users] = await db.query(
            'SELECT balance, bank_name, bank_account_number, transaction_pin FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];

        // 1. Check if user has set PIN
        if (!user.transaction_pin) {
            return res.json({
                success: false,
                requirePinSetup: true,
                message: 'Anda belum mengatur PIN Transaksi 6-Digit. Silakan buat PIN terlebih dahulu di menu Profil.'
            });
        }

        // 2. Check if bank data is complete
        if (!user.bank_name || !user.bank_account_number) {
            return res.json({
                success: false,
                message: 'Silakan lengkapi data bank (nama bank & nomor rekening) di menu Profil sebelum membuat penarikan.'
            });
        }

        // 3. Check if balance is sufficient
        if (Number(user.balance) < parsedAmount) {
            return res.json({
                success: false,
                message: `Saldo Anda (${'Rp ' + parseInt(user.balance).toLocaleString('id-ID')}) tidak mencukupi untuk melakukan penarikan sebesar ${'Rp ' + parsedAmount.toLocaleString('id-ID')}`
            });
        }

        return res.json({
            success: true,
            message: 'Validasi berhasil. Silakan masukkan PIN Transaksi Anda.'
        });
    } catch (error) {
        console.error('Pre-check withdrawal error:', error);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    createWithdrawal,
    preCheckWithdrawal,
    getWithdrawalHistory
};
