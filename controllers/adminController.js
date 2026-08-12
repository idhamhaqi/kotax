const db = require('../config/database');
const path = require('path');
const { deleteDepositProof } = require('../utils/imageProcessor');
const { sendDepositEmail, sendWithdrawalEmail } = require('../services/emailService');

const UPLOAD_PATH = path.join(__dirname, '../public/uploads/deposit-proofs');

// Admin Dashboard (Statistics strictly filtered for Real Users only)
async function getDashboard(req, res) {
    try {
        // Get system statistics for real users only
        const [userStats] = await db.query(
            `SELECT
                COUNT(*)::INTEGER as total_users,
                COALESCE(SUM(balance), 0)::NUMERIC as total_balance,
                COALESCE(SUM(quota_gb), 0)::NUMERIC as total_quota
             FROM users
             WHERE COALESCE(user_type, 'real') = 'real'`
        );

        // Get total approved deposits for real users only
        const [depositStats] = await db.query(
            `SELECT COALESCE(SUM(d.amount), 0)::NUMERIC as total_deposits
             FROM deposits d
             JOIN users u ON d.user_id = u.id
             WHERE d.status = $1 AND COALESCE(u.user_type, 'real') = 'real'`,
            ['approved']
        );

        // Get total approved withdrawals for real users only
        const [withdrawalStats] = await db.query(
            `SELECT COALESCE(SUM(w.amount), 0)::NUMERIC as total_withdrawals
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             WHERE w.status = $1 AND COALESCE(u.user_type, 'real') = 'real'`,
            ['approved']
        );

        // Get total fill orders from fill_order_history for real users only
        const [fillOrderStats] = await db.query(
            `SELECT COALESCE(SUM(f.price), 0)::NUMERIC as total_fill_orders
             FROM fill_order_history f
             JOIN users u ON f.user_id = u.id
             WHERE COALESCE(u.user_type, 'real') = 'real'`
        );

        // Combine stats
        const transStats = [{
            total_deposits: depositStats[0].total_deposits,
            total_withdrawals: withdrawalStats[0].total_withdrawals,
            total_fill_orders: fillOrderStats[0].total_fill_orders
        }];

        const [pendingDeposits] = await db.query(
            `SELECT COUNT(*)::INTEGER as count
             FROM deposits d
             JOIN users u ON d.user_id = u.id
             WHERE d.status = $1 AND COALESCE(u.user_type, 'real') = 'real'`,
            ['pending']
        );

        const [pendingWithdrawals] = await db.query(
            `SELECT COUNT(*)::INTEGER as count
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             WHERE w.status = $1 AND COALESCE(u.user_type, 'real') = 'real'`,
            ['pending']
        );

        const [recentUsers] = await db.query(
            `SELECT id, full_name, email, balance, quota_gb, COALESCE(user_type, 'real') as user_type, created_at
             FROM users
             WHERE COALESCE(user_type, 'real') = 'real'
             ORDER BY created_at DESC LIMIT 10`
        );

        res.render('admin/dashboard', {
            stats: {
                users: userStats[0],
                transactions: transStats[0],
                pendingDeposits: pendingDeposits[0].count,
                pendingWithdrawals: pendingWithdrawals[0].count
            },
            recentUsers
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Server error');
    }
}

// Users Management with Pagination
async function getUsers(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const [users] = await db.query(
            `SELECT
                id, full_name, email, whatsapp, phone, balance, quota_gb,
                bank_name, bank_account_number,
                referral_code, referred_by, COALESCE(user_type, 'real') as user_type, created_at,
                (CASE WHEN transaction_pin IS NOT NULL AND transaction_pin != '' THEN TRUE ELSE FALSE END) as has_pin
             FROM users
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const [countResult] = await db.query('SELECT COUNT(*)::INTEGER as total FROM users');
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages,
            totalRecords
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).send('Server error');
    }
}

// Toggle User Type (real <-> dummy)
async function toggleUserType(req, res) {
    try {
        const { userId, userType } = req.body;
        const newType = (userType === 'dummy') ? 'dummy' : 'real';

        await db.query(
            "UPDATE users SET user_type = $1 WHERE id = $2",
            [newType, userId]
        );

        res.json({
            success: true,
            message: `Status user berhasil diubah menjadi ${newType.toUpperCase()}`,
            userType: newType
        });
    } catch (error) {
        console.error('Toggle user type error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Update User Balance/Quota
async function updateUserBalance(req, res) {
    try {
        const { userId, fullName, email, balance, quota, bankName, bankAccount } = req.body;

        // Validate required fields
        if (!fullName || !email) {
            return res.json({ success: false, message: 'Nama dan email harus diisi' });
        }

        // Check if email already exists for other users
        const [existingEmail] = await db.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [email, userId]
        );

        if (existingEmail.length > 0) {
            return res.json({ success: false, message: 'Email sudah digunakan user lain' });
        }

        // Check if bank account already exists for other users
        if (bankAccount && bankAccount.trim() !== '') {
            const [existingBank] = await db.query(
                'SELECT id FROM users WHERE bank_account_number = $1 AND id != $2',
                [bankAccount.trim(), userId]
            );

            if (existingBank.length > 0) {
                return res.json({ success: false, message: 'Nomor rekening sudah digunakan user lain' });
            }
        }

        // Update user data (without obsolete quota_gb)
        await db.query(
            `UPDATE users SET
                full_name = $1,
                email = $2,
                balance = $3,
                bank_name = $4,
                bank_account_number = $5
            WHERE id = $6`,
            [fullName, email, balance, bankName || null, bankAccount || null, userId]
        );

        res.json({ success: true, message: 'User berhasil diupdate' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Delete User safely with transaction
async function deleteUser(req, res) {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID required' });
    }

    const connection = await db.getConnection();
    let deleted = false;
    try {
        await connection.beginTransaction();

        // Lock user row first
        const [users] = await connection.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        // Delete user (DB FK ON DELETE CASCADE handles child tables)
        await connection.query('DELETE FROM users WHERE id = $1', [userId]);

        await connection.commit();
        deleted = true;
    } catch (error) {
        await connection.rollback();
        console.error('Delete user error:', error);
        return res.status(500).json({ success: false, message: 'Gagal menghapus user' });
    } finally {
        connection.release();
    }

    if (deleted) {
        return res.json({ success: true, message: 'User berhasil dihapus' });
    }
}

// Deposits Management
async function getDeposits(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        // Get deposits with pagination
        const [deposits] = await db.query(
            `SELECT
                d.id, d.amount, d.unique_amount, d.proof_image, d.sender_name, d.status, d.admin_note, d.created_at,
                u.full_name as user_name, u.email, u.balance as user_balance
             FROM deposits d
             JOIN users u ON d.user_id = u.id
             ORDER BY d.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        // Get total count for pagination
        const [countResult] = await db.query('SELECT COUNT(*)::INTEGER as total FROM deposits');
        const totalPages = Math.ceil(countResult[0].total / limit);

        res.render('admin/deposits', {
            deposits,
            currentPage: page,
            totalPages,
            totalRecords: countResult[0].total
        });
    } catch (error) {
        console.error('Get deposits error:', error);
        res.status(500).send('Server error');
    }
}

// Approve Deposit
async function approveDeposit(req, res) {
    try {
        const { depositId } = req.body;

        const connection = await db.getConnection();
        let isApproved = false;
        let deposit = null;
        let creditAmount = 0;
        let userEmail = null;
        let userFullName = null;

        try {
            await connection.beginTransaction();

            // Get deposit info and lock row
            const [deposits] = await connection.query(
                'SELECT user_id, amount, unique_amount FROM deposits WHERE id = $1 AND status = $2 FOR UPDATE',
                [depositId, 'pending']
            );

            if (deposits.length === 0) {
                await connection.rollback();
                return res.json({ success: false, message: 'Deposit not found or already processed' });
            }

            deposit = deposits[0];
            creditAmount = deposit.unique_amount ? Number(deposit.unique_amount) : Number(deposit.amount);

            // Lock user row
            await connection.query(
                'SELECT id FROM users WHERE id = $1 FOR UPDATE',
                [deposit.user_id]
            );

            // Update deposit status
            await connection.query(
                'UPDATE deposits SET status = $1, updated_at = NOW() WHERE id = $2',
                ['approved', depositId]
            );

            // Add balance to user (Full Unique Amount)
            await connection.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [creditAmount, deposit.user_id]
            );

            // Record transaction
            await connection.query(
                `INSERT INTO transactions (user_id, type, amount, description)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [deposit.user_id, 'deposit', creditAmount, 'Deposit approved by admin']
            );

            // Fetch user email to send notification
            const [users] = await connection.query('SELECT full_name, email FROM users WHERE id = $1', [deposit.user_id]);
            userEmail = users.length > 0 ? users[0].email : null;
            userFullName = users.length > 0 ? users[0].full_name : null;

            await connection.commit();
            isApproved = true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        if (isApproved) {
            if (userEmail) {
                try {
                    sendDepositEmail(userEmail, userFullName, creditAmount, 'approved');
                } catch (emailErr) {
                    console.error('[Admin Deposit Email Error]', emailErr);
                }
            }

            // Emit socket events
            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('deposit-updated', { id: depositId, status: 'approved' });
                io.to('user-' + deposit.user_id).emit('balance-updated');
                io.to('admin').emit('stats-updated');
            }

            return res.json({ success: true, message: 'Deposit approved successfully' });
        }
    } catch (error) {
        console.error('Approve deposit error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Reject Deposit
async function rejectDeposit(req, res) {
    try {
        const { depositId } = req.body;

        const connection = await db.getConnection();
        let isRejected = false;
        let deposit = null;
        let userEmail = null;
        let userFullName = null;

        try {
            await connection.beginTransaction();

            // Get deposit info to delete proof image and lock row
            const [deposits] = await connection.query(
                'SELECT user_id, amount, proof_image FROM deposits WHERE id = $1 AND status = $2 FOR UPDATE',
                [depositId, 'pending']
            );

            if (deposits.length === 0) {
                await connection.rollback();
                return res.json({ success: false, message: 'Deposit not found or already processed' });
            }

            deposit = deposits[0];

            if (deposit.proof_image) {
                // Delete proof image file
                await deleteDepositProof(deposit.proof_image, UPLOAD_PATH);
            }

            // Update status to rejected
            await connection.query(
                'UPDATE deposits SET status = $1, updated_at = NOW() WHERE id = $2',
                ['rejected', depositId]
            );

            // Fetch user email to send notification
            const [users] = await connection.query('SELECT full_name, email FROM users WHERE id = $1', [deposit.user_id]);
            userEmail = users.length > 0 ? users[0].email : null;
            userFullName = users.length > 0 ? users[0].full_name : null;

            await connection.commit();
            isRejected = true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        if (isRejected) {
            if (userEmail) {
                try {
                    sendDepositEmail(userEmail, userFullName, deposit.amount, 'rejected');
                } catch (emailErr) {
                    console.error('[Admin Reject Deposit Email Error]', emailErr);
                }
            }

            // Emit socket events
            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('deposit-updated', { id: depositId, status: 'rejected' });
                io.to('admin').emit('stats-updated');
            }

            return res.json({ success: true, message: 'Deposit rejected' });
        }
    } catch (error) {
        console.error('Reject deposit error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Withdrawals Management
async function getWithdrawals(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const [withdrawals] = await db.query(
            `SELECT
                w.id, w.amount, w.bank_name, w.bank_account_number,
                w.account_holder_name, w.status, w.created_at,
                u.full_name, u.email, u.balance as user_balance
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             ORDER BY w.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const [countResult] = await db.query('SELECT COUNT(*)::INTEGER as total FROM withdrawals');
        const totalPages = Math.ceil(countResult[0].total / limit);

        res.render('admin/withdrawals', {
            withdrawals,
            currentPage: page,
            totalPages,
            totalRecords: countResult[0].total
        });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        res.status(500).send('Server error');
    }
}

// Approve Withdrawal
async function approveWithdrawal(req, res) {
    try {
        const { withdrawalId } = req.body;

        const connection = await db.getConnection();
        let isApproved = false;
        let withdrawal = null;
        let userEmail = null;
        let userFullName = null;

        try {
            await connection.beginTransaction();

            const [withdrawals] = await connection.query(
                'SELECT user_id, amount FROM withdrawals WHERE id = $1 AND status = $2 FOR UPDATE',
                [withdrawalId, 'pending']
            );

            if (withdrawals.length === 0) {
                await connection.rollback();
                return res.json({ success: false, message: 'Withdrawal not found or already processed' });
            }

            withdrawal = withdrawals[0];

            // Just update status (balance already deducted when requested)
            await connection.query(
                'UPDATE withdrawals SET status = $1, updated_at = NOW() WHERE id = $2',
                ['approved', withdrawalId]
            );

            const [users] = await connection.query('SELECT full_name, email FROM users WHERE id = $1', [withdrawal.user_id]);
            userEmail = users.length > 0 ? users[0].email : null;
            userFullName = users.length > 0 ? users[0].full_name : null;

            await connection.commit();
            isApproved = true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        if (isApproved) {
            if (userEmail) {
                try {
                    sendWithdrawalEmail(userEmail, userFullName, withdrawal.amount, 'approved');
                } catch (emailErr) {
                    console.error('[Admin Approve Withdrawal Email Error]', emailErr);
                }
            }

            // Emit socket events
            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('withdrawal-updated', { id: withdrawalId, status: 'approved' });
                io.to('user-' + withdrawal.user_id).emit('balance-updated');
                io.to('admin').emit('stats-updated');
            }

            return res.json({ success: true, message: 'Withdrawal approved successfully' });
        }
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Reject Withdrawal
async function rejectWithdrawal(req, res) {
    try {
        const { withdrawalId } = req.body;

        const connection = await db.getConnection();
        let isRejected = false;
        let withdrawal = null;
        let userEmail = null;
        let userFullName = null;

        try {
            await connection.beginTransaction();

            // Get withdrawal info
            const [withdrawals] = await connection.query(
                'SELECT user_id, amount FROM withdrawals WHERE id = $1 AND status = $2 FOR UPDATE',
                [withdrawalId, 'pending']
            );

            if (withdrawals.length === 0) {
                await connection.rollback();
                return res.json({ success: false, message: 'Withdrawal not found or already processed' });
            }

            withdrawal = withdrawals[0];

            // Lock user row
            await connection.query(
                'SELECT id FROM users WHERE id = $1 FOR UPDATE',
                [withdrawal.user_id]
            );

            // Update withdrawal status
            await connection.query(
                'UPDATE withdrawals SET status = $1, updated_at = NOW() WHERE id = $2',
                ['rejected', withdrawalId]
            );

            // Return balance to user
            await connection.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [withdrawal.amount, withdrawal.user_id]
            );

            const [usersEmail] = await connection.query('SELECT full_name, email FROM users WHERE id = $1', [withdrawal.user_id]);
            userEmail = usersEmail.length > 0 ? usersEmail[0].email : null;
            userFullName = usersEmail.length > 0 ? usersEmail[0].full_name : null;

            await connection.commit();
            isRejected = true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        if (isRejected) {
            if (userEmail) {
                try {
                    sendWithdrawalEmail(userEmail, userFullName, withdrawal.amount, 'rejected');
                } catch (emailErr) {
                    console.error('[Admin Reject Withdrawal Email Error]', emailErr);
                }
            }

            // Emit socket events
            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('withdrawal-updated', { id: withdrawalId, status: 'rejected' });
                io.to('user-' + withdrawal.user_id).emit('balance-updated');
                io.to('admin').emit('stats-updated');
            }

            return res.json({ success: true, message: 'Withdrawal rejected successfully' });
        }
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Transactions Overview (Real users only)
async function getTransactions(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const offset = (page - 1) * limit;

        const [transactions] = await db.query(
            `SELECT
                t.id, t.type, t.amount, t.quota_amount, t.provider,
                t.phone_number, t.description, t.created_at,
                u.full_name, u.email
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE COALESCE(u.user_type, 'real') = 'real'
             ORDER BY t.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const [countResult] = await db.query(
            `SELECT COUNT(*)::INTEGER as total 
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE COALESCE(u.user_type, 'real') = 'real'`
        );
        const totalPages = Math.ceil(countResult[0].total / limit) || 1;

        res.render('admin/transactions', {
            transactions,
            currentPage: page,
            totalPages,
            totalRecords: countResult[0].total
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).send('Server error');
    }
}

// Referral System Overview (Real users only)
async function getReferrals(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const offset = (page - 1) * limit;

        const [bonuses] = await db.query(
            `SELECT
                rb.id, rb.bonus_type, rb.amount, rb.level, rb.percentage,
                rb.description, rb.created_at,
                u1.full_name as receiver_name, u1.email as receiver_email,
                u2.full_name as from_name, u2.email as from_email
             FROM referral_bonuses rb
             JOIN users u1 ON rb.user_id = u1.id
             JOIN users u2 ON rb.from_user_id = u2.id
             WHERE COALESCE(u1.user_type, 'real') = 'real'
             ORDER BY rb.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const [stats] = await db.query(
            `SELECT
                COUNT(*)::INTEGER as total_bonuses,
                COALESCE(SUM(rb.amount), 0) as total_amount,
                COALESCE(SUM(CASE WHEN rb.bonus_type = 'fill_order' THEN rb.amount ELSE 0 END), 0) as fill_order_total
             FROM referral_bonuses rb
             JOIN users u1 ON rb.user_id = u1.id
             WHERE COALESCE(u1.user_type, 'real') = 'real'`
        );

        const [countResult] = await db.query(
            `SELECT COUNT(*)::INTEGER as total
             FROM referral_bonuses rb
             JOIN users u1 ON rb.user_id = u1.id
             WHERE COALESCE(u1.user_type, 'real') = 'real'`
        );
        const totalPages = Math.ceil(countResult[0].total / limit) || 1;

        res.render('admin/referrals', {
            bonuses,
            stats: stats[0],
            currentPage: page,
            totalPages,
            totalRecords: countResult[0].total
        });
    } catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).send('Server error');
    }
}

// Payment Methods Management
async function getPaymentMethodsPage(req, res) {
    try {
        const [methods] = await db.query(
            'SELECT id, name, category, account_number, account_holder, logo_url, qr_code_url, raw_qris, min_deposit, is_active, created_at FROM payment_methods ORDER BY id ASC'
        );

        res.render('admin/payment-methods', { methods });
    } catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).send('Server error');
    }
}

async function createPaymentMethod(req, res) {
    try {
        const { name, category, account_number, account_holder, raw_qris, min_deposit, is_active } = req.body;

        const effectiveName = name ? name.trim() : (category === 'QRIS' ? 'QRIS Dinamis' : '');
        const effectiveHolder = account_holder ? account_holder.trim() : (category === 'QRIS' ? 'QRIS Merchant' : '');

        if (!effectiveName) {
            return res.json({ success: false, message: 'Nama metode pembayaran wajib diisi' });
        }

        const { processPaymentImage } = require('../utils/imageProcessor');
        const PAYMENT_UPLOAD_PATH = path.join(__dirname, '../public/uploads/payment-methods');

        let logoUrl = null;
        let qrCodeUrl = null;

        if (req.files && req.files.logo && req.files.logo[0]) {
            logoUrl = '/uploads/payment-methods/' + await processPaymentImage(req.files.logo[0].buffer, 'logo', PAYMENT_UPLOAD_PATH);
        }

        if (req.files && req.files.qr_code && req.files.qr_code[0]) {
            qrCodeUrl = '/uploads/payment-methods/' + await processPaymentImage(req.files.qr_code[0].buffer, 'qris', PAYMENT_UPLOAD_PATH);
        }

        const accountNumberToSave = account_number ? account_number.trim() : (category === 'QRIS' ? 'QRIS All Payment' : '-');
        const rawQrisToSave = raw_qris ? raw_qris.trim() : null;

        await db.query(
            `INSERT INTO payment_methods (name, category, account_number, account_holder, raw_qris, logo_url, qr_code_url, min_deposit, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                effectiveName,
                category || 'Bank Transfer',
                accountNumberToSave,
                effectiveHolder,
                rawQrisToSave,
                logoUrl,
                qrCodeUrl,
                parseFloat(min_deposit) || 10000,
                is_active === 'true' || is_active === true
            ]
        );

        res.json({ success: true, message: 'Metode pembayaran berhasil ditambahkan' });
    } catch (error) {
        console.error('Create payment method error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function updatePaymentMethod(req, res) {
    try {
        const { id, name, category, account_number, account_holder, raw_qris, min_deposit, is_active, delete_logo, delete_qr_code } = req.body;

        const effectiveName = name ? name.trim() : (category === 'QRIS' ? 'QRIS Dinamis' : '');
        const effectiveHolder = account_holder ? account_holder.trim() : (category === 'QRIS' ? 'QRIS Merchant' : '');

        if (!id || !effectiveName) {
            return res.json({ success: false, message: 'ID dan Nama metode wajib diisi' });
        }

        const [existing] = await db.query('SELECT logo_url, qr_code_url FROM payment_methods WHERE id = $1', [id]);
        if (existing.length === 0) {
            return res.json({ success: false, message: 'Metode pembayaran tidak ditemukan' });
        }

        const { processPaymentImage, deleteFileByUrl } = require('../utils/imageProcessor');
        const PAYMENT_UPLOAD_PATH = path.join(__dirname, '../public/uploads/payment-methods');

        let logoUrl = existing[0].logo_url;
        let qrCodeUrl = existing[0].qr_code_url;

        // Delete existing logo if requested or replaced
        if (delete_logo === 'true' || delete_logo === true || (req.files && req.files.logo && req.files.logo[0])) {
            if (existing[0].logo_url) {
                await deleteFileByUrl(existing[0].logo_url);
            }
            logoUrl = null;
        }

        if (req.files && req.files.logo && req.files.logo[0]) {
            logoUrl = '/uploads/payment-methods/' + await processPaymentImage(req.files.logo[0].buffer, 'logo', PAYMENT_UPLOAD_PATH);
        }

        // Delete existing QR code if requested or replaced
        if (delete_qr_code === 'true' || delete_qr_code === true || (req.files && req.files.qr_code && req.files.qr_code[0])) {
            if (existing[0].qr_code_url) {
                await deleteFileByUrl(existing[0].qr_code_url);
            }
            qrCodeUrl = null;
        }

        if (req.files && req.files.qr_code && req.files.qr_code[0]) {
            qrCodeUrl = '/uploads/payment-methods/' + await processPaymentImage(req.files.qr_code[0].buffer, 'qris', PAYMENT_UPLOAD_PATH);
        }

        const accountNumberToSave = account_number ? account_number.trim() : (category === 'QRIS' ? 'QRIS All Payment' : '-');
        const rawQrisToSave = raw_qris ? raw_qris.trim() : null;

        await db.query(
            `UPDATE payment_methods
             SET name = $1, category = $2, account_number = $3, account_holder = $4, raw_qris = $5,
                 logo_url = $6, qr_code_url = $7, min_deposit = $8, is_active = $9, updated_at = NOW()
             WHERE id = $10`,
            [
                effectiveName,
                category || 'Bank Transfer',
                accountNumberToSave,
                effectiveHolder,
                rawQrisToSave,
                logoUrl,
                qrCodeUrl,
                parseFloat(min_deposit) || 10000,
                is_active === 'true' || is_active === true,
                id
            ]
        );

        res.json({ success: true, message: 'Metode pembayaran berhasil diperbarui' });
    } catch (error) {
        console.error('Update payment method error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function togglePaymentMethodStatus(req, res) {
    try {
        const { id, isActive } = req.body;

        if (!id) {
            return res.json({ success: false, message: 'ID metode tidak valid' });
        }

        await db.query(
            'UPDATE payment_methods SET is_active = $1, updated_at = NOW() WHERE id = $2',
            [isActive === true || isActive === 'true', id]
        );

        res.json({ success: true, message: 'Status metode pembayaran berhasil diperbarui' });
    } catch (error) {
        console.error('Toggle payment method status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function deletePaymentMethod(req, res) {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({ success: false, message: 'ID metode tidak valid' });
        }

        const [existing] = await db.query('SELECT logo_url, qr_code_url FROM payment_methods WHERE id = $1', [id]);
        if (existing.length > 0) {
            const { deleteFileByUrl } = require('../utils/imageProcessor');
            if (existing[0].logo_url) await deleteFileByUrl(existing[0].logo_url);
            if (existing[0].qr_code_url) await deleteFileByUrl(existing[0].qr_code_url);
        }

        await db.query('DELETE FROM payment_methods WHERE id = $1', [id]);

        res.json({ success: true, message: 'Metode pembayaran berhasil dihapus' });
    } catch (error) {
        console.error('Delete payment method error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Reset User Transaction PIN
async function resetUserPin(req, res) {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'ID pengguna tidak valid' });
        }

        await db.query(
            'UPDATE users SET transaction_pin = NULL WHERE id = $1',
            [userId]
        );

        res.json({
            success: true,
            message: 'PIN Transaksi pengguna berhasil direset. Pengguna dapat membuat PIN baru di menu Profil.'
        });
    } catch (error) {
        console.error('Reset user PIN error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Webhook Monitor Page
async function getWebhooksPage(req, res) {
    try {
        res.render('admin/webhook', { title: 'Realtime Webhook Monitor', page: 'webhook' });
    } catch (error) {
        console.error('Error rendering webhook page:', error);
        res.status(500).send('Server error');
    }
}

// Webhook Monitor API (Paginated)
async function getWebhooksAPI(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const offset = (page - 1) * limit;

        const [webhooks] = await db.query(
            `SELECT id, provider, event_type, status, http_code, payload, ip_address, response_body, created_at
             FROM webhook_logs
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const [countRes] = await db.query('SELECT COUNT(*)::INTEGER as total FROM webhook_logs');
        const totalRecords = countRes[0].total;
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        res.json({
            success: true,
            webhooks,
            currentPage: page,
            totalPages,
            totalRecords
        });
    } catch (error) {
        console.error('Get webhooks API error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Helper to log incoming webhook and notify admin via Socket.IO
async function logWebhookEvent({ provider = 'PPOB Supplier', event_type = 'transaction_update', status = 'success', http_code = 200, payload = {}, ip_address = '127.0.0.1', response_body = '', io = null }) {
    try {
        const [res] = await db.query(
            `INSERT INTO webhook_logs (provider, event_type, status, http_code, payload, ip_address, response_body)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [provider, event_type, status, http_code, JSON.stringify(payload), ip_address, response_body]
        );
        const loggedEntry = res[0];

        if (io) {
            io.emit('admin-new-webhook', loggedEntry);
        }
        return loggedEntry;
    } catch (error) {
        console.error('Error logging webhook event:', error);
    }
}

module.exports = {
    getDashboard,
    getUsers,
    toggleUserType,
    updateUserBalance,
    deleteUser,
    resetUserPin,
    getDeposits,
    approveDeposit,
    rejectDeposit,
    getWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    getTransactions,
    getReferrals,
    getPaymentMethodsPage,
    createPaymentMethod,
    updatePaymentMethod,
    togglePaymentMethodStatus,
    deletePaymentMethod,
    getWebhooksPage,
    getWebhooksAPI,
    logWebhookEvent
};
