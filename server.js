// Load environment variables first
require('dotenv').config();
const fs = require('fs');
const logFile = fs.createWriteStream('./bun-server.log', { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;
console.log = function(...args) {
    originalLog.apply(console, args);
    logFile.write(`[${new Date().toISOString()}] LOG: ` + args.join(' ') + '\n');
};
console.error = function(...args) {
    originalError.apply(console, args);
    logFile.write(`[${new Date().toISOString()}] ERR: ` + args.join(' ') + '\n');
};


const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const jwtConfig = require('./config/jwt');
const { verifyToken, checkAuth } = require('./middleware/auth');
const { adminLoginGate, handleAdminLogin, checkAdminAccess, checkAdminAccessAPI, logoutAdmin } = require('./middleware/admin');
const OrderService = require('./services/orderService');
const db = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    maxHttpBufferSize: 1e6,
    cors: {
        origin: ["https://kuotax.store", "http://kuotax.store"], // Allow both
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        const validOrigins = ['https://kuotax.store', 'http://kuotax.store'];

        if (!origin || validOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log('⚠️ Blocked origin:', origin);
            callback(null, false);
        }
    }
});

// Track active Socket.IO connections
let activeConnections = 0;
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 1000;

// Expose io to routes/controllers
app.set('io', io);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false
}));

// =================================================================
// == FIX: Tambahkan 'trust proxy' ==
// Memberi tahu Express untuk percaya header dari Nginx/Cloudflare
// =================================================================
app.set('trust proxy', 1); 

// Body parser and cookie parser (Must be BEFORE routes so JSON payloads are parsed!)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Dedicated rate limiter for Webhook (high ceiling for Android Notif Bridge behind Cloudflare)
const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { success: false, message: 'Too many webhook requests' }
});
app.use('/api/webhook', webhookLimiter, require('./routes/webhook'));

// Rate limiting for general user API endpoints
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || (15 * 60 * 1000), 
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, 
    message: { success: false, message: 'Terlalu banyak request. Silakan coba lagi nanti.' }
});
app.use('/api/', limiter);

// Session configuration
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.error('⚠️  WARNING: SESSION_SECRET not set in production! Using default (INSECURE)');
}

app.use(session({
    store: new FileStore({
        path: './sessions',
        ttl: 86400, // 24 hours in seconds
        retries: 0
    }),
    secret: process.env.SESSION_SECRET || 'kuota-aggregator-session-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict', // 'lax' untuk production agar cookie bisa di-set saat redirect
        domain: process.env.COOKIE_DOMAIN || undefined // Allow custom domain setting
    },
    name: 'sessionId', // Custom name to avoid fingerprinting
    proxy: true // Trust the reverse proxy (Nginx)
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Order Service
const orderService = new OrderService(io);

// Google Analytics & Public Tracking Middleware (Public & User Pages ONLY)
let cachedGaScript = '';
let gaLastFetch = 0;

app.use(async (req, res, next) => {
    if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
        return next();
    }
    const now = Date.now();
    if (now - gaLastFetch > 5000) {
        try {
            const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'google_analytics_script'");
            cachedGaScript = rows.length > 0 ? (rows[0].setting_value || '') : '';
            gaLastFetch = now;
        } catch (_e) {}
    }
    res.locals.googleAnalyticsScript = cachedGaScript;
    next();
});

// Routes - Public pages
app.get('/', (req, res) => {
    const token = req.cookies?.token;
    let hasSession = false;
    if (token) {
        try {
            jwt.verify(token, jwtConfig.secret);
            hasSession = true;
        } catch (_err) {
            // Ignore invalid JWT token for guest visitor
        }
    }
    res.render('index', { hasSession });
});
app.get('/login', checkAuth, (req, res) => res.render('login'));
app.get('/register', checkAuth, (req, res) => res.render('register'));
app.get('/verify-email', (req, res) => res.render('verify-email'));
app.get('/forgot-password', checkAuth, (req, res) => res.render('forgot-password'));
app.get('/reset-password', (req, res) => res.render('reset-password', { token: req.query.token || '' }));
app.get('/terms', (req, res) => res.render('terms'));
app.get('/privacy', (req, res) => res.render('privacy'));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sitemap.xml')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'robots.txt')));
app.use('/mitra', require('./routes/mitra'));

// Routes - Protected pages
app.get('/dashboard', verifyToken, (req, res) => res.render('dashboard', { page: 'dashboard' }));
app.get('/deposit', verifyToken, (req, res) => res.render('deposit', { page: 'deposit' }));
app.get('/withdrawal', verifyToken, (req, res) => res.render('withdrawal', { page: 'withdrawal' }));
app.get('/catalog', verifyToken, (req, res) => res.render('buy-quota', { page: 'catalog' }));
app.get('/buy-quota', verifyToken, (req, res) => res.redirect('/catalog'));
app.get('/history', verifyToken, require('./controllers/historyController').getHistoryPage);
app.get('/profile', verifyToken, require('./controllers/profileController').getProfilePage);
app.get('/referral', verifyToken, require('./controllers/referralController').getReferralPage);
app.get('/more', verifyToken, (req, res) => res.render('more', { page: 'more' }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/conversion', require('./routes/conversion'));
app.use('/api/deposit', require('./routes/deposit'));
app.use('/api/withdrawal', require('./routes/withdrawal'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Profile API
const profileController = require('./controllers/profileController');
app.get('/api/profile/data', verifyToken, profileController.getProfileData);
app.post('/api/profile/set-pin', verifyToken, profileController.setTransactionPin);
app.post('/api/profile/change-password', verifyToken, profileController.changePassword);

// History API
const historyController = require('./controllers/historyController');
app.get('/api/history/fill-orders', verifyToken, historyController.getFillOrderHistory);
app.get('/api/history/mutasi', verifyToken, historyController.getMutasiHistory);

// Referral API
const referralController = require('./controllers/referralController');
app.get('/api/referral/data', verifyToken, referralController.getReferralData);
app.get('/api/referral/list', verifyToken, referralController.getReferralList);
app.get('/api/referral/bonuses', verifyToken, referralController.getBonusHistory);

// Configure multer memory storage for admin payment method image uploads
const uploadPaymentImages = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
        }
        cb(null, true);
    }
}).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'qr_code', maxCount: 1 }
]);

