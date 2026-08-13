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
        this.stats = {
            balance: 0,
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
                    autoStart: false,
                    pollIntervalMs: 1500,
                    minBalanceThreshold: 10000,
                    webPort: 4000
                };
            }
        } catch (err) {
            this.log('error', 'Gagal membaca file config.json: ' + err.message);
            this.config = { targetUrl: 'https://kuotax.web.id', pollIntervalMs: 1500 };
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
                pollIntervalMs: this.config.pollIntervalMs,
                minBalanceThreshold: this.config.minBalanceThreshold
            },
            user: this.user ? {
                id: this.user.id,
                full_name: this.user.full_name,
                email: this.user.email,
                balance: this.user.balance
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

        // Extract cookie header from response if present
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
        
        // Save targetUrl & credentials if valid
        this.saveConfig({ targetUrl: useUrl, email: useEmail, password: usePassword });

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

        try {
            if (!this.cookieHeader || !this.user) {
                await this.login(email, password, targetUrl);
            }

            this.isRunning = true;
            this.log('success', '🚀 BOT AUTO-ORDER KUOTAX AKTIF!');
            this.log('info', `Saldo Utama Awal: Rp ${Number(this.stats.balance).toLocaleString('id-ID')}`);
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
            this.log('error', 'Kesalahan pada siklus klaim: ' + err.message);
        }

        if (this.isRunning) {
            const delay = Math.max(500, parseInt(this.config.pollIntervalMs) || 1500);
            this.pollTimer = setTimeout(() => this.runPollLoop(), delay);
        }
    }

    async scanAndClaim() {
        if (this.isProcessing || !this.cookieHeader) return;

        const useUrl = this.config.targetUrl.replace(/\/+$/, '');
        
        // 1. Fetch live available orders & user stats
        let statsData = null;
        try {
            const res = await fetch(`${useUrl}/api/dashboard/stats`, {
                headers: { 'Cookie': this.cookieHeader, 'Authorization': `Bearer ${this.token}` }
            });
            statsData = await res.json();
        } catch (err) {
            this.log('error', 'Gagal memindai orderan dari server: ' + err.message);
            return;
        }

        if (!statsData || !statsData.success) {
            if (statsData?.message?.includes('Unauthenticated') || statsData?.message?.includes('session')) {
                this.log('warn', 'Sesi login berakhir. Mencoba re-login otomatis...');
                try {
                    await this.login();
                } catch (e) {
                    this.stop();
                }
            }
            return;
        }

        const currentBalance = Number(statsData.stats?.balance || 0);
        this.stats.balance = currentBalance;

        // Check if balance is exhausted or below minimum threshold
        const minThreshold = Number(this.config.minBalanceThreshold) || 10000;
        if (currentBalance < minThreshold) {
            this.log('warn', `⚠️ Saldo Utama (Rp ${currentBalance.toLocaleString('id-ID')}) berada di bawah batas minimal (Rp ${minThreshold.toLocaleString('id-ID')}). Bot berhenti otomatis.`);
            this.stop();
            return;
        }

        const availableOrders = statsData.activeOrders || [];
        if (availableOrders.length === 0) {
            return; // Market sepi / tidak ada orderan aktif
        }

        // 2. Filter orders that fit user balance
        const eligibleOrders = availableOrders.filter(order => {
            const basePrice = Number(order.basePrice || (order.quota * 2000));
            return basePrice <= currentBalance;
        });

        if (eligibleOrders.length === 0) {
            this.log('info', `Orderan tersedia (${availableOrders.length}), tetapi modal order melebihi sisa Saldo Utama (Rp ${currentBalance.toLocaleString('id-ID')}).`);
            return;
        }

        // Pick highest profit order or first eligible order
        eligibleOrders.sort((a, b) => {
            const profitA = Number(a.profit || (a.price - (a.basePrice || a.quota * 2000)));
            const profitB = Number(b.profit || (b.price - (b.basePrice || b.quota * 2000)));
            return profitB - profitA;
        });

        const targetOrder = eligibleOrders[0];
        const basePrice = Number(targetOrder.basePrice || (targetOrder.quota * 2000));
        const expectedProfit = Number(targetOrder.profit || (targetOrder.price - basePrice));

        // 3. Claim the order
        this.isProcessing = true;
        this.log('info', `⚡ Mengklaim Order #${targetOrder.id} [${targetOrder.provider} ${targetOrder.quota}GB] | Modal: Rp ${basePrice.toLocaleString('id-ID')} | Est. Profit: +Rp ${expectedProfit.toLocaleString('id-ID')}...`);

        try {
            const claimRes = await fetch(`${useUrl}/api/fill-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.cookieHeader,
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ orderId: targetOrder.id })
            });

            const claimData = await claimRes.json();

            if (claimRes.ok && claimData.success) {
                this.stats.totalOrdersClaimed += 1;
                this.stats.totalProfitEarned += expectedProfit;

                const newBalance = claimData.user ? Number(claimData.user.balance) : (currentBalance - basePrice);
                this.stats.balance = newBalance;

                const claimItem = {
                    id: targetOrder.id,
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

                this.log('success', `🎉 BERHASIL KLAIM ORDER #${targetOrder.id}! Profit: +Rp ${expectedProfit.toLocaleString('id-ID')} | Saldo Sisa: Rp ${newBalance.toLocaleString('id-ID')}`);
                this.emit('order-claimed', claimItem);
                this.emit('status-update', this.getStatus());
            } else {
                this.log('warn', `Gagal mengklaim Order #${targetOrder.id}: ${claimData.message || 'Orderan sudah diambil user lain'}`);
            }
        } catch (err) {
            this.log('error', `Error saat proses klaim Order #${targetOrder.id}: ` + err.message);
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = KuotaxBotEngine;
