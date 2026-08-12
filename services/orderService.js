const { generateIndonesianPhone, providerPrefixes } = require('../utils/phoneGenerator');
const { getRandomSource } = require('../utils/orderSources');
const db = require('../config/database');

const providers = Object.keys(providerPrefixes);

const REAL_PACKAGES = {
    'Telkomsel': [
        { name: 'Telkomsel Internet OMG! 4GB (30hr)', quota: 4, basePrice: 29000 },
        { name: 'Telkomsel Combo Sakti 10GB (30hr)', quota: 10, basePrice: 46000 },
        { name: 'Telkomsel Combo Sakti 14GB (30hr)', quota: 14, basePrice: 59000 },
        { name: 'Telkomsel Internet OMG! 25GB (30hr)', quota: 25, basePrice: 90000 },
        { name: 'Telkomsel Combo Sakti 35GB (30hr)', quota: 35, basePrice: 110000 },
        { name: 'Telkomsel Internet OMG! 50GB (30hr)', quota: 50, basePrice: 140000 }
    ],
    'Indosat': [
        { name: 'Indosat Freedom Internet 3GB (30hr)', quota: 3, basePrice: 20000 },
        { name: 'Indosat Freedom Internet 9GB (30hr)', quota: 9, basePrice: 34000 },
        { name: 'Indosat Freedom Internet 14GB (30hr)', quota: 14, basePrice: 50000 },
        { name: 'Indosat Freedom Internet 25GB (30hr)', quota: 25, basePrice: 75000 },
        { name: 'Indosat Freedom Internet 50GB (30hr)', quota: 50, basePrice: 120000 },
        { name: 'Indosat Freedom Internet 100GB (30hr)', quota: 100, basePrice: 168000 }
    ],
    'XL': [
        { name: 'XL Xtra Combo Flex S 3GB (30hr)', quota: 3, basePrice: 23000 },
        { name: 'XL Xtra Combo Flex M 8GB (30hr)', quota: 8, basePrice: 42000 },
        { name: 'XL Xtra Combo Flex L 15GB (30hr)', quota: 15, basePrice: 66000 },
        { name: 'XL Xtra Combo Flex XL 30GB (30hr)', quota: 30, basePrice: 95000 },
        { name: 'XL Xtra Combo Flex XXL 55GB (30hr)', quota: 55, basePrice: 135000 }
    ],
    'Axis': [
        { name: 'AXIS Bronet 24 Jam 2GB (30hr)', quota: 2, basePrice: 14000 },
        { name: 'AXIS Bronet 24 Jam 3GB (30hr)', quota: 3, basePrice: 27000 },
        { name: 'AXIS Bronet AIGO 5GB (30hr)', quota: 5, basePrice: 38000 },
        { name: 'AXIS Owsem 16GB (30hr)', quota: 16, basePrice: 60000 },
        { name: 'AXIS Owsem 24GB (30hr)', quota: 24, basePrice: 80000 },
        { name: 'AXIS Owsem 40GB (30hr)', quota: 40, basePrice: 108000 }
    ],
    'Tri': [
        { name: 'TRI Happy 2GB (30hr)', quota: 2, basePrice: 15000 },
        { name: 'TRI AlwaysOn AON 6GB Masa Aktif Kartu', quota: 6, basePrice: 28000 },
        { name: 'TRI Happy 12GB (30hr)', quota: 12, basePrice: 45000 },
        { name: 'TRI Happy 18GB (30hr)', quota: 18, basePrice: 62000 },
        { name: 'TRI Happy 42GB (30hr)', quota: 42, basePrice: 95000 }
    ],
    'Smartfren': [
        { name: 'Smartfren Kuota Nonstop 6GB (30hr)', quota: 6, basePrice: 30000 },
        { name: 'Smartfren Kuota Nonstop 12GB (30hr)', quota: 12, basePrice: 45000 },
        { name: 'Smartfren Unlimited Nonstop 30GB (30hr)', quota: 30, basePrice: 70000 },
        { name: 'Smartfren Kuota Nonstop 45GB (30hr)', quota: 45, basePrice: 102000 }
    ],
    'By.U': [
        { name: 'by.U 3GB 14 Hari (Yang Bikin Nyaman)', quota: 3, basePrice: 17000 },
        { name: 'by.U 10GB 30 Hari (Yang Bikin Nagih)', quota: 10, basePrice: 36000 },
        { name: 'by.U 20GB 30 Hari (Yang Bikin Kaget)', quota: 20, basePrice: 55000 },
        { name: 'by.U 50GB 30 Hari (Yang Bikin Puas)', quota: 50, basePrice: 102000 }
    ]
};