// Admin Routes
const adminController = require('./controllers/adminController');
const settingsController = require('./controllers/settingsController');
const supportController = require('./controllers/supportController');
const uploadSupport = require('./middleware/uploadSupport');
app.get('/admin/login', adminLoginGate, (req, res) => res.render('admin/login'));
app.post('/api/admin/login', handleAdminLogin);

app.get('/admin', checkAdminAccess, adminController.getDashboard);
app.get('/admin/users', checkAdminAccess, adminController.getUsers);
app.get('/admin/deposits', checkAdminAccess, adminController.getDeposits);
app.get('/admin/withdrawals', checkAdminAccess, adminController.getWithdrawals);
app.get('/admin/transactions', checkAdminAccess, adminController.getTransactions);
app.get('/admin/referrals', checkAdminAccess, adminController.getReferrals);
app.get('/admin/payment-methods', checkAdminAccess, adminController.getPaymentMethodsPage);
app.get('/admin/webhook', checkAdminAccess, adminController.getWebhooksPage);
app.get('/admin/settings', checkAdminAccess, settingsController.getSettingsPage);
app.get('/admin/tickets', checkAdminAccess, supportController.getAdminTicketsPage);
app.get('/admin/logout', logoutAdmin);

// User Support Page & Routes
app.get('/support', verifyToken, supportController.getSupportPage);
app.use('/api/support', require('./routes/support'));

// Admin API
app.get('/api/admin/webhooks', checkAdminAccessAPI, adminController.getWebhooksAPI);
app.get('/api/admin/webhook-settings', checkAdminAccessAPI, adminController.getWebhookSettings);
app.post('/api/admin/webhook-settings', checkAdminAccessAPI, adminController.updateWebhookSettings);
app.post('/api/admin/users/update', checkAdminAccessAPI, adminController.updateUserBalance);

// Admin Support Ticket API
app.get('/api/admin/support/tickets', checkAdminAccessAPI, supportController.getAdminTickets);
app.get('/api/admin/support/tickets/:id', checkAdminAccessAPI, supportController.getAdminTicketDetail);
app.post('/api/admin/support/tickets/:id/reply', checkAdminAccessAPI, uploadSupport.single('attachment'), supportController.replyTicketAdmin);
app.post('/api/admin/support/tickets/:id/status', checkAdminAccessAPI, supportController.updateTicketStatusAdmin);

