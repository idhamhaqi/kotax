const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class KuotaxBotEngine extends EventEmitter {
    constructor(configPath) {
        super();
        this.configPath = configPath || path.join(__dirname, 'config.json');
        this.loadConfig();

        this.isRunning = false;
        this.isProcessing = false;
        this.token = null;
        this.cookieHeader = '';
        this.user = null;
        this.currentAccountIndex = 0;

        this.stats = {
            balance: 0,
            holdBalance: 0,
            totalOrdersClaimed: 0,
            totalProfitEarned: 0
        };
        this.claimedHistory = [];
        this.pollTimer = null;
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(data);
            } else {
                this.config = {
                    targetUrl: 'https://kuotax.web.id',
                    email: '',
                    password: '',
                    mode: 'single', // 'single' atau 'multi'
                    accounts: [],
                    autoStart: false,
                    pollIntervalMs: 1500,
                    minBalanceThreshold: 10000,
                    webPort: 4000
                };
            }

            if (!Array.isArray(this.config.accounts)) {
                this.config.accounts = [];
            }
            if (!this.config.mode) {
                this.config.mode = 'single';
            }
        } catch (err) {
            this.log('error', 'Gagal membaca file config.json: ' + err.message);
            this.config = { targetUrl: 'https://kuotax.web.id', mode: 'single', accounts: [], pollIntervalMs: 1500 };
        }
    }

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
            this.log('info', 'Pengaturan bot berhasil disimpan.');
        } catch (err) {
            this.log('error', 'Gagal menyimpan config.json: ' + err.message);
        }
    }

    log(type, message, details = null) {
        const timestamp = new Date().toLocaleTimeString('id-ID');
        const logItem = { timestamp, type, message, details };
        this.emit('log', logItem);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isProcessing: this.isProcessing,
            config: {
                targetUrl: this.config.targetUrl,
                email: this.config.email,
                mode: this.config.mode || 'single',
                accounts: this.config.accounts || [],
                pollIntervalMs: this.config.pollIntervalMs,
                minBalanceThreshold: this.config.minBalanceThreshold
            },
            currentAccountIndex: this.currentAccountIndex,
            user: this.user ? {
                id: this.user.id,
                full_name: this.user.full_name,
                email: this.user.email,
                balance: this.user.balance,
                hold_balance: this.user.hold_balance
            } : null,
            stats: this.stats,
            claimedHistory: this.claimedHistory.slice(0, 50)
        };
    }

    async login(email, password, targetUrl) {
        const useEmail = email || this.config.email;
        const usePassword = password || this.config.password;
        const useUrl = (targetUrl || this.config.targetUrl || 'https://kuotax.web.id').replace(/\/+$/, '');

        if (!useEmail || !usePassword) {
            throw new Error('Email dan password tidak boleh kosong.');
        }

        this.log('info', `Mencoba login ke ${useUrl} (Email: ${useEmail})...`);

        const loginEndpoint = `${useUrl}/api/auth/login`;
        const res = await fetch(loginEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: useEmail, password: usePassword })
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
            this.cookieHeader = setCookie;
        }

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Login gagal. Cek email dan password Anda.');
        }

        this.token = data.token || '';
        this.user = data.user || null;
        if (this.token && !this.cookieHeader.includes('token=')) {
            this.cookieHeader = `token=${this.token}`;
        }

        this.log('success', `Login berhasil! Selamat datang, ${data.user?.full_name || useEmail}`);
        
        await this.refreshUserStats();
        return data;
    }

    async refreshUserStats() {
        if (!this.cookieHeader) return null;
        try {
            const useUrl = this.config.targetUrl.replace(/\/+$/, '');
            const res = await fetch(`${useUrl}/api/dashboard/stats`, {
                headers: { 'Cookie': this.cookieHeader, 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            if (data.success && data.stats) {
                this.user = { ...this.user, ...data.stats };
                this.stats.balance = Number(data.stats.balance || 0);
                this.stats.holdBalance = Number(data.stats.holdBalance || 0);
                this.emit('status-update', this.getStatus());
                return data.stats;
            }
        } catch (err) {
            this.log('warn', 'Gagal memperbarui saldo user: ' + err.message);
        }
        return null;
    }

    async start(email, password, targetUrl) {
        if (this.isRunning) {
            this.log('info', 'Bot sudah berjalan.');
            return;
        }

        this.currentAccountIndex = 0;
        const mode = this.config.mode || 'single';
        const accounts = this.config.accounts || [];

        try {
            if (mode === 'multi' && accounts.length > 0) {
                const firstAcc = accounts[0];
                this.log('info', `🔀 [MULTI-ACCOUNT MODE] Memulai antrian urutan untuk ${accounts.length} akun...`);
                this.log('info', `👤 Akun #1/${accounts.length}: ${firstAcc.name || firstAcc.email}`);
                await this.login(firstAcc.email, firstAcc.password, targetUrl);
            } else {
                this.log('info', `👤 [SINGLE ACCOUNT MODE] Menggunakan ${email || this.config.email}`);
                await this.login(email, password, targetUrl);
            }

            this.isRunning = true;
            this.log('success', '🚀 BOT AUTO-ORDER KUOTAX AKTIF & MEMINDAI PASAR LIVE!');
            this.log('info', `Saldo Utama: Rp ${Number(this.stats.balance).toLocaleString('id-ID')} | Saldo Tertahan: Rp ${Number(this.stats.holdBalance).toLocaleString('id-ID')}`);
            this.emit('status-update', this.getStatus());

            this.runPollLoop();
        } catch (err) {
            this.isRunning = false;
            this.log('error', 'Gagal memulai bot: ' + err.message);
            this.emit('status-update', this.getStatus());
            throw err;
        }
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.log('warn', '🛑 Bot dihentikan oleh user.');
        this.emit('status-update', this.getStatus());
    }

    async runPollLoop() {
        if (!this.isRunning) return;

        try {
            await this.scanAndClaim();
        } catch (err) {
            this.log('error', 'Kesalahan pada siklus pemindaian: ' + err.message);
        }

        if (this.isRunning) {
            const delay = Math.max(500, parseInt(this.config.pollIntervalMs) || 1500);
            this.pollTimer = setTimeout(() => this.runPollLoop(), delay);
        }
    }

    async scanAndClaim() {
        if (this.isProcessing || !this.cookieHeader) return;

        const useUrl = this.config.targetUrl.replace(/\/+$/, '');
        
        // 1. Refresh user stats first
        await this.refreshUserStats();
        const currentBalance = Number(this.stats.balance || 0);

        // Check minimum balance threshold
        const minThreshold = Number(this.config.minBalanceThreshold) || 10000;
        if (currentBalance < minThreshold) {
            const mode = this.config.mode || 'single';
            const accounts = this.config.accounts || [];

            this.log('warn', `⚠️ Saldo Akun #${this.currentAccountIndex + 1} (${this.user?.email || 'User'}) tersisa Rp ${currentBalance.toLocaleString('id-ID')} (di bawah minimum threshold Rp ${minThreshold.toLocaleString('id-ID')}).`);

            // Multi-account Sequential Queue Switch
            if (mode === 'multi' && accounts.length > 0) {
                this.currentAccountIndex += 1;
                if (this.currentAccountIndex < accounts.length) {
                    const nextAcc = accounts[this.currentAccountIndex];
                    this.log('info', `🔄 [MULTI-ACCOUNT QUEUE] Memindahkan antrian ke Akun #${this.currentAccountIndex + 1}/${accounts.length}: ${nextAcc.name || nextAcc.email}...`);

                    // Clear previous session data
                    this.token = null;
                    this.cookieHeader = '';
                    this.user = null;

                    try {
                        await this.login(nextAcc.email, nextAcc.password, this.config.targetUrl);
                        this.log('success', `🚀 Berhasil beralih ke Akun #${this.currentAccountIndex + 1} (${nextAcc.email}). Memulai pemindaian order...`);
                        this.emit('status-update', this.getStatus());
                        return;
                    } catch (err) {
                        this.log('error', `Gagal login ke Akun #${this.currentAccountIndex + 1} (${nextAcc.email}): ` + err.message);
                        // Skip to next if failed
                        this.scanAndClaim();
                        return;
                    }
                } else {
                    this.log('success', '🎉 [MULTI-ACCOUNT COMPLETE] SELURUH AKUN DALAM ANTRIAN TELAH SELESAI DIPROSES!');
                    this.stop();
                    return;
                }
            } else {
                this.stop();
                return;
            }
        }

        // 2. Fetch live active market orders from /api/test-orders
        let activeOrders = [];
        try {
            const res = await fetch(`${useUrl}/api/test-orders`, {
                headers: { 'Cookie': this.cookieHeader, 'Authorization': `Bearer ${this.token}` }
            });
            if (res.ok) {
                activeOrders = await res.json();
            }
        } catch (err) {
            this.log('error', 'Gagal memindai orderan dari /api/test-orders: ' + err.message);
            return;
        }

        if (!Array.isArray(activeOrders) || activeOrders.length === 0) {
            return;
        }

        // 3. Filter orders that fit user balance
        const eligibleOrders = activeOrders.filter(order => {
            const basePrice = Number(order.basePrice || (order.quota * 2000));
            const isNotExpired = !order.expiresAt || order.expiresAt > Date.now();
            return basePrice <= currentBalance && isNotExpired;
        });

        if (eligibleOrders.length === 0) {
            this.log('info', `Terdapat ${activeOrders.length} orderan aktif, tetapi modalnya melebihi Saldo Utama Akun #${this.currentAccountIndex + 1} (Rp ${currentBalance.toLocaleString('id-ID')}).`);
            return;
        }

        // Sort by profit descending (highest profit order first)
        eligibleOrders.sort((a, b) => {
            const profitA = Number(a.profit || (a.price - (a.basePrice || a.quota * 2000)));
            const profitB = Number(b.profit || (b.price - (b.basePrice || b.quota * 2000)));
            return profitB - profitA;
        });

        const targetOrder = eligibleOrders[0];
        const basePrice = Number(targetOrder.basePrice || (targetOrder.quota * 2000));
        const expectedProfit = Number(targetOrder.profit || (targetOrder.price - basePrice));

        // 4. Claim the order (Step 1: fill-order)
        this.isProcessing = true;
        this.log('info', `⚡ [Akun #${this.currentAccountIndex + 1}] Memproses Order #${targetOrder.id} [${targetOrder.provider} ${targetOrder.quota}GB] | Modal: Rp ${basePrice.toLocaleString('id-ID')} | Profit: +Rp ${expectedProfit.toLocaleString('id-ID')}...`);

        try {
            const fillRes = await fetch(`${useUrl}/api/fill-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.cookieHeader,
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ orderId: targetOrder.id })
            });

            const fillData = await fillRes.json();

            if (fillRes.ok && fillData.success) {
                // Step 2: Finalize fill-order (complete-fill-order) so profit is credited
                this.log('info', `⏳ [Akun #${this.currentAccountIndex + 1}] Menyelesaikan verifikasi jaringan Order #${targetOrder.id}...`);
                await new Promise(r => setTimeout(r, 1000));

                const completeRes = await fetch(`${useUrl}/api/complete-fill-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': this.cookieHeader,
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ orderId: targetOrder.id })
                });

                const completeData = await completeRes.json();

                this.stats.totalOrdersClaimed += 1;
                this.stats.totalProfitEarned += expectedProfit;

                await this.refreshUserStats();

                const claimItem = {
                    id: targetOrder.id,
                    accountEmail: this.user?.email || 'Unknown',
                    provider: targetOrder.provider,
                    quota: targetOrder.quota,
                    phoneNumber: targetOrder.phoneNumber,
                    basePrice: basePrice,
                    price: targetOrder.price,
                    profit: expectedProfit,
                    claimedAt: new Date().toLocaleTimeString('id-ID'),
                    status: 'success'
                };

                this.claimedHistory.unshift(claimItem);

                this.log('success', `🎉 [Akun #${this.currentAccountIndex + 1}] SUKSES KLAIM ORDER #${targetOrder.id}! Profit: +Rp ${expectedProfit.toLocaleString('id-ID')} | Saldo Sisa: Rp ${Number(this.stats.balance).toLocaleString('id-ID')}`);
                this.emit('order-claimed', claimItem);
                this.emit('status-update', this.getStatus());
            } else {
                this.log('warn', `[Akun #${this.currentAccountIndex + 1}] Order #${targetOrder.id} tidak dapat diklaim: ${fillData.message || 'Sudah diambil user lain'}`);
            }
        } catch (err) {
            this.log('error', `[Akun #${this.currentAccountIndex + 1}] Error saat klaim Order #${targetOrder.id}: ` + err.message);
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = KuotaxBotEngine;
