const db = require('../config/database');
const { generateUniqueAmount } = require('../utils/uniqueAmount');
const { processDepositProof, deleteDepositProof } = require('../utils/imageProcessor');
const { sendDepositEmail } = require('../services/emailService');
const { convertQRIS, generateQRCodeDataURL } = require('../utils/qrisHelper');
const path = require('path');

const UPLOAD_PATH = path.join(__dirname, '../public/uploads/deposit-proofs');

// Get active payment methods for user deposit selection
async function getActivePaymentMethods(req, res) {
    try {
        const [methods] = await db.query(
            `SELECT id, name, category, account_number, account_holder, logo_url, qr_code_url, raw_qris, min_deposit
             FROM payment_methods
             WHERE is_active = TRUE
             ORDER BY id ASC`
        );

        res.json({ success: true, methods });
    } catch (error) {
        console.error('Get active payment methods error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Step 1: Initiate deposit - LANGSUNG SAVE KE DATABASE
async function initiateDeposit(req, res) {
    const { amount, paymentMethodId } = req.body;
    const userId = req.userId;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            await connection.rollback();
            return res.json({ success: false, message: 'Jumlah deposit tidak valid' });
        }

        // Validate selected payment method
        const [paymentMethods] = await connection.query(
            'SELECT id, name, category, account_number, account_holder, logo_url, qr_code_url, raw_qris, min_deposit FROM payment_methods WHERE id = $1 AND is_active = TRUE',
            [paymentMethodId]
        );

        if (paymentMethods.length === 0) {
            await connection.rollback();
            return res.json({ success: false, message: 'Metode pembayaran tidak valid atau sedang tidak aktif' });
        }

        const selectedMethod = paymentMethods[0];
        const minDeposit = parseFloat(selectedMethod.min_deposit) || 10000;

        if (numericAmount < minDeposit) {
            await connection.rollback();
            return res.json({
                success: false,
                message: `Minimal deposit untuk ${selectedMethod.name} adalah Rp ${parseInt(minDeposit).toLocaleString('id-ID')}`
            });
        }

        // Check if user already has pending or initiated deposit (FOR UPDATE lock to prevent race condition)
        const [existingDeposit] = await connection.query(
            'SELECT id FROM deposits WHERE user_id = $1 AND status IN ($2, $3) FOR UPDATE',
            [userId, 'initiated', 'pending']
        );

        if (existingDeposit.length > 0) {
            await connection.rollback();
            return res.json({
                success: false,
                message: 'Anda masih memiliki deposit yang belum dikonfirmasi. Silakan upload bukti transfer atau batalkan deposit sebelumnya.'
            });
        }

        let uniqueAmount;
        let isUnique = false;
        let attempts = 0;

        // If user entered a custom amount with non-zero ending digits (e.g. 100123)
        if (numericAmount % 1000 !== 0) {
            const [exactCollision] = await connection.query(
                "SELECT id FROM deposits WHERE unique_amount = $1 AND status IN ('initiated', 'pending')",
                [numericAmount]
            );
            if (exactCollision.length === 0) {
                uniqueAmount = numericAmount;
                isUnique = true;
            }
        }

        // If exact custom amount was taken OR if user entered a round amount (e.g. 100000)
        while (!isUnique && attempts < 10) {
            uniqueAmount = generateUniqueAmount(numericAmount);
            const [collision] = await connection.query(
                "SELECT id FROM deposits WHERE unique_amount = $1 AND status IN ('initiated', 'pending')",
                [uniqueAmount]
            );
            
            if (collision.length === 0) {
                isUnique = true;
            }
            attempts++;
        }
        
        if (!isUnique) {
            await connection.rollback();
            return res.status(500).json({ success: false, message: 'Gagal menghasilkan kode unik untuk deposit. Silakan coba lagi.' });
        }

        // Handle Dynamic QRIS String Generation if method is QRIS
        let dynamicQrisString = null;
        let qrisDataUrl = null;

        if (selectedMethod.category === 'QRIS' && selectedMethod.raw_qris) {
            try {
                dynamicQrisString = convertQRIS(selectedMethod.raw_qris, { amount: uniqueAmount });
                qrisDataUrl = await generateQRCodeDataURL(dynamicQrisString);
            } catch (qrisErr) {
                console.error('[Dynamic QRIS Error]', qrisErr);
            }
        } else if (selectedMethod.category === 'QRIS' && selectedMethod.qr_code_url) {
            qrisDataUrl = selectedMethod.qr_code_url;
        }

        // Save to database
        const [result] = await connection.query(
            `INSERT INTO deposits (user_id, amount, unique_amount, payment_method_name, payment_account_number, dynamic_qris_string, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [userId, numericAmount, uniqueAmount, selectedMethod.name, selectedMethod.account_number, dynamicQrisString, 'initiated']
        );

        await connection.commit();

        const depositId = result[0].id;

        res.json({
            success: true,
            message: 'Deposit berhasil dibuat. Silakan scan QRIS / transfer sesuai nominal unik.',
            deposit: {
                id: depositId,
                amount: numericAmount,
                uniqueAmount,
                status: 'initiated',
                qrisDataUrl: qrisDataUrl,
                isDynamicQris: Boolean(dynamicQrisString),
                paymentMethod: {
                    id: selectedMethod.id,
                    name: selectedMethod.name,
                    category: selectedMethod.category,
                    accountNumber: selectedMethod.account_number,
                    accountHolder: selectedMethod.account_holder,
                    logoUrl: selectedMethod.logo_url,
                    qrCodeUrl: qrisDataUrl || selectedMethod.qr_code_url,
                    minDeposit: selectedMethod.min_deposit
                }
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Initiate deposit error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    } finally {
        connection.release();
    }
}

// Step 2: Upload proof - UPDATE EXISTING DEPOSIT
async function uploadProof(req, res) {
    const { depositId, senderName } = req.body;
    const userId = req.userId;

    try {
        // Validate depositId
        if (!depositId) {
            return res.json({ success: false, message: 'Deposit ID tidak valid' });
        }

        // Validate senderName
        if (!senderName || !senderName.trim()) {
            return res.json({ success: false, message: 'Nama pengirim / atas nama rekening harus diisi' });
        }

        // Get deposit record
        const [deposits] = await db.query(
            'SELECT id, amount, unique_amount, status FROM deposits WHERE id = $1 AND user_id = $2',
            [depositId, userId]
        );

        if (deposits.length === 0) {
            return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan' });
        }

        const deposit = deposits[0];

        // Check if deposit is still in 'initiated' status
        if (deposit.status !== 'initiated') {
            return res.json({
                success: false,
                message: `Deposit sudah dalam status ${deposit.status}. Tidak bisa upload bukti lagi.`
            });
        }

        // Check if file uploaded
        if (!req.file) {
            return res.json({ success: false, message: 'Bukti transfer harus diupload' });
        }

        // Process image (convert to WebP)
        const filename = await processDepositProof(req.file.path || req.file.buffer, req.file.originalname, UPLOAD_PATH);

        // Update deposit with proof image, sender_name and change status to 'pending'
        await db.query(
            'UPDATE deposits SET proof_image = $1, sender_name = $2, status = $3, updated_at = NOW() WHERE id = $4',
            [filename, senderName.trim(), 'pending', depositId]
        );

        // Fetch user email to send notification
        const [users] = await db.query('SELECT full_name, email FROM users WHERE id = $1', [userId]);
        if (users.length > 0) {
            sendDepositEmail(users[0].email, users[0].full_name, deposit.amount, 'pending');
        }

        res.json({
            success: true,
            message: 'Bukti transfer berhasil diupload. Menunggu verifikasi admin.',
            deposit: {
                id: depositId,
                amount: deposit.amount,
                uniqueAmount: deposit.unique_amount,
                proofImage: filename,
                senderName: senderName.trim(),
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('Upload proof error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// LEGACY: Keep old confirmDeposit for backward compatibility (if frontend still use it)
async function confirmDeposit(req, res) {
    const { amount, uniqueAmount, senderName } = req.body;
    const userId = req.userId;

    const validAmounts = [100000, 200000, 300000, 400000, 500000, 1000000, 2000000, 4000000];

    try {
        // Validate amount
        if (!validAmounts.includes(parseInt(amount))) {
            return res.json({ success: false, message: 'Jumlah tidak valid' });
        }

        // Validate unique amount format
        const parsedUniqueAmount = parseFloat(uniqueAmount);
        if (isNaN(parsedUniqueAmount) || parsedUniqueAmount < parseInt(amount)) {
            return res.json({ success: false, message: 'Unique amount tidak valid' });
        }

        // Validate senderName
        if (!senderName || !senderName.trim()) {
            return res.json({ success: false, message: 'Nama pengirim / atas nama rekening harus diisi' });
        }

        // Check if file uploaded
        if (!req.file) {
            return res.json({ success: false, message: 'Bukti transfer harus diupload' });
        }

        // Process image (convert to WebP)
        const filename = await processDepositProof(req.file.path || req.file.buffer, req.file.originalname, UPLOAD_PATH);

        // Save to database
        const [result] = await db.query(
            'INSERT INTO deposits (user_id, amount, unique_amount, proof_image, sender_name, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [userId, parseInt(amount), parsedUniqueAmount, filename, senderName.trim(), 'pending']
        );

        // Fetch user email to send notification
        const [users] = await db.query('SELECT full_name, email FROM users WHERE id = $1', [userId]);
        if (users.length > 0) {
            sendDepositEmail(users[0].email, users[0].full_name, parseInt(amount), 'pending');
        }

        res.json({
            success: true,
            message: 'Deposit berhasil dikonfirmasi. Menunggu verifikasi admin.',
            deposit: {
                id: result[0].id,
                amount: parseInt(amount),
                uniqueAmount: parsedUniqueAmount,
                proofImage: filename,
                senderName: senderName.trim(),
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('Confirm deposit error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Cancel/delete deposit (initiated only)
async function cancelDeposit(req, res) {
    const { depositId } = req.body;
    const userId = req.userId;

    try {
        // Get deposit info - allow cancel for 'initiated' only (if pending, only admin can reject)
        const [deposits] = await db.query(
            'SELECT proof_image, status FROM deposits WHERE id = $1 AND user_id = $2 AND status = $3',
            [depositId, userId, 'initiated']
        );

        if (deposits.length === 0) {
            return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan atau sudah diproses' });
        }

        const deposit = deposits[0];

        // Delete proof image if exists
        if (deposit.proof_image) {
            await deleteDepositProof(deposit.proof_image, UPLOAD_PATH);
        }

        // Delete deposit record
        await db.query('DELETE FROM deposits WHERE id = $1 AND user_id = $2', [depositId, userId]);

        res.json({ success: true, message: 'Deposit dibatalkan' });
    } catch (error) {
        console.error('Cancel deposit error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Get initiated deposits (belum upload bukti)
async function getInitiatedDeposits(req, res) {
    const userId = req.userId;

    try {
        const [deposits] = await db.query(
            `SELECT 
                d.id, d.amount, d.unique_amount, d.status, d.payment_method_name, d.payment_account_number, d.dynamic_qris_string, d.created_at,
                pm.category as payment_category, pm.account_holder as payment_account_holder, 
                pm.logo_url as payment_logo_url, pm.qr_code_url as payment_qr_code_url
             FROM deposits d
             LEFT JOIN payment_methods pm ON d.payment_method_name = pm.name
             WHERE d.user_id = $1 AND d.status = $2
             ORDER BY d.created_at DESC`,
            [userId, 'initiated']
        );

        // Get payment settings for fallback
        const [settings] = await db.query(
            `SELECT setting_key, setting_value FROM settings
             WHERE setting_key IN ('deposit_bank_name', 'deposit_bank_account', 'deposit_account_holder', 'admin_contact')`
        );

        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = setting.setting_value;
        });

        let activePaymentMethod = {
            bankName: settingsObj.deposit_bank_name,
            accountNumber: settingsObj.deposit_bank_account,
            accountHolder: settingsObj.deposit_account_holder,
            category: 'Bank Transfer'
        };

        if (deposits.length > 0) {
            const first = deposits[0];
            let qrisDataUrl = first.payment_qr_code_url;
            if (first.dynamic_qris_string) {
                try {
                    qrisDataUrl = await generateQRCodeDataURL(first.dynamic_qris_string);
                } catch (e) { console.error('QR data URL error:', e); }
            }

            activePaymentMethod = {
                bankName: first.payment_method_name || settingsObj.deposit_bank_name,
                accountNumber: first.payment_account_number || settingsObj.deposit_bank_account,
                accountHolder: first.payment_account_holder || settingsObj.deposit_account_holder,
                category: first.payment_category || 'Bank Transfer',
                logoUrl: first.payment_logo_url,
                qrCodeUrl: qrisDataUrl || first.payment_qr_code_url,
                isDynamicQris: Boolean(first.dynamic_qris_string)
            };
        }

        res.json({
            success: true,
            deposits,
            paymentMethod: activePaymentMethod,
            adminContact: settingsObj.admin_contact
        });
    } catch (error) {
        console.error('Get initiated deposits error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Get user deposit history
async function getDepositHistory(req, res) {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const [deposits] = await db.query(
            'SELECT id, amount, unique_amount, proof_image, sender_name, status, created_at, updated_at FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
            [userId, limit, offset]
        );

        const [countResult] = await db.query(
            'SELECT COUNT(*)::INTEGER as total FROM deposits WHERE user_id = $1',
            [userId]
        );

        res.json({ 
            success: true, 
            deposits,
            pagination: {
                total: countResult[0].total,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < countResult[0].total
            }
        });
    } catch (error) {
        console.error('Get deposit history error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    getActivePaymentMethods,
    initiateDeposit,
    uploadProof,
    confirmDeposit, // Keep for backward compatibility
    cancelDeposit,
    getInitiatedDeposits,
    getDepositHistory
};