// Public Webhook Receiver (Digiflazz / PPOB Aggregator)
app.post('/api/webhook/ppob', async (req, res) => {
    const payload = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const provider = req.headers['x-provider-name'] || payload.provider || 'Digiflazz / PPOB Aggregator';
    const eventType = payload.event || payload.action || 'transaction_update';

    const logged = await adminController.logWebhookEvent({
        provider,
        event_type: eventType,
        status: 'success',
        http_code: 200,
        payload,
        ip_address: String(ip),
        response_body: '{"status":"ok"}',
        io
    });

    res.json({ success: true, message: 'Webhook received & logged successfully', log_id: logged?.id });
});
app.post('/api/admin/users/delete', checkAdminAccessAPI, adminController.deleteUser);
app.post('/api/admin/users/toggle-type', checkAdminAccessAPI, adminController.toggleUserType);
app.post('/api/admin/users/reset-pin', checkAdminAccessAPI, adminController.resetUserPin);
app.post('/api/admin/deposits/approve', checkAdminAccessAPI, adminController.approveDeposit);
app.post('/api/admin/deposits/reject', checkAdminAccessAPI, adminController.rejectDeposit);
app.post('/api/admin/withdrawals/approve', checkAdminAccessAPI, adminController.approveWithdrawal);
app.post('/api/admin/withdrawals/reject', checkAdminAccessAPI, adminController.rejectWithdrawal);
app.post('/api/admin/payment-methods/create', checkAdminAccessAPI, uploadPaymentImages, adminController.createPaymentMethod);
app.post('/api/admin/payment-methods/update', checkAdminAccessAPI, uploadPaymentImages, adminController.updatePaymentMethod);
app.post('/api/admin/payment-methods/toggle-status', checkAdminAccessAPI, adminController.togglePaymentMethodStatus);
app.post('/api/admin/payment-methods/delete', checkAdminAccessAPI, adminController.deletePaymentMethod);
app.post('/api/admin/settings/update', checkAdminAccessAPI, settingsController.updateSettings);
app.post('/api/admin/settings/test-email', checkAdminAccessAPI, settingsController.sendTestEmail);

// Public API for deposit settings
app.get('/api/deposit/settings', verifyToken, settingsController.getDepositSettings);

// Temp test endpoint
app.get('/api/test-orders', (req, res) => res.json(orderService.getActiveOrders()));

// API endpoint for fill order with cooldown
app.post('/api/fill-order', verifyToken, async (req, res) => {
    const { orderId } = req.body;
    const userId = req.userId;

    try {
        const now = Date.now();
        const cooldownMs = 3000;

        console.log('[FillOrder Trace] Starting cooldown update for user', userId);
        const [updateResult] = await db.query(
            `UPDATE users 
             SET last_fill_at = $1 
             WHERE id = $2 AND ($1 - COALESCE(last_fill_at, 0) >= $3)
             RETURNING id`,
            [now, userId, cooldownMs]
        );
        console.log('[FillOrder Trace] Cooldown update finished, rows:', updateResult.length);

        if (updateResult.length === 0) {
            return res.json({
                success: false,
                message: 'Harap tunggu beberapa detik sebelum mengambil order lagi.'
            });
        }

        // Process fill order (orderService handles its own transaction + FOR UPDATE)
        console.log('[FillOrder Trace] Calling orderService.fillOrder for order', orderId);
        const result = await orderService.fillOrder(orderId, userId);
        console.log('[FillOrder Trace] orderService.fillOrder returned success:', result.success);

        if (result.success) {
            // Get updated user stats (fresh read after orderService committed)
            const [updatedUsers] = await db.query(
                'SELECT balance, hold_balance, quota_gb, referral_code FROM users WHERE id = $1',
                [userId]
            );

            const user = updatedUsers[0];
            const balance = Number(user.balance || 0);
            const holdBalance = Number(user.hold_balance || 0);

            // Get referral count
            const [referrals] = await db.query(
                'SELECT COUNT(*)::INTEGER as count FROM referrals WHERE referrer_id = $1',
                [userId]
            );

            // Get fill order statistics
            const [fillStats] = await db.query(
                `SELECT
                    COUNT(*)::INTEGER as total_orders,
                    COALESCE(SUM(price), 0)::NUMERIC as total_volume,
                    COALESCE(SUM(profit), 0)::NUMERIC as total_profit
                 FROM fill_order_history
                 WHERE user_id = $1`,
                [userId]
            );

            const stats = fillStats[0];

            // Emit complete stats to specific user only (not broadcast to all)
            console.log(`[FillOrder] Emitting user-stats-update to user-${userId}`);
            io.to('user-' + userId).emit('user-stats-update', {
                stats: {
                    balance: balance,
                    holdBalance: holdBalance,
                    quotaGb: Number(user.quota_gb || 0),
                    referralCode: user.referral_code,
                    referralCount: Number(referrals[0].count),
                    totalOrders: Number(stats.total_orders),
                    totalVolume: Number(stats.total_volume),
                    totalProfit: Number(stats.total_profit)
                }
            });
        } else {
            // If fill order failed, allow retry by resetting cooldown
            await db.query('UPDATE users SET last_fill_at = 0 WHERE id = $1', [userId]);
        }

        res.json(result);
    } catch (error) {
        console.error('Fill order error:', error);
        res.json({ success: false, message: 'Terjadi kesalahan server' });
    }
});

