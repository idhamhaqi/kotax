// Withdrawal page handlers

function formatRupiah(amount) {
    return 'Rp ' + parseInt(amount).toLocaleString('id-ID');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function maskBankAccount(accNo) {
    if (!accNo) return '-';
    const str = String(accNo).trim();
    if (str.length <= 4) return str;
    const last4 = str.slice(-4);
    const prefix = str.length >= 7 ? str.slice(0, 3) : str.slice(0, 2);
    return `${prefix}*****${last4}`;
}

async function loadUserBankInfo() {
    try {
        const response = await fetch('/api/auth/me');
        const result = await response.json();

        if (result.success) {
            const maskedAcc = maskBankAccount(result.user.bank_account_number);

            setText('userBankDesktop', result.user.bank_name);
            setText('userAccountDesktop', maskedAcc);
            setText('userNameDesktop', result.user.full_name);
            
            setText('userBankMobile', result.user.bank_name);
            setText('userAccountMobile', maskedAcc);
            setText('userNameMobile', result.user.full_name);
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

let desktopWithdrawalPage = 1;
let mobileWithdrawalOffset = 0;
const limit = 20;
let hasMoreMobileWithdrawal = true;

async function loadDesktopWithdrawalHistory(page = 1) {
    desktopWithdrawalPage = page;
    const offset = (page - 1) * limit;
    try {
        const response = await fetch(`/api/withdrawal/history?limit=${limit}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            const tbody = document.getElementById('withdrawalHistoryDesktop');
            const paginationContainer = document.getElementById('paginationContainerDesktop');
            
            if (tbody) tbody.innerHTML = '';

            if (result.withdrawals.length === 0 && page === 1) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Belum ada riwayat penarikan</td></tr>';
                if (paginationContainer) paginationContainer.classList.add('hidden');
                return;
            }

            if (paginationContainer) paginationContainer.classList.remove('hidden');

            result.withdrawals.forEach(withdrawal => {
                const statusColorsDesktop = {
                    pending: 'text-yellow-600 bg-yellow-100',
                    approved: 'text-green-600 bg-green-100',
                    rejected: 'text-red-600 bg-red-100'
                };
                
                const statusLabels = {
                    pending: 'Pending',
                    approved: 'Disetujui',
                    rejected: 'Ditolak'
                };

                // Desktop Row
                if (tbody) {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-gray-50 transition';
                    row.innerHTML = `
                        <td class="py-3 px-2 text-sm text-gray-600">${formatDate(withdrawal.created_at)}</td>
                        <td class="py-3 px-2 text-sm font-bold text-gray-800">${formatRupiah(withdrawal.amount)}</td>
                        <td class="py-3 px-2 text-sm text-gray-600">${escapeHtml(withdrawal.bank_name)}</td>
                        <td class="py-3 px-2">
                            <span class="px-2 py-1 rounded text-xs font-semibold ${statusColorsDesktop[withdrawal.status]}">
                                ${statusLabels[withdrawal.status]}
                            </span>
                        </td>
                    `;
                    tbody.appendChild(row);
                }
            });

            renderDesktopWithdrawalPagination(result.pagination, page);
        }
    } catch (error) {
        console.error('Error loading desktop withdrawal history:', error);
    }
}

function renderDesktopWithdrawalPagination(pagination, page) {
    const infoEl = document.getElementById('paginationInfoDesktop');
    const pagesEl = document.getElementById('paginationPagesDesktop');
    if (!infoEl || !pagesEl) return;

    const total = pagination.total;
    const from = total === 0 ? 0 : pagination.offset + 1;
    const to = Math.min(pagination.offset + limit, total);
    infoEl.textContent = `Showing ${from} to ${to} of ${total} entries`;

    pagesEl.innerHTML = '';
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement('button');
    prevBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${page > 1 ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    if (page > 1) {
        prevBtn.onclick = () => loadDesktopWithdrawalHistory(page - 1);
    }
    pagesEl.appendChild(prevBtn);

    // Page Numbers
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${i === page ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-gray-50 text-gray-700'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadDesktopWithdrawalHistory(i);
        pagesEl.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${page < totalPages ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    if (page < totalPages) {
        nextBtn.onclick = () => loadDesktopWithdrawalHistory(page + 1);
    }
    pagesEl.appendChild(nextBtn);
}

async function loadMobileWithdrawalHistory(append = false) {
    if (!append) {
        mobileWithdrawalOffset = 0;
    }
    try {
        const response = await fetch(`/api/withdrawal/history?limit=${limit}&offset=${mobileWithdrawalOffset}`);
        const result = await response.json();

        if (result.success) {
            const mbody = document.getElementById('withdrawalHistoryMobile');
            const loadMoreContainer = document.getElementById('loadMoreContainerMobile');
            
            if (!append && mbody) mbody.innerHTML = '';

            if (result.withdrawals.length === 0 && mobileWithdrawalOffset === 0) {
                if (mbody) mbody.innerHTML = '<p class="text-center text-xs text-gray-400 py-4">Belum ada riwayat</p>';
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
                return;
            }

            result.withdrawals.forEach(withdrawal => {
                const statusColorsMobile = {
                    pending: 'text-yellow-600 bg-yellow-50',
                    approved: 'text-green-600 bg-green-50',
                    rejected: 'text-red-600 bg-red-50'
                };
                
                const statusLabels = {
                    pending: 'Pending',
                    approved: 'Disetujui',
                    rejected: 'Ditolak'
                };

                // Mobile Card
                if (mbody) {
                    const dateObj = new Date(withdrawal.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'});
                    
                    mbody.insertAdjacentHTML('beforeend', `
                        <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-[10px] text-gray-400 font-medium">${dateStr} ${timeStr}</span>
                                <span class="text-[10px] ${statusColorsMobile[withdrawal.status]} px-2 py-0.5 rounded-full font-semibold">${statusLabels[withdrawal.status]}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-[10px] text-gray-500 font-medium mb-0.5">Penarikan</p>
                                    <p class="text-sm font-bold text-gray-800">${formatRupiah(withdrawal.amount)}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-[10px] text-gray-500 font-medium mb-0.5">Tujuan</p>
                                    <p class="text-xs font-bold text-gray-700">${escapeHtml(withdrawal.bank_name)}</p>
                                </div>
                            </div>
                        </div>
                    `);
                }
            });

            hasMoreMobileWithdrawal = result.pagination.hasMore;
            if (loadMoreContainer) {
                if (hasMoreMobileWithdrawal) {
                    loadMoreContainer.classList.remove('hidden');
                } else {
                    loadMoreContainer.classList.add('hidden');
                }
            }
        }
    } catch (error) {
        console.error('Error loading mobile withdrawal history:', error);
    }
}

let pendingWithdrawalData = null;

function openPinModal(amount) {
    pendingWithdrawalData = { amount };
    const modal = document.getElementById('pinVerificationModal');
    const amountSpan = document.getElementById('pinModalAmount');
    const inputPin = document.getElementById('inputModalPin');
    
    if (amountSpan) amountSpan.textContent = formatRupiah(amount);
    if (inputPin) inputPin.value = '';
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => inputPin?.focus(), 100);
    }
}

function closePinModal() {
    pendingWithdrawalData = null;
    const modal = document.getElementById('pinVerificationModal');
    if (modal) modal.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserBankInfo();
    loadDesktopWithdrawalHistory(1);
    loadMobileWithdrawalHistory(false);

    const btnMobile = document.getElementById('loadMoreBtnMobile');
    if (btnMobile) btnMobile.addEventListener('click', () => {
        if (hasMoreMobileWithdrawal) {
            mobileWithdrawalOffset += limit;
            loadMobileWithdrawalHistory(true);
        }
    });

    const forms = ['withdrawalFormDesktop', 'withdrawalFormMobile'];
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const amount = parseInt(formData.get('amount'));

                if (!amount || amount < 100000) {
                    showToast('Minimal penarikan adalah Rp 100.000', 'error');
                    return;
                }

                // Pre-check eligibility with server FIRST
                try {
                    const response = await fetch('/api/withdrawal/pre-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount })
                    });

                    const result = await response.json();

                    if (!result.success) {
                        showToast(result.message, 'error');
                        if (result.requirePinSetup) {
                            setTimeout(() => {
                                window.location.href = '/profile';
                            }, 2000);
                        }
                        return;
                    }

                    // Pre-check passed! Open PIN Modal
                    openPinModal(amount);
                } catch (error) {
                    showToast('Terjadi kesalahan koneksi server', 'error');
                }
            });
        }
    });

    const pinForm = document.getElementById('pinModalForm');
    if (pinForm) {
        pinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputPin = document.getElementById('inputModalPin');
            const pin = inputPin ? inputPin.value.trim() : '';

            if (!pin || !/^\d{6}$/.test(pin)) {
                showToast('PIN Transaksi harus berupa 6 digit angka!', 'error');
                return;
            }

            if (!pendingWithdrawalData) return;

            const payload = {
                amount: pendingWithdrawalData.amount,
                pin: pin
            };

            try {
                const response = await fetch('/api/withdrawal/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.success) {
                    showToast(result.message, 'success');
                    closePinModal();
                    document.getElementById('withdrawalFormDesktop')?.reset();
                    document.getElementById('withdrawalFormMobile')?.reset();
                    loadDesktopWithdrawalHistory(1);
                    loadMobileWithdrawalHistory(false);
                } else {
                    showToast(result.message, 'error');
                    if (result.requirePinSetup) {
                        closePinModal();
                        setTimeout(() => {
                            window.location.href = '/profile';
                        }, 2000);
                    }
                }
            } catch (error) {
                showToast('Terjadi kesalahan server', 'error');
            }
        });
    }
});
