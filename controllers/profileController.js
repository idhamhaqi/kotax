const db = require('../config/database');
const bcrypt = require('bcryptjs');

// Get profile page
async function getProfilePage(req, res) {
    try {
        res.render('profile', { page: 'profile' });
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
}

// Get profile data (without stats - moved to dashboard)
async function getProfileData(req, res) {
    try {
        const userId = req.userId;

        // Get user profile data
        const [users] = await db.query(
            `SELECT full_name, email, bank_name, bank_account_number,
                    referral_code, transaction_pin, created_at
             FROM users WHERE id = $1`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];

        res.json({
            success: true,
            profile: {
                fullName: user.full_name,
                email: user.email,
                bankName: user.bank_name,
                bankAccountNumber: user.bank_account_number,
                referralCode: user.referral_code,
                hasPin: Boolean(user.transaction_pin),
                memberSince: user.created_at
            }
        });

    } catch (error) {
        console.error('Error getting profile data:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Set 6-Digit Transaction PIN
async function setTransactionPin(req, res) {
    try {
        const userId = req.userId;
        const { pin, confirmPin, password } = req.body;

        if (!pin || !confirmPin || !password) {
            return res.json({
                success: false,
                message: 'Semua field (PIN, Konfirmasi PIN, dan Password) harus diisi'
            });
        }

        if (!/^\d{6}$/.test(pin)) {
            return res.json({
                success: false,
                message: 'PIN Transaksi harus berupa 6 digit angka'
            });
        }

        if (pin !== confirmPin) {
            return res.json({
                success: false,
                message: 'PIN dan Konfirmasi PIN tidak cocok'
            });
        }

        // Get user data
        const [users] = await db.query(
            'SELECT password, transaction_pin FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];

        // Check if user already set PIN
        if (user.transaction_pin) {
            return res.json({
                success: false,
                message: 'PIN Transaksi sudah aktif. Jika Anda lupa PIN, silakan hubungi Admin untuk melakukan reset.'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.json({
                success: false,
                message: 'Password akun Anda salah!'
            });
        }

        // Hash PIN and save
        const hashedPin = await bcrypt.hash(pin, 10);
        await db.query(
            'UPDATE users SET transaction_pin = $1 WHERE id = $2',
            [hashedPin, userId]
        );

        res.json({
            success: true,
            message: 'PIN Transaksi 6-Digit berhasil disimpan & diaktifkan!'
        });
    } catch (error) {
        console.error('Set transaction PIN error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Change password
async function changePassword(req, res) {
    try {
        const userId = req.userId;
        const { currentPassword, newPassword, repeatPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword || !repeatPassword) {
            return res.json({
                success: false,
                message: 'Semua field harus diisi'
            });
        }

        if (newPassword !== repeatPassword) {
            return res.json({
                success: false,
                message: 'Password baru dan konfirmasi password tidak cocok'
            });
        }

        if (newPassword.length < 6) {
            return res.json({
                success: false,
                message: 'Password baru minimal 6 karakter'
            });
        }

        // Get current user password
        const [users] = await db.query(
            'SELECT password FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, users[0].password);
        if (!validPassword) {
            return res.json({
                success: false,
                message: 'Password saat ini salah'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await db.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        res.json({
            success: true,
            message: 'Password berhasil diubah'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    getProfilePage,
    getProfileData,
    setTransactionPin,
    changePassword
};
