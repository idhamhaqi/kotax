const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const jwtConfig = require('../config/jwt');

const ADMIN_KEY = process.env.ADMIN_KEY || 'kuota-admin-secret-key-2024';

const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Middleware to gate access to the Admin Login page (Layer 1: URL Secret Key)
function adminLoginGate(req, res, next) {
    const providedKey = req.query.key;
    const hasGateCookie = req.cookies?.admin_gate_grant === 'true';

    // If valid key in query string, grant gate cookie & redirect to clean URL
    if (providedKey === ADMIN_KEY) {
        res.cookie('admin_gate_grant', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 60 * 1000 // 30 minutes access to login form
        });
        const cleanUrl = req.originalUrl.split('?')[0];
        return res.redirect(cleanUrl);
    }

    // If user has gate cookie, allow viewing login page
    if (hasGateCookie) {
        return next();
    }

    // Otherwise, deny access completely (don't reveal login page)
    return res.status(403).render('403');
}

// Controller for Admin Login POST (Layer 2: Real Credentials Login)
async function handleAdminLogin(req, res) {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Check rate limiting on admin login attempts
    const attempt = failedAttempts.get(ip);
    if (attempt && attempt.count >= MAX_ATTEMPTS) {
        if (Date.now() - attempt.lastAttempt < LOCKOUT_TIME) {
            return res.status(429).json({
                success: false,
                message: 'Terlalu banyak percobaan login gagal. Silakan coba lagi 15 menit kemudian.'
            });
        } else {
            failedAttempts.delete(ip);
        }
    }

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi' });
    }

    try {
        let adminUser = null;

        // 1. Try checking database 'admins' table
        const [rows] = await db.query('SELECT * FROM admins WHERE username = $1', [username.trim()]);
        if (rows.length > 0) {
            const valid = await bcrypt.compare(password, rows[0].password);
            if (valid) {
                adminUser = rows[0];
            }
        }

        // 2. Fallback to ENV admin credentials if database admin is not matched
        if (!adminUser) {
            const envUser = process.env.ADMIN_USERNAME || 'admin';
            const envPass = process.env.ADMIN_PASSWORD || 'admin123456';
            if (username.trim() === envUser && password === envPass) {
                adminUser = { id: 1, username: envUser };
            }
        }

        if (!adminUser) {
            const failRecord = failedAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
            failRecord.count += 1;
            failRecord.lastAttempt = Date.now();
            failedAttempts.set(ip, failRecord);

            return res.status(401).json({ success: false, message: 'Username atau password admin salah' });
        }

        // Success: Clear failed attempts
        failedAttempts.delete(ip);

        // Generate Admin JWT Token
        const adminToken = jwt.sign(
            { adminId: adminUser.id, username: adminUser.username, role: 'admin' },
            jwtConfig.secret,
            { expiresIn: '24h' }
        );

        // Set admin token cookie securely
        res.cookie('adminToken', adminToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({
            success: true,
            message: 'Login admin berhasil!',
            redirect: '/admin'
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Middleware to check Admin Access for HTML pages
function checkAdminAccess(req, res, next) {
    const adminToken = req.cookies?.adminToken;

    if (!adminToken) {
        // If not logged in as admin, check if they have gate access to login page
        if (req.cookies?.admin_gate_grant === 'true') {
            return res.redirect('/admin/login');
        }
        return res.status(403).render('403');
    }

    try {
        const decoded = jwt.verify(adminToken, jwtConfig.secret);
        if (decoded && decoded.role === 'admin') {
            req.adminId = decoded.adminId;
            req.adminUsername = decoded.username;
            return next();
        }
        res.clearCookie('adminToken');
        return res.status(403).render('403');
    } catch (error) {
        res.clearCookie('adminToken');
        if (req.cookies?.admin_gate_grant === 'true') {
            return res.redirect('/admin/login');
        }
        return res.status(403).render('403');
    }
}

// Middleware to check Admin Access for API endpoints
function checkAdminAccessAPI(req, res, next) {
    const adminToken = req.cookies?.adminToken || req.headers['x-admin-token'];

    if (!adminToken) {
        return res.status(403).json({ success: false, message: 'Akses ditolak (Forbidden)' });
    }

    try {
        const decoded = jwt.verify(adminToken, jwtConfig.secret);
        if (decoded && decoded.role === 'admin') {
            req.adminId = decoded.adminId;
            req.adminUsername = decoded.username;
            return next();
        }
        return res.status(403).json({ success: false, message: 'Akses ditolak (Forbidden)' });
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Token admin tidak valid atau expired' });
    }
}

// Logout admin
function logoutAdmin(req, res) {
    res.clearCookie('adminToken');
    res.clearCookie('admin_gate_grant');
    res.redirect('/');
}

module.exports = {
    adminLoginGate,
    handleAdminLogin,
    checkAdminAccess,
    checkAdminAccessAPI,
    logoutAdmin
};
