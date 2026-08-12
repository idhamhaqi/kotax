const socket = io();

// Format currency
function formatRupiah(amount) {
    return 'Rp ' + parseInt(amount || 0).toLocaleString('id-ID');
}

// Utility to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Helper: update element text by ID (safely skip if not found)
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Load user stats
async function loadStats() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('/api/dashboard/stats', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (result.success && result.stats) {
            updateDashboardStats(result.stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Render order card
function renderOrder(order) {
    const card = document.createElement('div');
    card.id = 'order-' + order.id;
    card.className = 'bg-white/70 rounded-lg p-4 border border-gray-200 transform transition-all hover:scale-102 hover:shadow-lg';

    const timeRemaining = Math.max(0, Math.floor((order.expiresAt - Date.now()) / 1000));

    const sourceIcon = order.sourceType === 'server'
        ? '<i class="fas fa-server text-purple-600"></i>'
        : '<i class="fas fa-store text-blue-600"></i>';

    const titleText = order.packageName || (order.provider + ' ' + order.quota + 'GB');
    const providerBadge = `<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${escapeHtml(order.provider)}</span>`;

    const basePrice = order.basePrice || (order.quota * 2000);
    const profit = order.profit || (order.price - basePrice);

    card.innerHTML = `
        <div class="mb-3 pb-2 border-b border-gray-200 flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm">
                ${sourceIcon}
                <span class="font-semibold text-gray-700">${escapeHtml(order.source)}</span>
            </div>
            ${providerBadge}
        </div>
        <div class="flex justify-between items-start mb-3">
            <div>
                <p class="font-bold text-gray-900 text-sm sm:text-base leading-tight mb-1">${escapeHtml(titleText)}</p>
                <p class="text-xs font-mono text-gray-500">${escapeHtml(order.phoneNumber)}</p>
            </div>
            <div class="text-right shrink-0 ml-2">
                <p class="text-xs text-gray-500">Modal Order</p>
                <p class="font-bold text-gray-800 text-sm sm:text-base">${formatRupiah(basePrice)}</p>
            </div>
        </div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-100">
            <div>
                <p class="text-[10px] text-gray-400">Harga Jual: ${formatRupiah(order.price)}</p>
                <p class="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <i class="fas fa-coins text-amber-500 text-[10px]"></i> Profit: +${formatRupiah(profit)}
                </p>
            </div>
            <div class="flex items-center gap-2">
                <div class="text-right">
                    <p class="text-[10px] text-gray-500">Expired</p>
                    <p class="font-bold text-red-600 text-xs countdown" data-expires="${order.expiresAt}">${timeRemaining}s</p>
                </div>
                <button onclick="fillOrder('${escapeHtml(order.id)}', this)" class="fill-order-btn px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold hover:from-emerald-700 hover:to-green-700 transition shadow-md flex items-center gap-1 text-xs">
                    <i class="fas fa-bolt"></i> Proses Order
                </button>
            </div>
        </div>
    `;

    // Render to both mobile and desktop order lists
    ['orderList', 'orderListDesktop'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const clone = card.cloneNode(true);
        if (containerId === 'orderListDesktop') {
            clone.id = 'order-' + order.id + '-desktop';
        }
        container.appendChild(clone);
    });
    updateOrderCount();
    startCountdown(order.id, order.expiresAt);
}

// Lock order visually
function lockOrder(orderId) {
    // Lock both mobile and desktop cards
    [orderId, orderId + '-desktop'].forEach(id => {
        const card = document.getElementById('order-' + id);
        if (!card) return;

        const button = card.querySelector('.fill-order-btn');
        if (button && !button.disabled) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-lock"></i> Diproses';
            button.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            button.classList.remove('bg-gradient-to-r', 'from-emerald-600', 'to-green-600');
        }
        card.classList.add('opacity-60', 'border-yellow-400');
    });
}

// Unlock order visually (if processing failed)
function unlockOrder(orderId) {
    [orderId, orderId + '-desktop'].forEach(id => {
        const card = document.getElementById('order-' + id);
        if (!card) return;

        const button = card.querySelector('.fill-order-btn');
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-bolt"></i> Proses Order';
            button.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            button.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-green-600');
        }
        card.classList.remove('opacity-60', 'border-yellow-400');
    });
}

// Start countdown for order — updates BOTH mobile and desktop cards
function startCountdown(orderId, expiresAt) {
    const interval = setInterval(() => {
        const mobileEl = document.querySelector(`#order-${orderId} .countdown`);
        const desktopEl = document.querySelector(`#order-${orderId}-desktop .countdown`);
        
        if (!mobileEl && !desktopEl) {
            clearInterval(interval);
            return;
        }

        const timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        const text = timeLeft + 's';
        if (mobileEl) mobileEl.textContent = text;
        if (desktopEl) desktopEl.textContent = text;

        if (timeLeft === 0) {
            clearInterval(interval);
        }
    }, 1000);
}