class OrderService {
    constructor(io) {
        this.io = io;
        this.activeOrders = new Map();
        this.orderLocks = new Map(); // For race condition handling
        this.orderTimeouts = new Map(); // Track all order expiry timeouts
        this.generationTimeouts = []; // Track all generation cycle timeouts
        this.isRunning = false; // Flag to control order generation

        // Order multiplier cache (anti memory leak - single value cache)
        this.multiplierCache = 1; // Default 1x (normal)
        this.multiplierLastFetch = 0; // Timestamp of last fetch
        this.MULTIPLIER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

        // Profit multiplier cache
        this.profitMultiplierCache = 1; // Default 1x (normal)
        this.profitMultiplierLastFetch = 0; // Timestamp of last fetch
        this.PROFIT_MULTIPLIER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

        // Cleanup orphaned locks every 5 minutes
        setInterval(() => {
            const now = Date.now();
            let orphanedCount = 0;
            for (const [orderId, lock] of this.orderLocks.entries()) {
                if (!this.activeOrders.has(orderId) || now - lock.timestamp > 30000) {
                    this.orderLocks.delete(orderId);
                    this.io.emit('order-unlocked', orderId);
                    orphanedCount++;
                }
            }
            if (orphanedCount > 0) {
                console.log(`🧹 Cleaned up ${orphanedCount} orphaned order locks`);
            }
        }, 5 * 60 * 1000);
    }

    async generateOrder() {
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const provider = providers[Math.floor(Math.random() * providers.length)];
        const phoneNumber = generateIndonesianPhone(provider);

        // Fetch real market package for chosen provider
        const pkgList = REAL_PACKAGES[provider] || REAL_PACKAGES['Telkomsel'];
        const selectedPkg = pkgList[Math.floor(Math.random() * pkgList.length)];

        const packageName = selectedPkg.name;
        const quota = selectedPkg.quota;
        const basePrice = selectedPkg.basePrice;

        // Get random source (mitra counter or server)
        const source = getRandomSource();

        // Get target monthly ROI from admin settings
        const targetMonthlyRoi = await this.getTargetMonthlyRoi();
        
        // Calculate Target Daily ROI (e.g. 30% month = 1% day = 0.01)
        const dailyRoiDecimal = (targetMonthlyRoi / 30) / 100;

        // Final profit includes a small variance (±10% of the daily target) to make it look natural
        const variance = dailyRoiDecimal * 0.2 * (Math.random() - 0.5); // +/- 10% variance
        const actualProfitDecimal = dailyRoiDecimal + variance;
        
        const finalProfit = Math.floor(basePrice * actualProfitDecimal);
        const price = basePrice + finalProfit;

        const expiresIn = 60000; // 60 seconds
        const expiresAt = Date.now() + expiresIn;

        const order = {
            id: orderId,
            provider,
            packageName,
            phoneNumber,
            quota,
            basePrice,
            price,
            profit: finalProfit,
            source: source.name,
            sourceType: source.type,
            expiresAt
        };

        this.activeOrders.set(orderId, order);
        this.io.emit('new-order', order);

        // Auto-remove after expiry - track timeout reference
        const expiryTimeout = setTimeout(() => {
            if (this.activeOrders.has(orderId)) {
                this.removeOrder(orderId);
            }
        }, expiresIn);

        // Store timeout reference for cleanup
        this.orderTimeouts.set(orderId, expiryTimeout);

        return order;
    }

    // Get random batch size based on peak hours (more natural)
    getRandomBatchSize(isPeakHour) {
        if (isPeakHour) {
            // Peak hours: more likely to have bursts of 2-4 orders
            const rand = Math.random();
            if (rand < 0.2) return 1; // 20% single order
            if (rand < 0.5) return 2; // 30% burst of 2
            if (rand < 0.8) return 3; // 30% burst of 3
            return 4; // 20% burst of 4
        } else {
            // Off-peak: mostly single orders, occasional small bursts
            const rand = Math.random();
            if (rand < 0.6) return 1; // 60% single order
            if (rand < 0.85) return 2; // 25% burst of 2
            return 3; // 15% burst of 3
        }
    }

