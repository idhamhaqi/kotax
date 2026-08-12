// Security: HTML escape utility to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Element selectors
    const userBalanceEl = document.getElementById('user-balance');
    const userQuotaEl = document.getElementById('user-quota');
    const orderListEl = document.getElementById('order-list');
    const buyQuotaForm = document.getElementById('buy-quota-form');
    const buyAmountInput = document.getElementById('buy-amount-usdt');
    const noOrdersMessage = document.getElementById('no-orders-message');
    const ordersCountEl = document.getElementById('orders-count');

    let timers = {}; // Untuk menyimpan interval timer setiap order
    let orderCount = 0; // Counter untuk jumlah order aktif

    // --- Helper Functions ---
    const updateStats = (user) => {
        userBalanceEl.textContent = `$${parseFloat(user.balanceUSDT).toFixed(2)}`;
        userQuotaEl.textContent = `${parseFloat(user.quotaGB).toFixed(2)} GB`;
        
        // Add animation effect
        userBalanceEl.style.transform = 'scale(1.1)';
        userQuotaEl.style.transform = 'scale(1.1)';
        setTimeout(() => {
            userBalanceEl.style.transform = 'scale(1)';
            userQuotaEl.style.transform = 'scale(1)';
        }, 200);
    };

    const updateOrdersCount = () => {
        ordersCountEl.textContent = `${orderCount} Active`;
    };

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            margin-bottom: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            transform: translateX(400px);
            opacity: 0;
            transition: all 0.3s ease;
            font-weight: 500;
        `;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        }, 100);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(400px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
    
    const renderOrder = (order) => {
        if (noOrdersMessage) noOrdersMessage.style.display = 'none';
        orderCount++;
        updateOrdersCount();

        const timeRemaining = Math.max(0, Math.floor((order.expiresAt - Date.now()) / 1000));
        
        const orderCard = document.createElement('div');
        orderCard.id = order.id;
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <div class="order-header">
                <div class="country-name">
                    <i class="fas fa-flag"></i> ${order.country}
                </div>
                <div class="provider-badge">
                    <i class="fas fa-building"></i> ${order.provider}
                </div>
            </div>
            
            <div class="order-details">
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-phone"></i> Phone Number
                    </div>
                    <div class="detail-value phone">${order.phoneNumber}</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-database"></i> Requested
                    </div>
                    <div class="detail-value quota">${order.quota.toFixed(2)} GB</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">
                        <i class="fas fa-dollar-sign"></i> Payment
                    </div>
                    <div class="detail-value price">$${order.price.toFixed(2)}</div>
                </div>
            </div>
            
            <div class="order-actions">
                <button data-order-id="${order.id}" class="fill-order-btn">
                    <i class="fas fa-handshake"></i> Fill Order
                </button>
                
                <div class="countdown-container">
                    <div class="countdown-label">
                        <i class="fas fa-clock"></i> Expires in
                    </div>
                    <div class="countdown-timer" data-expires-at="${order.expiresAt}">${timeRemaining}s</div>
                </div>
            </div>
        `;
        
        orderListEl.prepend(orderCard);
        
        // Add entrance animation
        setTimeout(() => {
            orderCard.style.opacity = '1';
            orderCard.style.transform = 'translateY(0)';
        }, 100);
        
        startCountdown(order.id, order.expiresAt);
        showToast(`New order from ${order.country} - ${order.quota.toFixed(2)} GB for $${order.price.toFixed(2)}`, 'success');
    };

    const startCountdown = (orderId, expiresAt) => {
        const timerEl = document.querySelector(`#${orderId} .countdown-timer`);
        if (!timerEl) return;
        
        clearInterval(timers[orderId]); // Hapus timer lama jika ada

        timers[orderId] = setInterval(() => {
            const timeLeft = Math.round((expiresAt - Date.now()) / 1000);
            if (timeLeft <= 0) {
                timerEl.innerHTML = '<i class="fas fa-times-circle"></i> Expired';
                timerEl.style.color = '#dc2626';
                clearInterval(timers[orderId]);
            } else {
                // Change color based on time remaining
                if (timeLeft <= 30) {
                    timerEl.style.color = '#dc2626'; // Red
                } else if (timeLeft <= 60) {
                    timerEl.style.color = '#f59e0b'; // Orange
                } else {
                    timerEl.style.color = '#10b981'; // Green
                }
                timerEl.textContent = `${timeLeft}s`;
            }
        }, 1000);
    };

    const removeOrder = (orderId) => {
        const orderEl = document.getElementById(orderId);
        if (orderEl) {
            orderEl.classList.add('fade-out');
            orderCount--;
            updateOrdersCount();
            
            setTimeout(() => {
                orderEl.remove();
                if (orderCount === 0) {
                    if(noOrdersMessage) noOrdersMessage.style.display = 'block';
                }
            }, 500);
        }
        clearInterval(timers[orderId]);
        delete timers[orderId];
    };
    
    // --- Socket.IO Event Listeners ---
    socket.on('init-data', ({ user, orders }) => {
        updateStats(user);
        orderListEl.innerHTML = ''; // Bersihkan list
        orderListEl.appendChild(noOrdersMessage); // Tambahkan lagi pesan default
        orderCount = 0;
        
        if (orders.length > 0) {
            orders.forEach(renderOrder);
        } else {
            if(noOrdersMessage) noOrdersMessage.style.display = 'block';
        }
        updateOrdersCount();
        showToast('Dashboard connected successfully!', 'success');
    });

    socket.on('update-stats', (user) => {
        updateStats(user);
        showToast('Stats updated!', 'success');
    });

    socket.on('new-order', renderOrder);

    socket.on('order-removed', (orderId) => {
        removeOrder(orderId);
        showToast('Order expired or completed', 'info');
    });

    // --- DOM Event Listeners ---
    buyQuotaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(buyAmountInput.value);
        
        if (isNaN(amount) || amount <= 0) {
            showToast('Please enter a valid amount!', 'error');
            return;
        }

        // Disable form while processing
        const submitBtn = buyQuotaForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const response = await fetch('/api/buy-quota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amountUSDT: amount })
            });
            const result = await response.json();
            
            if (!result.success) {
                showToast(`Error: ${result.message}`, 'error');
            } else {
                buyAmountInput.value = ''; // Reset input
                showToast(`Successfully purchased ${amount * 10} GB!`, 'success');
            }
        } catch (error) {
            console.error('Failed to buy quota:', error);
            showToast('Network error. Please try again.', 'error');
        } finally {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
    
    orderListEl.addEventListener('click', async (e) => {
        if (e.target.classList.contains('fill-order-btn') || e.target.closest('.fill-order-btn')) {
            const button = e.target.closest('.fill-order-btn');
            const orderId = button.dataset.orderId;
            const originalText = button.innerHTML;
            
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const response = await fetch('/api/fill-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId })
                });
                const result = await response.json();
                
                if (!result.success) {
                    showToast(`Failed: ${result.message}`, 'error');
                    button.disabled = false;
                    button.innerHTML = originalText;
                } else {
                    showToast('Order filled successfully!', 'success');
                }
                // Jika sukses, UI akan diupdate via socket.io
            } catch (error) {
                console.error('Failed to fill order:', error);
                showToast('Network error while filling order.', 'error');
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
    });

    // Add smooth transitions for all elements
    const style = document.createElement('style');
    style.textContent = `
        .stat-value {
            transition: transform 0.2s ease;
        }
        
        .order-card {
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
        }
        
        .btn-buy, .fill-order-btn {
            transition: all 0.3s ease;
        }
        
        .input-group input {
            transition: all 0.3s ease;
        }
    `;
    document.head.appendChild(style);

    // Add connection status indicator
    socket.on('connect', () => {
        showToast('Connected to trading server', 'success');
    });

    socket.on('disconnect', () => {
        showToast('Disconnected from server', 'error');
    });

    // Real-time clock for better UX
    const updateClock = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        document.title = `Quota Trader - ${timeString}`;
    };

    setInterval(updateClock, 1000);
    updateClock();
});