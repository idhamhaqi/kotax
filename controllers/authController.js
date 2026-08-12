const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const jwtConfig = require('../config/jwt');
const { generateReferralCode, processReferral } = require('../services/referralService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Request Password Reset Link via Email
async function forgotPassword(req, res) {
    const { email } = req.body;

    if (!email || email.trim() === '') {
        return res.json({ success: false, message: 'Harap masukkan alamat email Anda' });
    }

    try {
        const [users] = await db.query(
            'SELECT id, full_name, email, is_verified FROM users WHERE email = $1',
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            // For security, do not reveal if email is not registered
            return res.json({
                success: true,
                message: 'Jika email Anda terdaftar, link untuk mereset password telah dikirim ke email Anda. Silakan periksa inbox/spam.'
            });
        }

        const user = users[0];

        if (!user.is_verified) {
            return res.json({
                success: false,
                message: 'Email akun ini belum diverifikasi. Silakan lakukan verifikasi email terlebih dahulu.'
            });
        }

        // Generate cryptographically secure random 64-char token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry

        await db.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires_at = $2 WHERE id = $3',
            [resetToken, expiresAt, user.id]
        );

        const protocol = req.protocol || 'http';
        const host = req.get('host');
        const resetLink = `${protocol}://${host}/reset-password?token=${resetToken}`;

        // Send Email asynchronously
        sendPasswordResetEmail(user.email, user.full_name, resetLink);

        res.json({
            success: true,
            message: 'Link untuk mereset password telah dikirim ke email Anda. Silakan periksa inbox/spam email Anda.'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Reset Password using token
async function resetPassword(req, res) {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.json({ success: false, message: 'Data tidak lengkap' });
    }

    if (newPassword.length < 6) {
        return res.json({ success: false, message: 'Password minimal 6 karakter' });
    }

    try {
        const [users] = await db.query(
            `SELECT id, email, reset_password_expires_at 
             FROM users 
             WHERE reset_password_token = $1`,
            [token]
        );

        if (users.length === 0) {
            return res.json({ success: false, message: 'Link reset password tidak valid atau sudah pernah digunakan.' });
        }

        const user = users[0];

        if (new Date() > new Date(user.reset_password_expires_at)) {
            return res.json({ success: false, message: 'Link reset password telah kadaluarsa. Silakan minta link baru.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and invalidate token
        await db.query(
            `UPDATE users 
             SET password = $1, reset_password_token = NULL, reset_password_expires_at = NULL 
             WHERE id = $2`,
            [hashedPassword, user.id]
        );

        res.json({
            success: true,
            message: 'Password Anda berhasil diperbarui! Silakan login dengan password baru Anda.',
            redirect: '/login'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Register new user
async function register(req, res) {
    const { full_name, email, bank_name, bank_account_number, phone, province, city, whatsapp, password, referral_code } = req.body;

    try {
        // Check if email already exists
        const [existingEmail] = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingEmail.length > 0) {
            return res.json({ success: false, message: 'Email sudah terdaftar' });
        }

        // Check if bank account number already exists (if provided)
        if (bank_account_number && bank_account_number.trim() !== '') {
            const [existingBank] = await db.query('SELECT id FROM users WHERE bank_account_number = $1', [bank_account_number.trim()]);
            if (existingBank.length > 0) {
                return res.json({ success: false, message: 'Nomor rekening sudah terdaftar. Satu nomor rekening hanya dapat digunakan untuk satu akun.' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate unique referral code for new user
        const newReferralCode = await generateReferralCode();

        // Validate referral code is provided and exists
        if (!referral_code || referral_code.trim() === '') {
            return res.json({ success: false, message: 'Kode referral wajib diisi' });
        }
        const cleanReferralCode = referral_code.trim().toUpperCase();
        
        let referrerCodeToSave = cleanReferralCode;
        if (cleanReferralCode === 'ROOT') {
            referrerCodeToSave = null;
        } else {
            const [referrerCheck] = await db.query('SELECT id FROM users WHERE referral_code = $1', [cleanReferralCode]);
            if (referrerCheck.length === 0) {
                return res.json({ success: false, message: 'Kode referral tidak valid. Pastikan kode yang Anda masukkan benar.' });
            }
        }

        // Generate OTP
        const otpCode = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        const [result] = await db.query(
            `INSERT INTO users (full_name, email, password, bank_name, bank_account_number, phone, province, city, whatsapp, referral_code, referred_by, otp_code, otp_expires_at, is_verified, user_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, 'real') RETURNING id`,
            [full_name, email, hashedPassword, bank_name, bank_account_number, phone || null, province || null, city || null, whatsapp || null, newReferralCode, referrerCodeToSave, otpCode, otpExpiresAt]
        );

        const userId = result[0].id;

        // Process referral if provided
        if (referrerCodeToSave) {
            await processReferral(referrerCodeToSave, userId);
        }

        // Send OTP email asynchronously
        sendVerificationEmail(email, full_name, otpCode);

        res.json({
            success: true,
            message: 'Registrasi berhasil! Silakan periksa email Anda untuk kode verifikasi.',
            referralCode: newReferralCode,
            redirect: '/verify-email?email=' + encodeURIComponent(email)
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Login user
async function login(req, res) {
    const { email, password } = req.body;

    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Email atau password salah' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Email atau password salah' });
        }

        // Check verification
        if (!user.is_verified) {
            return res.status(403).json({ 
                success: false, 
                message: 'Email belum diverifikasi. Silakan periksa email Anda.',
                redirect: '/verify-email?email=' + encodeURIComponent(email)
            });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });

        // Set cookie
        res.cookie('token', token, jwtConfig.cookieOptions);

        res.json({
            success: true,
            message: 'Login berhasil',
            redirect: '/dashboard'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Logout user
function logout(req, res) {
    res.clearCookie('token');
    res.redirect('/login');
}

// Get current user info
async function getCurrentUser(req, res) {
    try {
        const [users] = await db.query(
            'SELECT id, full_name, email, balance, quota_gb, referral_code, bank_name, bank_account_number FROM users WHERE id = $1',
            [req.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        res.json({ success: true, user: users[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

function maskName(name) {
    if (!name) return '***';
    const parts = name.trim().split(/\s+/);
    return parts.map(part => {
        if (part.length <= 2) return part[0] + '*';
        return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
    }).join(' ');
}

const failedOtpAttempts = new Map();

// Check if referral code exists and is valid
async function checkReferralCode(req, res) {
    const { code } = req.query;
    
    if (!code || code.trim() === '') {
        return res.json({ success: false, message: 'Kode referral harus diisi' });
    }
    
    if (code.trim().toUpperCase() === 'ROOT') {
        return res.json({
            success: true,
            message: 'Kode referral Master valid',
            owner: 'Sistem / Admin'
        });
    }
    
    try {
        const [users] = await db.query(
            'SELECT id, full_name FROM users WHERE referral_code = $1',
            [code.trim().toUpperCase()]
        );
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Kode referral tidak ditemukan' });
        }
        
        res.json({
            success: true,
            message: 'Kode referral valid',
            owner: maskName(users[0].full_name)
        });
    } catch (error) {
        console.error('Check referral error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Verify OTP
async function verifyOtp(req, res) {
    const { email, otpCode } = req.body;
    
    if (!email || !otpCode) {
        return res.json({ success: false, message: 'Data tidak lengkap' });
    }

    try {
        const attempts = failedOtpAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
        if (attempts.count >= 5 && (Date.now() - attempts.lastAttempt < 15 * 60 * 1000)) {
            return res.json({ success: false, message: 'Terlalu banyak percobaan OTP yang salah. Silakan kirim ulang kode OTP.' });
        }

        const [users] = await db.query('SELECT id, otp_code, otp_expires_at, is_verified FROM users WHERE email = $1', [email]);
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Email tidak ditemukan' });
        }
        
        const user = users[0];
        
        if (user.is_verified) {
            return res.json({ success: true, message: 'Akun sudah diverifikasi sebelumnya' });
        }

        if (user.otp_code !== otpCode) {
            attempts.count += 1;
            attempts.lastAttempt = Date.now();
            failedOtpAttempts.set(email, attempts);
            return res.json({
                success: false,
                message: `Kode OTP salah. (Sisa kesempatan: ${Math.max(0, 5 - attempts.count)})`
            });
        }

        if (new Date() > new Date(user.otp_expires_at)) {
            return res.json({ success: false, message: 'Kode OTP sudah kadaluarsa. Silakan kirim ulang.' });
        }

        // On success: clear failed attempts
        failedOtpAttempts.delete(email);

        // Update user to verified
        await db.query('UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);

        res.json({ success: true, message: 'Verifikasi berhasil! Mengarahkan ke halaman login...' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Resend OTP
async function resendOtp(req, res) {
    const { email } = req.body;
    
    if (!email) {
        return res.json({ success: false, message: 'Email diperlukan' });
    }

    try {
        const [users] = await db.query('SELECT id, full_name, is_verified, otp_expires_at FROM users WHERE email = $1', [email]);
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Email tidak ditemukan' });
        }
        
        const user = users[0];
        
        if (user.is_verified) {
            return res.json({ success: false, message: 'Akun sudah diverifikasi sebelumnya' });
        }

        // Prevent spam: 1 minute cooldown
        // otp_expires_at is 15 mins in the future. So if it's > 14 mins in the future, it means < 1 min has passed.
        if (user.otp_expires_at && new Date() < new Date(new Date(user.otp_expires_at).getTime() - 14 * 60 * 1000)) {
            return res.json({ success: false, message: 'Harap tunggu 1 menit sebelum meminta kode baru' });
        }

        const otpCode = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        await db.query('UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, otpExpiresAt, user.id]);

        sendVerificationEmail(email, user.full_name, otpCode);

        res.json({ success: true, message: 'Kode OTP baru telah dikirim ke email Anda' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = { register, login, logout, getCurrentUser, checkReferralCode, verifyOtp, resendOtp, forgotPassword, resetPassword };