// Check if user has an active processing order (for page refresh recovery)
app.get('/api/pending-order', verifyToken, async (req, res) => {
    try {
        const pendingOrder = await orderService.getPendingOrder(req.userId);
        res.json({ success: true, pendingOrder });
    } catch (error) {
        console.error('Pending order fetch error:', error);
        res.json({ success: false, pendingOrder: null });
    }
});

// Finalize 2nd step: Credit modal + profit to user hold_balance
app.post('/api/complete-fill-order', verifyToken, async (req, res) => {
    const { orderId } = req.body;
    const userId = req.userId;

    try {
        const result = await orderService.completeFillOrder(orderId, userId);

        if (result.success) {
            // Get fresh updated user stats
            const [updatedUsers] = await db.query(
                'SELECT balance, hold_balance, quota_gb, referral_code FROM users WHERE id = $1',
                [userId]
            );

            const user = updatedUsers[0];
            const balance = Number(user.balance || 0);
            const holdBalance = Number(user.hold_balance || 0);

            const [referrals] = await db.query(
                'SELECT COUNT(*)::INTEGER as count FROM referrals WHERE referrer_id = $1',
                [userId]
            );

            const [fillStats] = await db.query(
                `SELECT
                    COUNT(*)::INTEGER as total_orders,
                    COALESCE(SUM(price), 0)::NUMERIC as total_volume,
                    COALESCE(SUM(profit), 0)::NUMERIC as total_profit
                 FROM fill_order_history
                 WHERE user_id = $1`,
                [userId]
            );

            const stats = fillStats[0];

            io.to('user-' + userId).emit('user-stats-update', {
                stats: {
                    balance: balance,
                    holdBalance: holdBalance,
                    quotaGb: Number(user.quota_gb || 0),
                    referralCode: user.referral_code,
                    referralCount: Number(referrals[0].count),
                    totalOrders: Number(stats.total_orders),
                    totalVolume: Number(stats.total_volume),
                    totalProfit: Number(stats.total_profit)
                }
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Complete fill order error:', error);
        res.json({ success: false, message: 'Terjadi kesalahan server' });
    }
});


// Cookie parser helper for Socket.IO handshake
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name ? name.trim() : '';
        if (!name) return;
        const value = rest.join('=').trim();
        if (!value) return;
        list[name] = decodeURIComponent(value);
    });
    return list;
}