    // Generate a small batch of orders naturally
    async generateNaturalBatch(count) {
        for (let i = 0; i < count; i++) {
            // Small delay within batch (0-500ms) for natural feel
            await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
            await this.generateOrder();
        }
    }

    // Get order count based on time of day
    getOrderCountByTime() {
        const hour = new Date().getHours();

        // Late night (00:00 - 05:00) - Very quiet
        if (hour >= 0 && hour < 5) {
            const rand = Math.random();
            if (rand < 0.6) return 0; // 60% chance no orders
            if (rand < 0.9) return Math.floor(Math.random() * 2) + 1; // 30% chance 1-2 orders
            return Math.floor(Math.random() * 3) + 2; // 10% chance 2-4 orders
        }

        // Early morning (05:00 - 08:00) - Quiet
        if (hour >= 5 && hour < 8) {
            const rand = Math.random();
            if (rand < 0.3) return 0; // 30% chance no orders
            if (rand < 0.7) return Math.floor(Math.random() * 3) + 2; // 40% chance 2-4 orders
            return Math.floor(Math.random() * 4) + 3; // 30% chance 3-6 orders
        }

        // Morning peak (08:00 - 11:00) - Busy
        if (hour >= 8 && hour < 11) {
            const rand = Math.random();
            if (rand < 0.1) return 0; // 10% chance no orders (rare)
            if (rand < 0.3) return Math.floor(Math.random() * 3) + 3; // 20% chance 3-5 orders
            if (rand < 0.7) return Math.floor(Math.random() * 4) + 5; // 40% chance 5-8 orders
            return Math.floor(Math.random() * 3) + 8; // 30% chance 8-10 orders
        }

        // Midday (11:00 - 14:00) - Moderate
        if (hour >= 11 && hour < 14) {
            const rand = Math.random();
            if (rand < 0.2) return 0; // 20% chance no orders
            if (rand < 0.5) return Math.floor(Math.random() * 3) + 3; // 30% chance 3-5 orders
            return Math.floor(Math.random() * 4) + 4; // 50% chance 4-7 orders
        }

        // Afternoon (14:00 - 17:00) - Moderate to Busy
        if (hour >= 14 && hour < 17) {
            const rand = Math.random();
            if (rand < 0.15) return 0; // 15% chance no orders
            if (rand < 0.4) return Math.floor(Math.random() * 3) + 4; // 25% chance 4-6 orders
            return Math.floor(Math.random() * 5) + 5; // 60% chance 5-9 orders
        }

        // Evening peak (17:00 - 21:00) - Very Busy
        if (hour >= 17 && hour < 21) {
            const rand = Math.random();
            if (rand < 0.05) return 0; // 5% chance no orders (very rare)
            if (rand < 0.2) return Math.floor(Math.random() * 3) + 5; // 15% chance 5-7 orders
            if (rand < 0.6) return Math.floor(Math.random() * 4) + 6; // 40% chance 6-9 orders
            return Math.floor(Math.random() * 2) + 9; // 40% chance 9-10 orders
        }

        // Night (21:00 - 00:00) - Decreasing
        if (hour >= 21) {
            const rand = Math.random();
            if (rand < 0.35) return 0; // 35% chance no orders
            if (rand < 0.7) return Math.floor(Math.random() * 3) + 2; // 35% chance 2-4 orders
            return Math.floor(Math.random() * 4) + 4; // 30% chance 4-7 orders
        }

        // Default fallback
        return Math.floor(Math.random() * 5) + 3; // 3-7 orders
    }

    removeOrder(orderId) {
        // Clear timeout if exists
        if (this.orderTimeouts.has(orderId)) {
            clearTimeout(this.orderTimeouts.get(orderId));
            this.orderTimeouts.delete(orderId);
        }

        this.activeOrders.delete(orderId);
        this.orderLocks.delete(orderId);
        this.io.emit('order-removed', orderId);
    }

