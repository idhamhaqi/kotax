// Format currency
function formatRupiah(amount) {
    return 'Rp ' + parseInt(Math.abs(amount || 0)).toLocaleString('id-ID');
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

let currentTab = 'orders'; // 'orders' or 'mutasi'
let mobileOffset = 0;
let desktopPage = 1;
const limit = 20;
let hasMoreMobile = true;

// Tab Switcher
function switchTab(tabName) {
    if (currentTab === tabName) return;
    currentTab = tabName;

    const mOrdersBtn = document.getElementById('mobileTabOrders');
    const mMutasiBtn = document.getElementById('mobileTabMutasi');
    const dOrdersBtn = document.getElementById('desktopTabOrders');
    const dMutasiBtn = document.getElementById('desktopTabMutasi');

    const vOrdersMobile = document.getElementById('viewOrdersMobile');
    const vMutasiMobile = document.getElementById('viewMutasiMobile');
    const vOrdersDesktop = document.getElementById('viewOrdersDesktop');
    const vMutasiDesktop = document.getElementById('viewMutasiDesktop');

    if (tabName === 'orders') {
        if (mOrdersBtn) mOrdersBtn.className = 'py-2.5 px-3 rounded-xl text-xs text-center transition-all tab-active flex items-center justify-center gap-1.5';
        if (mMutasiBtn) mMutasiBtn.className = 'py-2.5 px-3 rounded-xl text-xs text-center transition-all tab-inactive flex items-center justify-center gap-1.5';
        if (dOrdersBtn) dOrdersBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all tab-active flex items-center gap-2';
        if (dMutasiBtn) dMutasiBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all tab-inactive flex items-center gap-2';

        if (vOrdersMobile) vOrdersMobile.classList.remove('hidden');
        if (vMutasiMobile) vMutasiMobile.classList.add('hidden');
        if (vOrdersDesktop) vOrdersDesktop.classList.remove('hidden');
        if (vMutasiDesktop) vMutasiDesktop.classList.add('hidden');

        loadDesktopHistory(1);
        loadMobileHistory(false);

    } else {
        if (mOrdersBtn) mOrdersBtn.className = 'py-2.5 px-3 rounded-xl text-xs text-center transition-all tab-inactive flex items-center justify-center gap-1.5';
        if (mMutasiBtn) mMutasiBtn.className = 'py-2.5 px-3 rounded-xl text-xs text-center transition-all tab-active flex items-center justify-center gap-1.5';
        if (dOrdersBtn) dOrdersBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all tab-inactive flex items-center gap-2';
        if (dMutasiBtn) dMutasiBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all tab-active flex items-center gap-2';

        if (vOrdersMobile) vOrdersMobile.classList.add('hidden');
        if (vMutasiMobile) vMutasiMobile.classList.remove('hidden');
        if (vOrdersDesktop) vOrdersDesktop.classList.add('hidden');
        if (vMutasiDesktop) vMutasiDesktop.classList.remove('hidden');

        loadDesktopMutasi(1);
        loadMobileMutasi(false);
    }
}

// ----------------------------------------------------
// TAB 1: ORDERS HISTORY (DESKTOP & MOBILE)
// ----------------------------------------------------
async function loadDesktopHistory(page = 1) {
    desktopPage = page;
    const offset = (page - 1) * limit;
    try {
        const response = await fetch(`/api/history/fill-orders?limit=${limit}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            const tableBody = document.getElementById('historyTableDesktop');
            const emptyState = document.getElementById('emptyStateDesktop');
            const paginationContainer = document.getElementById('paginationContainerDesktop');

            if (tableBody) tableBody.innerHTML = '';

            if (result.history.length === 0 && page === 1) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (paginationContainer) paginationContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');
                if (paginationContainer) paginationContainer.classList.remove('hidden');

                result.history.forEach(item => {
                    const dateObj = new Date(item.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

                    const sourceIcon = item.source_type === 'server'
                        ? '<i class="fas fa-server text-purple-600 mr-1"></i>'
                        : '<i class="fas fa-store text-blue-600 mr-1"></i>';

                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-gray-50 transition';
                    row.innerHTML = `
                        <td class="py-3 px-3 text-xs font-semibold text-gray-600">${dateStr} ${timeStr}</td>
                        <td class="py-3 px-3 text-xs">
                            <div class="flex items-center">
                                ${sourceIcon}
                                <span class="text-gray-800 font-bold">${escapeHtml(item.source)}</span>
                            </div>
                        </td>
                        <td class="py-3 px-3 text-xs font-bold text-gray-800">${escapeHtml(item.provider)}</td>
                        <td class="py-3 px-3 text-xs font-mono text-gray-600">${escapeHtml(item.phone_number)}</td>
                        <td class="py-3 px-3 text-xs font-bold text-blue-600">${item.quota_gb}GB</td>
                        <td class="py-3 px-3 text-xs font-bold text-green-600">${formatRupiah(item.price)}</td>
                        <td class="py-3 px-3 text-xs font-bold text-yellow-600">+${formatRupiah(item.profit)}</td>
                    `;
                    if (tableBody) tableBody.appendChild(row);
                });

                renderDesktopPagination(result.pagination, 'orders');
            }
        }
    } catch (error) {
        console.error('Error loading desktop orders history:', error);
    }
}

async function loadMobileHistory(append = false) {
    if (!append) mobileOffset = 0;
    try {
        const response = await fetch(`/api/history/fill-orders?limit=${limit}&offset=${mobileOffset}`);
        const result = await response.json();

        if (result.success) {
            const listEl = document.getElementById('historyListMobile');
            const emptyState = document.getElementById('emptyStateMobile');
            const loadMoreContainer = document.getElementById('loadMoreContainerMobile');

            if (!append && listEl) listEl.innerHTML = '';

            if (result.history.length === 0 && mobileOffset === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');

                result.history.forEach(item => {
                    const dateObj = new Date(item.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

                    const sourceIcon = item.source_type === 'server'
                        ? '<div class="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><i class="fas fa-server text-xs"></i></div>'
                        : '<div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i class="fas fa-store text-xs"></i></div>';

                    if (listEl) {
                        listEl.insertAdjacentHTML('beforeend', `
                            <div class="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm flex gap-3 items-center">
                                ${sourceIcon}
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-start mb-1">
                                        <h4 class="font-bold text-gray-800 text-xs truncate pr-2">${item.quota_gb}GB - ${escapeHtml(item.phone_number)}</h4>
                                        <span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">${escapeHtml(item.provider)}</span>
                                    </div>
                                    <div class="flex justify-between items-end">
                                        <p class="text-[10px] text-gray-400 font-medium">${dateStr} ${timeStr}</p>
                                        <div class="text-right">
                                            <p class="text-xs font-extrabold text-green-600">${formatRupiah(item.price)}</p>
                                            <p class="text-[10px] font-bold text-amber-600">Profit: +${formatRupiah(item.profit)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `);
                    }
                });

                hasMoreMobile = result.pagination.hasMore;
                if (loadMoreContainer) {
                    loadMoreContainer.classList.toggle('hidden', !hasMoreMobile);
                }
            }
        }
    } catch (error) {
        console.error('Error loading mobile orders history:', error);
    }
}

// Helper to toggle settlement group collapse/expand
function toggleSettlementGroup(groupId) {
    const el = document.getElementById('group-items-' + groupId);
    const icon = document.getElementById('group-icon-' + groupId);
    if (!el) return;
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        if (icon) icon.classList.add('rotate-180');
    } else {
        el.classList.add('hidden');
        if (icon) icon.classList.remove('rotate-180');
    }
}

// ----------------------------------------------------
// TAB 2: MUTASI SALDO HISTORY (DESKTOP & MOBILE)
// ----------------------------------------------------
async function loadDesktopMutasi(page = 1) {
    desktopPage = page;
    const offset = (page - 1) * limit;
    try {
        const response = await fetch(`/api/history/mutasi?limit=${limit}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            const tableBody = document.getElementById('mutasiTableDesktop');
            const emptyState = document.getElementById('emptyMutasiDesktop');
            const paginationContainer = document.getElementById('paginationMutasiContainerDesktop');

            if (tableBody) tableBody.innerHTML = '';

            if (result.transactions.length === 0 && page === 1) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (paginationContainer) paginationContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');
                if (paginationContainer) paginationContainer.classList.remove('hidden');

                result.transactions.forEach(item => {
                    const dateObj = new Date(item.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

                    if (item.isGroup) {
                        // Render Collapsible Group Header Row (Emerald Credit Theme)
                        const groupRow = document.createElement('tr');
                        groupRow.className = 'border-b border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 cursor-pointer transition';
                        groupRow.onclick = () => toggleSettlementGroup('desktop-' + item.groupId);
                        groupRow.innerHTML = `
                            <td class="py-3.5 px-3 text-xs font-semibold text-gray-700">${dateStr} ${timeStr}</td>
                            <td class="py-3.5 px-3 text-xs">
                                <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">SETTLEMENT</span>
                            </td>
                            <td class="py-3.5 px-3 text-xs font-extrabold text-emerald-950 flex items-center justify-between">
                                <span><i class="fas fa-check-circle text-emerald-600 mr-1.5"></i> ${escapeHtml(item.title)} (${item.transactionCount} Transaksi Order)</span>
                                <i id="group-icon-desktop-${item.groupId}" class="fas fa-chevron-down text-xs text-emerald-700 transition-transform"></i>
                            </td>
                            <td class="py-3.5 px-3 text-xs text-right font-mono text-emerald-600 font-black">+${formatRupiah(item.totalAmount)}</td>
                        `;
                        if (tableBody) tableBody.appendChild(groupRow);

                        // Render Nested Sub-Items Table Row
                        const detailRow = document.createElement('tr');
                        detailRow.id = `group-items-desktop-${item.groupId}`;
                        detailRow.className = 'hidden bg-emerald-50/30';
                        detailRow.innerHTML = `
                            <td colspan="4" class="p-3 border-b border-emerald-200">
                                <div class="bg-white rounded-xl border border-emerald-200 p-3 shadow-inner space-y-1.5">
                                    <p class="text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-2">Rincian Order Audit Settlement (${item.transactionCount} Transaksi)</p>
                                    ${item.items.map(subTx => {
                                        const subDate = new Date(subTx.created_at);
                                        const subTime = subDate.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
                                        return `
                                            <div class="flex justify-between items-center py-1.5 px-3 bg-gray-50/70 rounded-lg text-xs hover:bg-gray-100/80 transition">
                                                <div class="flex items-center gap-2">
                                                    <i class="fas fa-check-circle text-emerald-500 text-xs"></i>
                                                    <span class="font-bold text-gray-800 text-xs">${escapeHtml(subTx.description)}</span>
                                                    <span class="text-[10px] text-gray-400 font-mono">${subTx.phone_number ? '(' + escapeHtml(subTx.phone_number) + ')' : ''}</span>
                                                </div>
                                                <div class="flex items-center gap-3 font-mono">
                                                    <span class="text-[10px] text-gray-400">${subTime}</span>
                                                    <span class="font-bold text-emerald-600 text-xs">+${formatRupiah(subTx.amount)}</span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </td>
                        `;
                        if (tableBody) tableBody.appendChild(detailRow);

                    } else {
                        const amountNum = Number(item.amount);
                        const isDebit = amountNum < 0 || item.type.includes('debit') || item.type.includes('withdrawal');

                        const typeBadge = isDebit
                            ? '<span class="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 uppercase">DEBIT</span>'
                            : '<span class="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">KREDIT</span>';

                        const amountText = (isDebit ? '-' : '+') + formatRupiah(amountNum);
                        const amountClass = isDebit ? 'text-red-600 font-black' : 'text-emerald-600 font-black';

                        const row = document.createElement('tr');
                        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition';
                        row.innerHTML = `
                            <td class="py-3.5 px-3 text-xs font-semibold text-gray-600">${dateStr} ${timeStr}</td>
                            <td class="py-3.5 px-3 text-xs">${typeBadge}</td>
                            <td class="py-3.5 px-3 text-xs font-bold text-gray-800">${escapeHtml(item.description || item.type)}</td>
                            <td class="py-3.5 px-3 text-xs text-right font-mono ${amountClass}">${amountText}</td>
                        `;
                        if (tableBody) tableBody.appendChild(row);
                    }
                });

                renderDesktopPagination(result.pagination, 'mutasi');
            }
        }
    } catch (error) {
        console.error('Error loading desktop mutasi history:', error);
    }
}

async function loadMobileMutasi(append = false) {
    if (!append) mobileOffset = 0;
    try {
        const response = await fetch(`/api/history/mutasi?limit=${limit}&offset=${mobileOffset}`);
        const result = await response.json();

        if (result.success) {
            const listEl = document.getElementById('mutasiListMobile');
            const emptyState = document.getElementById('emptyMutasiMobile');
            const loadMoreContainer = document.getElementById('loadMoreContainerMobile');

            if (!append && listEl) listEl.innerHTML = '';

            if (result.transactions.length === 0 && mobileOffset === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');

                result.transactions.forEach(item => {
                    const dateObj = new Date(item.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

                    if (item.isGroup) {
                        // Render Mobile Collapsible Group Card (Emerald Credit Theme)
                        const groupCardHtml = `
                            <div class="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 shadow-sm space-y-2">
                                <div class="flex justify-between items-center cursor-pointer" onclick="toggleSettlementGroup('${item.groupId}')">
                                    <div class="flex gap-2.5 items-center min-w-0 pr-2">
                                        <div class="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center shrink-0 font-bold">
                                            <i class="fas fa-check-circle text-xs"></i>
                                        </div>
                                        <div class="min-w-0">
                                            <h4 class="font-extrabold text-emerald-950 text-xs truncate">${escapeHtml(item.title)}</h4>
                                            <p class="text-[10px] text-emerald-700 font-medium">${item.transactionCount} Order • ${dateStr} ${timeStr}</p>
                                        </div>
                                    </div>
                                    <div class="text-right shrink-0 flex items-center gap-1.5">
                                        <span class="text-xs font-black font-mono text-emerald-600">+${formatRupiah(item.totalAmount)}</span>
                                        <i id="group-icon-${item.groupId}" class="fas fa-chevron-down text-xs text-emerald-700 transition-transform"></i>
                                    </div>
                                </div>

                                <div id="group-items-${item.groupId}" class="hidden pt-2.5 border-t border-emerald-200/80 space-y-2">
                                    ${item.items.map(subTx => {
                                        const subDate = new Date(subTx.created_at);
                                        const subTime = subDate.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
                                        return `
                                            <div class="bg-white/80 border border-emerald-100 rounded-xl p-2.5 flex justify-between items-center text-xs">
                                                <div class="min-w-0 pr-2">
                                                    <p class="font-bold text-gray-800 text-[11px] truncate">${escapeHtml(subTx.description || 'Pencairan Order')}</p>
                                                    <p class="text-[9px] text-gray-400 font-mono">${subTx.phone_number || ''} • ${subTime}</p>
                                                </div>
                                                <span class="font-bold text-emerald-600 font-mono text-xs shrink-0">+${formatRupiah(subTx.amount)}</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                        if (listEl) listEl.insertAdjacentHTML('beforeend', groupCardHtml);

                    } else {
                        const amountNum = Number(item.amount);
                        const isDebit = amountNum < 0 || item.type.includes('debit') || item.type.includes('withdrawal');

                        const icon = isDebit
                            ? '<div class="w-9 h-9 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0 font-bold"><i class="fas fa-arrow-up text-xs"></i></div>'
                            : '<div class="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0 font-bold"><i class="fas fa-arrow-down text-xs"></i></div>';

                        const amountText = (isDebit ? '-' : '+') + formatRupiah(amountNum);
                        const amountClass = isDebit ? 'text-red-600' : 'text-emerald-600';

                        if (listEl) {
                            listEl.insertAdjacentHTML('beforeend', `
                                <div class="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm flex gap-3 items-center">
                                    ${icon}
                                    <div class="flex-1 min-w-0">
                                        <div class="flex justify-between items-start mb-0.5">
                                            <h4 class="font-bold text-gray-800 text-xs truncate pr-2">${escapeHtml(item.description || item.type)}</h4>
                                            <span class="text-xs font-black font-mono ${amountClass} shrink-0">${amountText}</span>
                                        </div>
                                        <p class="text-[10px] text-gray-400 font-medium">${dateStr} ${timeStr}</p>
                                    </div>
                                </div>
                            `);
                        }
                    }
                });

                hasMoreMobile = result.pagination.hasMore;
                if (loadMoreContainer) {
                    loadMoreContainer.classList.toggle('hidden', !hasMoreMobile);
                }
            }
        }
    } catch (error) {
        console.error('Error loading mobile mutasi history:', error);
    }
}

// Pagination helper
function renderDesktopPagination(pagination, type) {
    const infoId = type === 'orders' ? 'paginationInfoDesktop' : 'paginationMutasiInfoDesktop';
    const pagesId = type === 'orders' ? 'paginationPagesDesktop' : 'paginationMutasiPagesDesktop';
    
    const infoEl = document.getElementById(infoId);
    const pagesEl = document.getElementById(pagesId);
    if (!infoEl || !pagesEl) return;

    const total = pagination.total;
    const from = total === 0 ? 0 : pagination.offset + 1;
    const to = Math.min(pagination.offset + limit, total);
    infoEl.textContent = `Showing ${from} to ${to} of ${total} entries`;

    pagesEl.innerHTML = '';
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return;

    const loadFn = type === 'orders' ? loadDesktopHistory : loadDesktopMutasi;

    const prevBtn = document.createElement('button');
    prevBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopPage > 1 ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    if (desktopPage > 1) prevBtn.onclick = () => loadFn(desktopPage - 1);
    pagesEl.appendChild(prevBtn);

    const startPage = Math.max(1, desktopPage - 2);
    const endPage = Math.min(totalPages, desktopPage + 2);
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${i === desktopPage ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-gray-50 text-gray-700'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadFn(i);
        pagesEl.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopPage < totalPages ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    if (desktopPage < totalPages) nextBtn.onclick = () => loadFn(desktopPage + 1);
    pagesEl.appendChild(nextBtn);
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    const loadMoreBtnMobile = document.getElementById('loadMoreBtnMobile');

    if (loadMoreBtnMobile) {
        loadMoreBtnMobile.addEventListener('click', () => {
            if (hasMoreMobile) {
                mobileOffset += limit;
                if (currentTab === 'orders') {
                    loadMobileHistory(true);
                } else {
                    loadMobileMutasi(true);
                }
            }
        });
    }

    loadDesktopHistory(1);
    loadMobileHistory(false);
});
