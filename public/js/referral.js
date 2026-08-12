// Format currency
function formatRupiah(amount) {
    return 'Rp ' + parseInt(amount).toLocaleString('id-ID');
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

// Format date and time
function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format date only
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

let currentTab = 'referrals';
const limit = 20;

let desktopReferralsPage = 1;
let mobileReferralsOffset = 0;
let hasMoreReferralsMobile = true;

let desktopBonusesPage = 1;
let mobileBonusesOffset = 0;
let hasMoreBonusesMobile = true;

// Switch tab
function switchTabDesktop(tab) {
    currentTab = tab;

    // Update tab buttons
    const tabRef = document.getElementById('tabReferrals');
    if (tabRef) {
        tabRef.className = tab === 'referrals'
            ? 'tab-btn flex-1 px-2 lg:px-4 py-3 text-sm lg:text-base font-semibold transition border-b-2 border-emerald-600 text-emerald-600'
            : 'tab-btn flex-1 px-2 lg:px-4 py-3 text-sm lg:text-base font-semibold transition border-b-2 border-transparent text-gray-600 hover:text-gray-800';
    }

    const tabBon = document.getElementById('tabBonuses');
    if (tabBon) {
        tabBon.className = tab === 'bonuses'
            ? 'tab-btn flex-1 px-2 lg:px-4 py-3 text-sm lg:text-base font-semibold transition border-b-2 border-emerald-600 text-emerald-600'
            : 'tab-btn flex-1 px-2 lg:px-4 py-3 text-sm lg:text-base font-semibold transition border-b-2 border-transparent text-gray-600 hover:text-gray-800';
    }

    // Update content
    const contentRef = document.getElementById('contentReferralsDesktop');
    if (contentRef) contentRef.classList.toggle('hidden', tab !== 'referrals');
    
    const contentBon = document.getElementById('contentBonusesDesktop');
    if (contentBon) contentBon.classList.toggle('hidden', tab !== 'bonuses');

    // Load data if not loaded yet
    if (tab === 'referrals' && desktopReferralsPage === 1) {
        loadDesktopReferrals(1);
    } else if (tab === 'bonuses' && desktopBonusesPage === 1) {
        loadDesktopBonuses(1);
    }
}

function switchTabMobile(tab) {
    currentTab = tab;

    // Update tab buttons
    const tabRef = document.getElementById('tabReferralsMobile');
    if (tabRef) {
        tabRef.className = tab === 'referrals'
            ? 'flex-1 py-2 text-xs font-bold rounded-lg transition text-emerald-600 bg-emerald-50'
            : 'flex-1 py-2 text-xs font-bold rounded-lg transition text-gray-500 hover:bg-gray-50';
    }

    const tabBon = document.getElementById('tabBonusesMobile');
    if (tabBon) {
        tabBon.className = tab === 'bonuses'
            ? 'flex-1 py-2 text-xs font-bold rounded-lg transition text-emerald-600 bg-emerald-50'
            : 'flex-1 py-2 text-xs font-bold rounded-lg transition text-gray-500 hover:bg-gray-50';
    }

    // Update content
    const contentRef = document.getElementById('contentReferralsMobile');
    if (contentRef) contentRef.classList.toggle('hidden', tab !== 'referrals');
    
    const contentBon = document.getElementById('contentBonusesMobile');
    if (contentBon) contentBon.classList.toggle('hidden', tab !== 'bonuses');

    // Load data if not loaded yet
    if (tab === 'referrals' && mobileReferralsOffset === 0) {
        loadMobileReferrals(false);
    } else if (tab === 'bonuses' && mobileBonusesOffset === 0) {
        loadMobileBonuses(false);
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch('/api/referral/data');
        const result = await response.json();

        if (result.success) {
            const { stats, referralCode } = result;
            const fullLink = window.location.origin + '/register?ref=' + referralCode;

            // Update stats
            const totalRef = stats.directReferrals;
            setText('totalBonusDesktop', formatRupiah(stats.totalBonusEarned));
            setText('fillOrderBonusDesktop', formatRupiah(stats.fillOrderBonus));
            setText('totalReferralsDesktop', totalRef);
            
            setText('totalBonusMobile', formatRupiah(stats.totalBonusEarned));
            setText('fillOrderBonusMobile', formatRupiah(stats.fillOrderBonus));
            setText('totalReferralsMobile', totalRef);

            // Update referral link
            const linkDesktop = document.getElementById('referralLinkDesktop');
            if (linkDesktop) linkDesktop.value = fullLink;
            
            const linkMobile = document.getElementById('referralLinkMobile');
            if (linkMobile) linkMobile.value = fullLink;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Copy referral link
function copyReferral(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(input.value).then(() => {
                showToast('Link referral berhasil dicopy!', 'success');
            }).catch(() => {
                input.select();
                document.execCommand('copy');
                showToast('Link referral berhasil dicopy!', 'success');
            });
        } else {
            input.select();
            document.execCommand('copy');
            showToast('Link referral berhasil dicopy!', 'success');
        }
    }
}

// Load Desktop Referrals (Page-by-page)
async function loadDesktopReferrals(page = 1) {
    desktopReferralsPage = page;
    const offset = (page - 1) * limit;
    try {
        const response = await fetch(`/api/referral/list?limit=${limit}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            const tableBody = document.getElementById('referralsTableDesktop');
            const emptyState = document.getElementById('emptyReferralsDesktop');
            const paginationContainer = document.getElementById('paginationContainerReferralsDesktop');

            if (tableBody) tableBody.innerHTML = '';

            if (result.referrals.length === 0 && page === 1) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (paginationContainer) paginationContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');
                if (paginationContainer) paginationContainer.classList.remove('hidden');

                result.referrals.forEach(ref => {
                    const dateStr = formatDate(ref.created_at);
                    const bonusFormatted = formatRupiah(ref.total_bonus_from_this_user);
                    
                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-gray-50 transition';
                    row.innerHTML = `
                        <td class="py-3 px-2 text-sm font-semibold text-gray-700">${escapeHtml(ref.full_name)}</td>
                        <td class="py-3 px-2 text-sm text-gray-600">${escapeHtml(ref.email)}</td>
                        <td class="py-3 px-2 text-sm text-gray-600">${dateStr}</td>
                        <td class="py-3 px-2 text-sm font-bold text-green-600">${bonusFormatted}</td>
                    `;
                    if (tableBody) tableBody.appendChild(row);
                });

                renderDesktopReferralsPagination(result.pagination);
            }
        }
    } catch (error) {
        console.error('Error loading desktop referrals:', error);
    }
}

// Render Desktop Referrals Pagination Buttons
function renderDesktopReferralsPagination(pagination) {
    const infoEl = document.getElementById('paginationInfoReferralsDesktop');
    const pagesEl = document.getElementById('paginationPagesReferralsDesktop');
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
    prevBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopReferralsPage > 1 ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    if (desktopReferralsPage > 1) {
        prevBtn.onclick = () => loadDesktopReferrals(desktopReferralsPage - 1);
    }
    pagesEl.appendChild(prevBtn);

    // Page Numbers
    const startPage = Math.max(1, desktopReferralsPage - 2);
    const endPage = Math.min(totalPages, desktopReferralsPage + 2);
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${i === desktopReferralsPage ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-gray-50 text-gray-700'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadDesktopReferrals(i);
        pagesEl.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopReferralsPage < totalPages ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    if (desktopReferralsPage < totalPages) {
        nextBtn.onclick = () => loadDesktopReferrals(desktopReferralsPage + 1);
    }
    pagesEl.appendChild(nextBtn);
}

// Load Mobile Referrals (Infinite Scroll/Append)
async function loadMobileReferrals(append = false) {
    if (!append) {
        mobileReferralsOffset = 0;
    }
    try {
        const response = await fetch(`/api/referral/list?limit=${limit}&offset=${mobileReferralsOffset}`);
        const result = await response.json();

        if (result.success) {
            const listEl = document.getElementById('referralsListMobile');
            const emptyState = document.getElementById('emptyReferralsMobile');
            const loadMoreContainer = document.getElementById('loadMoreReferralsMobile');

            if (!append && listEl) {
                listEl.innerHTML = '';
            }

            if (result.referrals.length === 0 && mobileReferralsOffset === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');

                result.referrals.forEach(ref => {
                    const dateStr = formatDate(ref.created_at);
                    const bonusFormatted = formatRupiah(ref.total_bonus_from_this_user);

                    const nameParts = escapeHtml(ref.full_name).split(' ');
                    const initials = nameParts.length > 1 
                        ? (nameParts[0][0] + nameParts[1][0]).toUpperCase() 
                        : nameParts[0].substring(0, 2).toUpperCase();

                    if (listEl) {
                        listEl.insertAdjacentHTML('beforeend', `
                            <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex gap-3 items-center">
                                <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                                    ${initials}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-bold text-gray-800 text-sm truncate">${escapeHtml(ref.full_name)}</h4>
                                    <p class="text-xs text-gray-500 truncate mb-1">${escapeHtml(ref.email)}</p>
                                    <p class="text-[10px] text-gray-400 font-medium">Gabung: ${dateStr}</p>
                                </div>
                                <div class="text-right shrink-0">
                                    <p class="text-[10px] text-gray-500 font-medium mb-0.5">Bonus</p>
                                    <p class="text-sm font-bold text-green-600">${bonusFormatted}</p>
                                </div>
                            </div>
                        `);
                    }
                });

                hasMoreReferralsMobile = result.pagination.hasMore;
                if (loadMoreContainer) {
                    if (hasMoreReferralsMobile) {
                        loadMoreContainer.classList.remove('hidden');
                    } else {
                        loadMoreContainer.classList.add('hidden');
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading mobile referrals:', error);
    }
}

// Trigger load more referrals on mobile
function loadMoreReferrals() {
    if (hasMoreReferralsMobile) {
        mobileReferralsOffset += limit;
        loadMobileReferrals(true);
    }
}

// Load Desktop Bonuses (Page-by-page)
async function loadDesktopBonuses(page = 1) {
    desktopBonusesPage = page;
    const offset = (page - 1) * limit;
    try {
        const response = await fetch(`/api/referral/bonuses?limit=${limit}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            const tableBody = document.getElementById('bonusesTableDesktop');
            const emptyState = document.getElementById('emptyBonusesDesktop');
            const paginationContainer = document.getElementById('paginationContainerBonusesDesktop');

            if (tableBody) tableBody.innerHTML = '';

            if (result.history.length === 0 && page === 1) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (paginationContainer) paginationContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');
                if (paginationContainer) paginationContainer.classList.remove('hidden');

                result.history.forEach(bonus => {
                    const isConversion = bonus.bonus_type === 'conversion';
                    const typeIcon = isConversion
                        ? '<i class="fas fa-shopping-cart text-green-600 mr-1"></i>'
                        : '<i class="fas fa-handshake text-blue-600 mr-1"></i>';
                        
                    const typeName = isConversion ? 'Konversi' : 'Fill Order';
                    const levelClass = bonus.level === 1 ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';

                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-gray-50 transition';
                    row.innerHTML = `
                        <td class="py-3 px-2 text-sm text-gray-600">${formatDateTime(bonus.created_at)}</td>
                        <td class="py-3 px-2 text-sm font-semibold text-gray-700">${escapeHtml(bonus.from_user_name)}</td>
                        <td class="py-3 px-2 text-sm">
                            <div class="flex items-center">
                                ${typeIcon}
                                <span class="text-gray-700">${typeName}</span>
                            </div>
                        </td>
                        <td class="py-3 px-2 text-sm font-bold text-green-600">${formatRupiah(bonus.amount)}</td>
                        <td class="py-3 px-2 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${levelClass}">
                                Level ${bonus.level} (${bonus.percentage}%)
                            </span>
                        </td>
                    `;
                    if (tableBody) tableBody.appendChild(row);
                });

                renderDesktopBonusesPagination(result.pagination);
            }
        }
    } catch (error) {
        console.error('Error loading desktop bonuses:', error);
    }
}

// Render Desktop Bonuses Pagination Buttons
function renderDesktopBonusesPagination(pagination) {
    const infoEl = document.getElementById('paginationInfoBonusesDesktop');
    const pagesEl = document.getElementById('paginationPagesBonusesDesktop');
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
    prevBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopBonusesPage > 1 ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    if (desktopBonusesPage > 1) {
        prevBtn.onclick = () => loadDesktopBonuses(desktopBonusesPage - 1);
    }
    pagesEl.appendChild(prevBtn);

    // Page Numbers
    const startPage = Math.max(1, desktopBonusesPage - 2);
    const endPage = Math.min(totalPages, desktopBonusesPage + 2);
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${i === desktopBonusesPage ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-gray-50 text-gray-700'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadDesktopBonuses(i);
        pagesEl.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold border ${desktopBonusesPage < totalPages ? 'bg-white hover:bg-gray-50 text-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    if (desktopBonusesPage < totalPages) {
        nextBtn.onclick = () => loadDesktopBonuses(desktopBonusesPage + 1);
    }
    pagesEl.appendChild(nextBtn);
}

// Load Mobile Bonuses (Infinite Scroll/Append)
async function loadMobileBonuses(append = false) {
    if (!append) {
        mobileBonusesOffset = 0;
    }
    try {
        const response = await fetch(`/api/referral/bonuses?limit=${limit}&offset=${mobileBonusesOffset}`);
        const result = await response.json();

        if (result.success) {
            const listEl = document.getElementById('bonusesListMobile');
            const emptyState = document.getElementById('emptyBonusesMobile');
            const loadMoreContainer = document.getElementById('loadMoreBonusesMobile');

            if (!append && listEl) {
                listEl.innerHTML = '';
            }

            if (result.history.length === 0 && mobileBonusesOffset === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.add('hidden');

                result.history.forEach(bonus => {
                    const dateObj = new Date(bonus.created_at);
                    const dateStr = dateObj.toLocaleDateString('id-ID');
                    const timeStr = dateObj.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'});
                    
                    const isConversion = bonus.bonus_type === 'conversion';
                    const typeIcon = isConversion
                        ? '<div class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0"><i class="fas fa-shopping-cart text-sm"></i></div>'
                        : '<div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i class="fas fa-handshake text-sm"></i></div>';

                    const typeName = isConversion ? 'Konversi' : 'Fill Order';
                    const levelClass = bonus.level === 1 ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-purple-600 bg-purple-50 border-purple-200';

                    if (listEl) {
                        listEl.insertAdjacentHTML('beforeend', `
                            <div class="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex gap-3 items-center">
                                ${typeIcon}
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-start mb-1">
                                        <h4 class="font-bold text-gray-800 text-sm truncate pr-2">${escapeHtml(bonus.from_user_name)}</h4>
                                        <span class="text-[10px] font-bold ${levelClass} px-2 py-0.5 rounded-full shrink-0 border">Lvl ${bonus.level} (${bonus.percentage}%)</span>
                                    </div>
                                    <p class="text-xs text-gray-500 truncate mb-1">Bonus ${typeName}</p>
                                    <div class="flex justify-between items-end">
                                        <p class="text-[10px] text-gray-400 font-medium">${dateStr} ${timeStr}</p>
                                        <p class="text-sm font-bold text-green-600">+${formatRupiah(bonus.amount)}</p>
                                    </div>
                                </div>
                            </div>
                        `);
                    }
                });

                hasMoreBonusesMobile = result.pagination.hasMore;
                if (loadMoreContainer) {
                    if (hasMoreBonusesMobile) {
                        loadMoreContainer.classList.remove('hidden');
                    } else {
                        loadMoreContainer.classList.add('hidden');
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading mobile bonuses:', error);
    }
}

// Trigger load more bonuses on mobile
function loadMoreBonuses() {
    if (hasMoreBonusesMobile) {
        mobileBonusesOffset += limit;
        loadMobileBonuses(true);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadDesktopReferrals(1);
    loadMobileReferrals(false);
});