    async fillOrder(orderId, userId) {
        // LAYER 1: Check if order exists first
        const order = this.activeOrders.get(orderId);
        if (!order) {
            return { success: false, message: 'Order sudah diambil user lain atau expired' };
        }

        // LAYER 2: Check if order is expired
        if (Date.now() > order.expiresAt) {
            this.removeOrder(orderId);
            return { success: false, message: 'Order sudah expired' };
        }

        // LAYER 3: Try to acquire lock (atomic operation)
        if (this.orderLocks.has(orderId)) {
            return { success: false, message: 'Order sedang diproses user lain, coba order lain!' };
        }

        // Set lock with timestamp for timeout mechanism
        this.orderLocks.set(orderId, { userId, timestamp: Date.now() });

        // LAYER 4: Broadcast lock immediately to all clients
        this.io.emit('order-locked', orderId);

        // Set lock timeout (10 seconds) - if processing takes too long, release lock
        let lockTimeout = setTimeout(() => {
            if (this.orderLocks.has(orderId)) {
                console.log(`Lock timeout for order ${orderId}`);
                this.orderLocks.delete(orderId);
                this.io.emit('order-unlocked', orderId);
            }
        }, 10000);

        try {
            // LAYER 5: Database transaction for atomicity
            const connection = await db.getConnection();

            try {
                console.log(`[FillOrder Trace] Starting transaction for order ${orderId}`);
                await connection.beginTransaction();

                // Get user data with row lock (FOR UPDATE)
                console.log(`[FillOrder Trace] Querying user ${userId} FOR UPDATE`);
                const [users] = await connection.query(
                    'SELECT balance, hold_balance FROM users WHERE id = $1 FOR UPDATE',
                    [userId]
                );
                console.log(`[FillOrder Trace] Queried user ${userId}, found:`, users.length);

                if (users.length === 0) {
                    await connection.rollback();
                    connection.release();
                    clearTimeout(lockTimeout);
                    this.orderLocks.delete(orderId);
                    this.io.emit('order-unlocked', orderId);
                    return { success: false, message: 'User tidak ditemukan' };
                }

                const user = users[0];
                const currentBalance = Number(user.balance || 0);
                const basePrice = Number(order.basePrice || (order.quota * 2000));
                const profit = Number(order.price) - basePrice;

                // LAYER 5A: Check if user main balance is sufficient for package wholesale cost
                if (currentBalance < basePrice) {
                    await connection.rollback();
                    connection.release();
                    clearTimeout(lockTimeout);
                    this.orderLocks.delete(orderId);
                    this.io.emit('order-unlocked', orderId);
                    return { 
                        success: false, 
                        message: `Saldo Utama Anda (Rp ${parseInt(currentBalance).toLocaleString('id-ID')}) tidak mencukupi untuk memproses modal order Rp ${parseInt(basePrice).toLocaleString('id-ID')}` 
                    };
                }

                // Step 1 Debit: Deduct basePrice from user main balance
                const [debitRes] = await connection.query(
                    `UPDATE users 
                     SET balance = balance - $1
                     WHERE id = $2 AND balance >= $1`,
                    [basePrice, userId]
                );

                if (debitRes.rowCount === 0 && debitRes.affectedRows === 0) {
                    await connection.rollback();
                    connection.release();
                    clearTimeout(lockTimeout);
                    this.orderLocks.delete(orderId);
                    this.io.emit('order-unlocked', orderId);
                    return { success: false, message: 'Gagal memotong saldo, saldo utama Anda tidak mencukupi' };
                }

                const descTextDebit = order.packageName 
                    ? `Penggunaan Modal Order B2B ${order.packageName} (${order.source})`
                    : `Penggunaan Modal Order B2B ${order.provider} ${order.quota}GB (${order.source})`;

                // Record debit transaction (-basePrice)
                await connection.query(
                    `INSERT INTO transactions (user_id, type, amount, quota_amount, provider, phone_number, description)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        userId,
                        'fill_order_debit',
                        -basePrice,
                        order.quota,
                        order.provider,
                        order.phoneNumber,
                        descTextDebit
                    ]
                );

                // Insert into pending_order_fills table
                await connection.query(
                    `INSERT INTO pending_order_fills
                     (user_id, order_id, provider, package_name, phone_number, quota_gb, base_price, price, profit, source, source_type, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'processing')`,
                    [
                        userId,
                        orderId,
                        order.provider,
                        order.packageName || `${order.provider} ${order.quota}GB`,
                        order.phoneNumber,
                        order.quota,
                        basePrice,
                        order.price,
                        profit,
                        order.source,
                        order.sourceType
                    ]
                );

                // Commit Step 1 transaction
                await connection.commit();

                // Get updated user data after debit
                const [updatedUser] = await connection.query(
                    'SELECT balance, hold_balance, quota_gb FROM users WHERE id = $1',
                    [userId]
                );

                connection.release();

                // Remove order from active live list so no one else can take it
                this.removeOrder(orderId);

                const pendingOrder = {
                    orderId: orderId,
                    provider: order.provider,
                    packageName: order.packageName || `${order.provider} ${order.quota}GB`,
                    phoneNumber: order.phoneNumber,
                    quotaGb: order.quota,
                    basePrice: basePrice,
                    price: order.price,
                    profit: profit,
                    source: order.source,
                    sourceType: order.sourceType
                };

                return {
                    success: true,
                    status: 'processing',
                    message: 'Modal berhasil ditahan. Memproses order...',
                    pendingOrder: pendingOrder,
                    user: updatedUser[0]
                };

            } catch (dbError) {
                await connection.rollback();
                connection.release();
                throw dbError;
            }

        } catch (error) {
            console.error('Fill order error:', error);
            return { success: false, message: 'Terjadi kesalahan server' };
        } finally {
            if (lockTimeout) {
                clearTimeout(lockTimeout);
            }
            if (this.orderLocks.has(orderId)) {
                this.orderLocks.delete(orderId);
                this.io.emit('order-unlocked', orderId);
            }
        }
    }

    async getPendingOrder(userId) {
        try {
            const [rows] = await db.query(
                `SELECT order_id, provider, package_name, phone_number, quota_gb, base_price, price, profit, source, source_type, created_at
                 FROM pending_order_fills 
                 WHERE user_id = $1 AND status = 'processing' 
                 ORDER BY created_at DESC LIMIT 1`,
                [userId]
            );
            if (rows.length === 0) return null;
            const r = rows[0];
            return {
                orderId: r.order_id,
                provider: r.provider,
                packageName: r.package_name,
                phoneNumber: r.phone_number,
                quotaGb: Number(r.quota_gb),
                basePrice: Number(r.base_price),
                price: Number(r.price),
                profit: Number(r.profit),
                source: r.source,
                sourceType: r.source_type,
                createdAt: r.created_at
            };
        } catch (error) {
            console.error('Error fetching pending order:', error);
            return null;
        }
    }

    async completeFillOrder(orderId, userId) {
        try {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                const [rows] = await connection.query(
                    `SELECT * FROM pending_order_fills WHERE order_id = $1 AND user_id = $2 AND status = 'processing' FOR UPDATE`,
                    [orderId, userId]
                );

                if (rows.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return { success: false, message: 'Pending order tidak ditemukan' };
                }

                const pendingOrder = rows[0];
                const basePrice = Number(pendingOrder.base_price);
                const price = Number(pendingOrder.price);
                const profit = Number(pendingOrder.profit);
                const totalReturn = basePrice + profit; // Modal + Profit returned

                const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

                // Check if it's a new day: if so, reset daily_processed_amount before adding
                const [currentUser] = await connection.query(
                    'SELECT last_processed_date FROM users WHERE id = $1',
                    [userId]
                );
                const userLastDateStr = currentUser.length > 0 && currentUser[0].last_processed_date
                    ? new Date(currentUser[0].last_processed_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                    : '';
                const isNewDayComplete = (userLastDateStr !== todayDateStr);

                // Update user hold_balance (+totalReturn)
                await connection.query(
                    `UPDATE users 
                     SET hold_balance = hold_balance + $1
                     WHERE id = $2`,
                    [totalReturn, userId]
                );

                // Insert into fill_order_history (is_settled = false, will be credited to transactions table during midnight settlement audit)
                await connection.query(
                    `INSERT INTO fill_order_history
                     (user_id, order_id, provider, phone_number, quota_gb, price, profit, source, source_type, is_settled)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
                    [
                        userId,
                        orderId,
                        pendingOrder.provider,
                        pendingOrder.phone_number,
                        pendingOrder.quota_gb,
                        price,
                        profit,
                        pendingOrder.source,
                        pendingOrder.source_type
                    ]
                );

                // Process 3-level referral bonus (10% of profit)
                const mockOrderObj = {
                    provider: pendingOrder.provider,
                    packageName: pendingOrder.package_name,
                    quota: pendingOrder.quota_gb
                };
                await this.processFillOrderBonus(connection, userId, profit, mockOrderObj);

                // Remove pending order from pending_order_fills
                await connection.query(
                    `DELETE FROM pending_order_fills WHERE id = $1`,
                    [pendingOrder.id]
                );

                await connection.commit();

                // Read updated user data
                const [updatedUser] = await connection.query(
                    'SELECT balance, hold_balance, quota_gb FROM users WHERE id = $1',
                    [userId]
                );

                connection.release();

                return {
                    success: true,
                    message: `Eksekusi Berhasil! Modal + Profit (Rp ${parseInt(totalReturn).toLocaleString('id-ID')}) telah masuk ke Saldo Tertahan.`,
                    totalReturn: totalReturn,
                    profit: profit,
                    user: updatedUser[0]
                };

            } catch (dbError) {
                await connection.rollback();
                connection.release();
                throw dbError;
            }
        } catch (error) {
            console.error('Complete fill order error:', error);
            return { success: false, message: 'Gagal menyelesaikan eksekusi order' };
        }
    }