// Fill order — targets the clicked button directly
async function fillOrder(orderId, clickedBtn) {
    // Find the actual button that was clicked, or fall back to mobile card
    const button = clickedBtn || document.querySelector(`#order-${orderId} .fill-order-btn`);
    if (!button) return;

    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
    button.classList.add('opacity-50', 'cursor-not-allowed');

    // Also disable the counterpart button (mobile <-> desktop)
    const card = button.closest('[id^="order-"]');
    const cardId = card ? card.id : '';
    const isDesktop = cardId.endsWith('-desktop');
    const counterpartId = isDesktop ? cardId.replace('-desktop', '') : cardId + '-desktop';
    const counterpartBtn = document.querySelector(`#${counterpartId} .fill-order-btn`);
    if (counterpartBtn) {
        counterpartBtn.disabled = true;
        counterpartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
        counterpartBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('/api/fill-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (result.success && result.status === 'processing') {
            // Remove order card from live list immediately
            ['order-' + orderId, 'order-' + orderId + '-desktop'].forEach(id => {
                const c = document.getElementById(id);
                if (c) c.remove();
            });
            updateOrderCount();

            // Refresh balance UI immediately to reflect debited holding balance in background
            if (result.user) {
                updateDashboardStats(result.user);
            } else {
                try { await loadStats(); } catch(e) {}
            }

            // Run the animated processing modal flow
            runProcessingFlow(result.pendingOrder, false);

        } else {
            try { showToast(result.message || 'Gagal memproses order', 'error'); } catch(e) { console.error('Toast error:', e); }
            // Re-enable buttons
            button.disabled = false;
            button.innerHTML = originalHTML;
            button.classList.remove('opacity-50', 'cursor-not-allowed');
            if (counterpartBtn) {
                counterpartBtn.disabled = false;
                counterpartBtn.innerHTML = originalHTML;
                counterpartBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    } catch (error) {
        console.error('FillOrder fetch error:', error);
        try { showToast('Terjadi kesalahan jaringan', 'error'); } catch(e) {}
        button.disabled = false;
        button.innerHTML = originalHTML;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        if (counterpartBtn) {
            counterpartBtn.disabled = false;
            counterpartBtn.innerHTML = originalHTML;
            counterpartBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

// Update order count
function updateOrderCount() {
    const mobileList = document.getElementById('orderList');
    const count = mobileList ? mobileList.querySelectorAll(':scope > div').length : 0;

    setText('orderCount', count + ' Active');
    setText('orderCountDesktop', count + ' Active');

    const noOrders = document.getElementById('noOrders');
    const noOrdersDesktop = document.getElementById('noOrdersDesktop');
    if (noOrders) noOrders.style.display = count > 0 ? 'none' : 'block';
    if (noOrdersDesktop) noOrdersDesktop.style.display = count > 0 ? 'none' : 'block';
}

// Socket.IO events
socket.on('init-orders', (orders) => {
    const ml = document.getElementById('orderList');
    const dl = document.getElementById('orderListDesktop');
    if (ml) ml.innerHTML = '';
    if (dl) dl.innerHTML = '';
    if (orders && Array.isArray(orders)) {
        orders.forEach(renderOrder);
    }
});

socket.on('new-order', (order) => {
    renderOrder(order);
});

socket.on('order-removed', (orderId) => {
    ['order-' + orderId, 'order-' + orderId + '-desktop'].forEach(id => {
        const card = document.getElementById(id);
        if (card) card.remove();
    });
    updateOrderCount();
});

socket.on('order-locked', (orderId) => {
    lockOrder(orderId);
});

socket.on('order-unlocked', (orderId) => {
    unlockOrder(orderId);
});

// Daily reset countdown timer
let resetTimerInterval = null;
function startDailyResetTimer() {
    if (resetTimerInterval) return;

    function updateTimer() {
        const now = new Date();
        const wibOffset = 7 * 60;
        const localOffset = now.getTimezoneOffset();
        const wibTime = new Date(now.getTime() + (localOffset + wibOffset) * 60000);

        const midnight = new Date(wibTime);
        midnight.setHours(24, 0, 0, 0);

        const diffMs = midnight - wibTime;
        if (diffMs <= 0) {
            setText('dailyResetCountdownMobile', 'Reset: 00:00 WIB');
            setText('dailyResetCountdownDesktop', 'Reset: 00:00 WIB');
            return;
        }

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const pad = (n) => String(n).padStart(2, '0');
        const timerString = `${pad(hours)}j ${pad(minutes)}m ${pad(seconds)}s`;

        setText('dailyResetCountdownMobile', 'Reset: ' + timerString);
        setText('dailyResetCountdownDesktop', 'Reset dalam ' + timerString);
    }

    updateTimer();
    resetTimerInterval = setInterval(updateTimer, 1000);
}

// Helper function to update stats UI
function updateDashboardStats(stats) {
    if (!stats) return;
    
    const balanceText = formatRupiah(stats.balance);
    const holdBalanceText = formatRupiah(stats.holdBalance || 0);

    setText('balance', balanceText);
    setText('balanceDesktop', balanceText);
    setText('holdBalanceMobile', holdBalanceText);
    setText('holdBalanceDesktop', holdBalanceText);

    setText('referralCount', stats.referralCount);
    setText('referralCountDesktop', stats.referralCount);
    setText('totalOrders', stats.totalOrders);
    setText('totalOrdersDesktop', stats.totalOrders);
    setText('totalVolume', formatRupiah(stats.totalVolume));
    setText('totalVolumeDesktop', formatRupiah(stats.totalVolume));
    setText('totalVolumeMobile', formatRupiah(stats.totalVolume));
    setText('totalProfit', formatRupiah(stats.totalProfit));
    setText('totalProfitDesktop', formatRupiah(stats.totalProfit));
}

// Single global listener for user-stats-update (no duplicates)
socket.on('user-stats-update', (data) => {
    if (data && data.stats) {
        updateDashboardStats(data.stats);
    }
});

let isProcessingOrder = false;

// Check if user has an unfinished processing order (for page refresh recovery)
async function checkPendingOrder() {
    try {
        const response = await fetch('/api/pending-order');
        const data = await response.json();
        if (data.success && data.pendingOrder) {
            console.log('[PendingOrder] Recovering unfinished processing order:', data.pendingOrder);
            runProcessingFlow(data.pendingOrder, true);
        }
    } catch (error) {
        console.error('Error checking pending order:', error);
    }
}

// Multi-step Animated Processing Modal Flow
async function runProcessingFlow(pendingOrder, isRecovery) {
    if (isProcessingOrder) return;
    isProcessingOrder = true;

    const modal = document.getElementById('orderProcessingModal');
    if (!modal) return;

    // Populate modal text values
    setText('procProviderBadge', pendingOrder.provider || 'Provider');
    setText('procSourceText', pendingOrder.source || 'Mitra B2B');
    setText('procPackageTitle', pendingOrder.packageName || (pendingOrder.provider + ' ' + pendingOrder.quotaGb + 'GB'));
    setText('procPhoneText', pendingOrder.phoneNumber || '-');
    setText('procBasePriceText', formatRupiah(pendingOrder.basePrice));

    // Show unclosable modal
    modal.classList.remove('hidden');

    const iconContainer = document.getElementById('procIconContainer');
    const statusIcon = document.getElementById('procStatusIcon');
    const stepTitle = document.getElementById('procStepTitle');
    const stepSubtitle = document.getElementById('procStepSubtitle');
    const amountHighlight = document.getElementById('procAmountHighlight');
    const ambientGlow = document.getElementById('modalAmbientGlow');

    const dot1 = document.getElementById('stepDot1');
    const dot2 = document.getElementById('stepDot2');
    const dot3 = document.getElementById('stepDot3');

    function setStep(step) {
        if (step === 1) {
            // Step 1: Red - Holding Capital
            if (iconContainer) iconContainer.className = 'w-16 h-16 rounded-2xl bg-red-100 text-red-600 border border-red-200 flex items-center justify-center text-2xl font-bold mb-3 transition-all duration-500 shadow-md';
            if (statusIcon) statusIcon.className = 'fas fa-lock animate-bounce';
            if (stepTitle) stepTitle.textContent = 'Step 1: Modal Order';
            if (stepSubtitle) stepSubtitle.innerHTML = `Modal sebesar <span class="text-red-600 font-bold font-mono">${formatRupiah(pendingOrder.basePrice)}</span> digunakan untuk memproses order`;
            if (amountHighlight) {
                amountHighlight.className = 'mt-3 px-4 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-black text-sm font-mono tracking-tight shadow-sm transition-all duration-500';
                amountHighlight.textContent = '-' + formatRupiah(pendingOrder.basePrice);
            }
            if (ambientGlow) ambientGlow.className = 'absolute -top-24 -left-24 w-48 h-48 bg-red-500/20 rounded-full blur-3xl pointer-events-none transition-colors duration-500';

            if (dot1) dot1.className = 'py-2 px-1 rounded-xl bg-red-50 border border-red-200 transition-all font-bold';
            if (dot2) dot2.className = 'py-2 px-1 rounded-xl bg-slate-100 border border-slate-200 opacity-50 transition-all';
            if (dot3) dot3.className = 'py-2 px-1 rounded-xl bg-slate-100 border border-slate-200 opacity-50 transition-all';

        } else if (step === 2) {
            // Step 2: Amber - Telco Processing
            if (iconContainer) iconContainer.className = 'w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center text-2xl font-bold mb-3 transition-all duration-500 shadow-md';
            if (statusIcon) statusIcon.className = 'fas fa-satellite-dish fa-spin';
            if (stepTitle) stepTitle.textContent = 'Step 2: Menghubungkan ke Provider...';
            if (stepSubtitle) stepSubtitle.textContent = `Memproses pengiriman ${pendingOrder.packageName} ke ${pendingOrder.phoneNumber}`;
            if (amountHighlight) {
                amountHighlight.className = 'mt-3 px-4 py-1.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-black text-sm font-mono tracking-tight shadow-sm transition-all duration-500';
                amountHighlight.textContent = 'Proses Eksekusi...';
            }
            if (ambientGlow) ambientGlow.className = 'absolute -top-24 -left-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none transition-colors duration-500';

            if (dot1) dot1.className = 'py-2 px-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 transition-all';
            if (dot2) dot2.className = 'py-2 px-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 transition-all font-extrabold';
            if (dot3) dot3.className = 'py-2 px-1 rounded-xl bg-slate-100 border border-slate-200 opacity-50 transition-all';

        } else if (step === 3) {
            // Step 3: Green - Success Credit & Profit
            const totalReturn = pendingOrder.basePrice + pendingOrder.profit;
            if (iconContainer) iconContainer.className = 'w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center text-2xl font-bold mb-3 transition-all duration-500 shadow-md scale-110';
            if (statusIcon) statusIcon.className = 'fas fa-check-circle animate-bounce';
            if (stepTitle) stepTitle.textContent = 'Step 3: Eksekusi Berhasil!';
            if (stepSubtitle) stepSubtitle.innerHTML = `Modal + Profit <span class="font-bold text-amber-600">(+${formatRupiah(totalReturn)})</span> masuk ke Saldo Tertahan`;
            if (amountHighlight) {
                amountHighlight.className = 'mt-3 px-4 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-black text-sm font-mono tracking-tight shadow-md transition-all duration-500 scale-105';
                amountHighlight.textContent = '+' + formatRupiah(totalReturn);
            }
            if (ambientGlow) ambientGlow.className = 'absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/30 rounded-full blur-3xl pointer-events-none transition-colors duration-500';

            if (dot1) dot1.className = 'py-2 px-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 transition-all';
            if (dot2) dot2.className = 'py-2 px-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 transition-all';
            if (dot3) dot3.className = 'py-2 px-1 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 font-extrabold transition-all';
        }
    }

    try {
        // Phase 1: Debit Hold (show 1.0s unless page refresh recovery)
        setStep(1);
        if (!isRecovery) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // Phase 2: Telco Processing (randomized between 10s - 25s for natural feel)
        setStep(2);
        const randomProcessingMs = Math.floor(Math.random() * 15000) + 10000;
        await new Promise(r => setTimeout(r, randomProcessingMs));

        // Phase 3: Finalize Credit & Profit via API
        const response = await fetch('/api/complete-fill-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: pendingOrder.orderId })
        });
        const result = await response.json();

        if (result.success) {
            setStep(3);
            await loadStats();
            await new Promise(r => setTimeout(r, 3000));
            modal.classList.add('hidden');
            showToast(result.message || 'Eksekusi order berhasil!', 'success');
        } else {
            showToast(result.message || 'Gagal merilis modal order', 'error');
            modal.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error during processing flow:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
        modal.classList.add('hidden');
    } finally {
        isProcessingOrder = false;
    }
}

// Register socket with user ID
function registerSocket() {
    if (!socket || typeof io === 'undefined') return;

    fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                if (socket.connected) {
                    socket.emit('register-user', data.user.id);
                }

                socket.on('connect', () => {
                    socket.emit('register-user', data.user.id);
                });

                // Update user name in header (both mobile and desktop)
                const nameEl = document.getElementById('userNameDisplay');
                if (nameEl) nameEl.textContent = data.user.full_name || 'User';
                const nameElDesktop = document.getElementById('userNameDisplayDesktop');
                if (nameElDesktop) nameElDesktop.textContent = data.user.full_name || 'User';
            }
            if (data.success && data.stats) {
                updateDashboardStats(data.stats);
            }
        })
        .catch(err => console.error('Error fetching auth for socket:', err));
}

// Initialize
console.log('[Dashboard] Initializing dashboard.js v9');
registerSocket();
loadStats();
checkPendingOrder();