// Socket.IO connection handling with limit & authentication
io.on('connection', (socket) => {
    // Check connection limit
    activeConnections++;

    if (activeConnections > MAX_CONNECTIONS) {
        console.log(`⚠️  Connection limit reached (${activeConnections}/${MAX_CONNECTIONS}). Rejecting:`, socket.id);
        socket.emit('error', { message: 'Server penuh. Silakan coba lagi nanti.' });
        socket.disconnect(true);
        activeConnections--;
        return;
    }

    console.log(`Client connected: ${socket.id} (${activeConnections}/${MAX_CONNECTIONS} active)`);

    // Register user for targeted events (Secured with JWT verification)
    socket.on('register-user', (requestedUserId) => {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        const token = cookies.token;

        if (!token) {
            console.warn(`[Socket Auth] Rejected register-user for socket ${socket.id}: No auth token provided`);
            return;
        }

        try {
            const decoded = jwt.verify(token, jwtConfig.secret);
            const authenticatedUserId = decoded.userId;

            // Ensure requested userId matches token userId
            if (requestedUserId && Number(requestedUserId) !== Number(authenticatedUserId)) {
                console.warn(`[Socket Auth] Security Alert: Socket ${socket.id} attempted to register for user ${requestedUserId} but token belongs to user ${authenticatedUserId}`);
                return;
            }

            socket.userId = authenticatedUserId;
            const room = 'user-' + authenticatedUserId;
            socket.join(room);
            console.log(`[Socket Auth] User ${authenticatedUserId} successfully joined room: ${room}`);
        } catch (error) {
            console.warn(`[Socket Auth] Rejected register-user for socket ${socket.id}: Invalid token`);
        }
    });

    // Register admin for targeted events (Secured with Admin JWT verification)
    socket.on('register-admin', () => {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        const adminToken = cookies.adminToken;

        if (!adminToken) {
            console.warn(`[Socket Auth] Rejected register-admin for socket ${socket.id}: No admin token`);
            return;
        }

        try {
            const decoded = jwt.verify(adminToken, jwtConfig.secret);
            if (decoded && decoded.role === 'admin') {
                socket.join('admin');
                console.log(`[Socket Auth] Admin ${decoded.username} successfully joined room: admin`);
            } else {
                console.warn(`[Socket Auth] Rejected register-admin: Invalid role`);
            }
        } catch (error) {
            console.warn(`[Socket Auth] Rejected register-admin for socket ${socket.id}: Invalid admin token`);
        }
    });

    // Send active orders to new client
    socket.emit('init-orders', orderService.getActiveOrders());

    // Handle disconnect
    socket.on('disconnect', () => {
        activeConnections--;
        console.log(`Client disconnected: ${socket.id} (${activeConnections}/${MAX_CONNECTIONS} active)`);
    });

    // Listen for user stats request (Secured with authenticated socket.userId)
    socket.on('request-stats', async (userId) => {
        try {
            const parsedId = Number(userId || socket.userId);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return;
            }

            // Only allow users to request their own stats
            if (socket.userId && Number(socket.userId) !== parsedId) {
                return;
            }
            
            const [users] = await db.query(
                'SELECT balance, quota_gb FROM users WHERE id = $1',
                [parsedId]
            );
            if (users.length > 0) {
                socket.emit('user-stats-update', { stats: users[0] });
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
        }
    });
});

// Start order generation
orderService.startOrderGeneration();

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', {
        title: 'Halaman Tidak Ditemukan'
    });
});

// Schedule randomized midnight settlement audit (Triggers between 00:05 and 00:15 WIB with random offset)
let settlementRanToday = '';
setInterval(async () => {
    try {
        const nowWib = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' }); // HH:MM:SS
        const todayWib = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
        const parts = nowWib.split(':');
        const hour = parseInt(parts[0]);
        const minute = parseInt(parts[1]);

        if (hour === 0 && minute >= 5 && minute <= 15 && settlementRanToday !== todayWib) {
            settlementRanToday = todayWib;
            const randomDelayMs = Math.floor(Math.random() * 300000) + 10000; // 10s to 5m random delay
            console.log(`⏳ [Settlement Audit] Midnight reached (${nowWib} WIB). Audit will execute in ${Math.round(randomDelayMs/1000)}s...`);
            setTimeout(async () => {
                const OrderService = require('./services/orderService');
                await OrderService.settleHoldBalances(io);
            }, randomDelayMs);
        }
    } catch (e) {
        console.error('Error in settlement audit scheduler:', e);
    }
}, 30000);

// Start server
const PORT = parseInt(process.env.PORT) || 3000;
server.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 Max connections: ${MAX_CONNECTIONS}`);
    console.log(`💾 Database: ${process.env.DB_NAME || 'kuota_aggregator'}`);
    console.log('========================================');
    console.log('');
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received, initiating graceful shutdown...`);

    // 1. Stop accepting new connections
    server.close(() => {
        console.log('✓ HTTP server closed (no new connections)');
    });

    // 2. Stop order generation
    orderService.stopOrderGeneration();

    // 3. Close all Socket.IO connections
    console.log('🔌 Closing Socket.IO connections...');
    io.close(() => {
        console.log('✓ All Socket.IO connections closed');
    });

    // 4. Close database pool
    console.log('💾 Closing database connections...');
    try {
        await db.pool.end();
        console.log('✓ Database pool closed');
    } catch (error) {
        console.error('✗ Error closing database:', error);
    }

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Handle Ctrl+C

// Handle uncaught errors (last resort)
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});