    async processFillOrderBonus(connection, userId, profit, order) {
        try {
            const MAX_LEVELS = 1; // 1-Level Direct Referral Bonus
            const BONUS_PERCENTAGE = 0.10; // 10% of profit
            const bonusAmount = Math.floor(profit * BONUS_PERCENTAGE);

            if (bonusAmount <= 0) return;

            let currentUserId = userId;

            for (let level = 1; level <= MAX_LEVELS; level++) {
                // Get current user's referrer
                const [currentUser] = await connection.query(
                    'SELECT referred_by FROM users WHERE id = $1',
                    [currentUserId]
                );

                if (currentUser.length === 0 || !currentUser[0].referred_by) {
                    break; // Chain broken, no more uplines
                }

                const referralCode = currentUser[0].referred_by;

                // Find the referrer
                const [referrer] = await connection.query(
                    'SELECT id, full_name FROM users WHERE referral_code = $1',
                    [referralCode]
                );

                if (referrer.length === 0) {
                    break; // Referrer not found
                }

                const referrerId = referrer[0].id;
                const referrerName = referrer[0].full_name;

                // Self-referral guard: stop if referrer is the worker or creates a loop
                if (referrerId === userId || referrerId === currentUserId) {
                    break;
                }

                // Give bonus to referrer (atomic balance update)
                await connection.query(
                    'UPDATE users SET balance = balance + $1 WHERE id = $2',
                    [bonusAmount, referrerId]
                );

                const bonusDesc = `Bonus Referral 10% dari Profit Order`;

                // Record in referral_bonuses table (Bonus Referral disajikan khusus di menu Referral)
                await connection.query(
                    `INSERT INTO referral_bonuses
                     (user_id, from_user_id, bonus_type, amount, level, percentage, description)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        referrerId,
                        userId, // original user who made the transaction
                        'fill_order',
                        bonusAmount,
                        level,
                        10.00,
                        bonusDesc
                    ]
                );

                console.log(`Referral bonus fill order L${level}: ${referrerName} earned Rp ${bonusAmount}`);

                // Move up the chain for the next iteration
                currentUserId = referrerId;
            }
        } catch (error) {
            console.error('Error processing fill order bonus:', error);
            // Don't throw error, just log it - bonus processing should not block fill order
        }
    }

    getActiveOrders() {
        return Array.from(this.activeOrders.values());
    }

    async getMultiplier() {
        const now = Date.now();

        // Check if cache expired (5 minutes)
        if (now - this.multiplierLastFetch > this.MULTIPLIER_CACHE_TTL) {
            try {
                // Fetch from database
                const [rows] = await db.query(
                    'SELECT setting_value FROM settings WHERE setting_key = $1',
                    ['order_multiplier']
                );

                if (rows.length > 0) {
                    const value = parseInt(rows[0].setting_value);
                    // Validate: must be 1, 2, 3, or 4
                    if (value >= 1 && value <= 4) {
                        this.multiplierCache = value;
                    } else {
                        console.warn(`Invalid order_multiplier value: ${value}, using default 1`);
                        this.multiplierCache = 1;
                    }
                } else {
                    // Setting not found, use default
                    this.multiplierCache = 1;
                }

                // Update last fetch timestamp
                this.multiplierLastFetch = now;

                console.log(`📊 Order multiplier updated: ${this.multiplierCache}x (cache refreshed)`);
            } catch (error) {
                console.error('Error fetching order multiplier:', error);
                // Keep using cached value on error
            }
        }

        return this.multiplierCache;
    }

    async getTargetMonthlyRoi() {
        const now = Date.now();

        if (now - this.profitMultiplierLastFetch > this.PROFIT_MULTIPLIER_CACHE_TTL) {
            try {
                const [rows] = await db.query(
                    'SELECT setting_value FROM settings WHERE setting_key = $1',
                    ['target_monthly_roi']
                );

                if (rows.length > 0) {
                    const value = parseInt(rows[0].setting_value);
                    if (value >= 1) {
                        this.profitMultiplierCache = value;
                    } else {
                        console.warn(`Invalid target_monthly_roi value: ${value}, using default 30`);
                        this.profitMultiplierCache = 30;
                    }
                } else {
                    this.profitMultiplierCache = 30; // Default 30% a month
                }

                this.profitMultiplierLastFetch = now;
                console.log(`💰 Target Monthly ROI updated: ${this.profitMultiplierCache}% (cache refreshed)`);
            } catch (error) {
                console.error('Error fetching target monthly roi:', error);
            }
        }

        return this.profitMultiplierCache;
    }

    startOrderGeneration() {
        // Prevent multiple starts
        if (this.isRunning) {
            console.log('⚠️  Order generation already running');
            return;
        }

        this.isRunning = true;

        const generateCycle = async () => {
            // Check if still running (for graceful stop)
            if (!this.isRunning) {
                console.log('⏹️  Order generation stopped');
                return;
            }

            // Get target order count based on time of day
            const baseOrderCount = this.getOrderCountByTime();

            // Apply multiplier (with cache, minimal overhead)
            const multiplier = await this.getMultiplier();
            const targetOrderCount = baseOrderCount * multiplier;

            const hour = new Date().getHours();
            const isPeakHour = (hour >= 8 && hour < 11) || (hour >= 17 && hour < 21);

            if (targetOrderCount === 0) {
                console.log(`[${new Date().toLocaleTimeString()}] Hour ${hour}: No orders (sepi)`);

                // Wait 60-120 seconds before next cycle
                const nextInterval = Math.floor(Math.random() * 60000) + 60000;
                const timeout = setTimeout(generateCycle, nextInterval);
                this.generationTimeouts.push(timeout);
                return;
            }

            const multiplierText = multiplier > 1 ? ` (${multiplier}x multiplier)` : '';
            console.log(`[${new Date().toLocaleTimeString()}] Hour ${hour}: Spreading ${targetOrderCount} orders naturally${multiplierText}`);

            // Split target orders into natural batches
            let remainingOrders = targetOrderCount;
            let currentDelay = 0;

            while (remainingOrders > 0) {
                // Get batch size (1-4 orders)
                const batchSize = Math.min(this.getRandomBatchSize(isPeakHour), remainingOrders);

                // Schedule this batch
                ((size, delay) => {
                    let timeout;
                    timeout = setTimeout(async () => {
                        const idx = this.generationTimeouts.indexOf(timeout);
                        if (idx !== -1) this.generationTimeouts.splice(idx, 1);
                        if (!this.isRunning) return; // Check before generating
                        const batchType = size === 1 ? 'single' : `burst of ${size}`;
                        console.log(`  ├─ Generating ${batchType} order(s) at +${(delay/1000).toFixed(1)}s`);
                        await this.generateNaturalBatch(size);
                    }, delay);
                    this.generationTimeouts.push(timeout);
                })(batchSize, currentDelay);

                remainingOrders -= batchSize;

                // Add random interval before next batch (5-20 seconds)
                if (remainingOrders > 0) {
                    const interval = Math.floor(Math.random() * 15000) + 5000; // 5-20 seconds
                    currentDelay += interval;
                }
            }

            // After all batches, wait before next cycle
            // Total cycle time: time to spread orders + pause
            const spreadTime = currentDelay + 2000; // Add 2s buffer
            const pauseTime = Math.floor(Math.random() * 40000) + 30000; // 30-70 seconds pause
            const totalCycleTime = spreadTime + pauseTime;

            console.log(`  └─ Next cycle in ${((totalCycleTime)/1000).toFixed(1)}s (spread: ${(spreadTime/1000).toFixed(1)}s + pause: ${(pauseTime/1000).toFixed(1)}s)`);

            const timeout = setTimeout(generateCycle, totalCycleTime);
            this.generationTimeouts.push(timeout);
        };

        // Start first cycle after 5 seconds
        const initialTimeout = setTimeout(() => {
            generateCycle();
        }, 5000);
        this.generationTimeouts.push(initialTimeout);

        console.log('✓ Natural order generation started');
        console.log('  - Pattern: Natural spreading (1-4 orders per batch)');
        console.log('  - Interval: 5-20 seconds between batches');
        console.log('  - Total orders: 0-10 per cycle (time-based)');
        console.log('  - Peak hours (08:00-11:00, 17:00-21:00): More burst patterns');
        console.log('  - Off-peak: Mostly single orders');
    }

    stopOrderGeneration() {
        console.log('🛑 Stopping order generation...');
        this.isRunning = false;

        // Clear all generation timeouts
        let clearedCount = 0;
        this.generationTimeouts.forEach(timeout => {
            clearTimeout(timeout);
            clearedCount++;
        });
        this.generationTimeouts = [];
        console.log(`  ✓ Cleared ${clearedCount} generation timeouts`);

        // Clear all order expiry timeouts
        let orderTimeoutCount = 0;
        this.orderTimeouts.forEach((timeout, orderId) => {
            clearTimeout(timeout);
            orderTimeoutCount++;
        });
        this.orderTimeouts.clear();
        console.log(`  ✓ Cleared ${orderTimeoutCount} order expiry timeouts`);

        // Clear all active orders
        const orderCount = this.activeOrders.size;
        this.activeOrders.clear();
        this.orderLocks.clear();
        console.log(`  ✓ Cleared ${orderCount} active orders`);

        // Reset multiplier cache (anti memory leak)
        this.multiplierCache = 1;
        this.multiplierLastFetch = 0;
        this.profitMultiplierCache = 1;
        this.profitMultiplierLastFetch = 0;
        console.log(`  ✓ Reset multiplier cache`);

        console.log('✅ Order generation stopped successfully');
    }

    /**
     * Settle hold_balance into main balance at midnight audit
     */
    static async settleHoldBalances(io) {
        const connection = await db.getConnection();
        try {
            console.log('⏳ [Settlement Audit] Starting vendor settlement audit process...');
            await connection.query('BEGIN');

            const [usersToSettle] = await connection.query(
                `SELECT id, hold_balance FROM users WHERE hold_balance > 0 FOR UPDATE`
            );

            if (usersToSettle.length === 0) {
                await connection.rollback();
                connection.release();
                console.log('✅ [Settlement Audit] No users with pending hold_balance.');
                return 0;
            }

            const settledUserIds = [];

            for (const u of usersToSettle) {
                const userId = u.id;
                const holdAmt = Number(u.hold_balance || 0);

                // Transfer hold_balance to main balance
                await connection.query(
                    `UPDATE users 
                     SET balance = balance + hold_balance, 
                         hold_balance = 0 
                     WHERE id = $1`,
                    [userId]
                );

                // Fetch unsettled fill orders for this user
                const [unsettledOrders] = await connection.query(
                    `SELECT id, provider, phone_number, quota_gb, price, profit, source
                     FROM fill_order_history
                     WHERE user_id = $1 AND (is_settled = false OR is_settled IS NULL)`,
                    [userId]
                );

                if (unsettledOrders.length > 0) {
                    for (const order of unsettledOrders) {
                        const totalReturn = Number(order.price); // price is basePrice + profit
                        const descText = `Pencairan Modal & Profit B2B ${order.provider} ${order.quota_gb}GB (${order.source})`;
                        await connection.query(
                            `INSERT INTO transactions (user_id, type, amount, quota_amount, provider, phone_number, description)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [userId, 'fill_order_credit', totalReturn, order.quota_gb, order.provider, order.phone_number, descText]
                        );
                        await connection.query('UPDATE fill_order_history SET is_settled = true WHERE id = $1', [order.id]);
                    }
                } else {
                    // Fallback if no individual order history found
                    await connection.query(
                        `INSERT INTO transactions (user_id, type, amount, description)
                         VALUES ($1, $2, $3, $4)`,
                        [userId, 'fill_order_credit', holdAmt, 'Pencairan Audit Settlement Vendor PPOB']
                    );
                }

                settledUserIds.push(userId);
            }

            await connection.commit();
            connection.release();

            console.log(`✅ [Settlement Audit] Settle complete! Transferred hold_balance to main balance for ${settledUserIds.length} users.`);

            if (io && settledUserIds.length > 0) {
                settledUserIds.forEach(uId => {
                    io.to('user-' + uId).emit('balance-updated');
                });
            }

            return settledUserIds.length;
        } catch (error) {
            await connection.rollback();
            connection.release();
            console.error('❌ [Settlement Audit] Error settling hold_balance:', error);
            return 0;
        }
    }
}

module.exports = OrderService;
