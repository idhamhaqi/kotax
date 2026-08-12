/**
 * PPOB Wholesale Product Catalog - Client-side Logic
 */

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

let selectedProvider = 'Semua';
let currentDailyRoiDecimal = 0.01; // Default 1% (30% monthly ROI)

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatRupiah(num) {
    return 'Rp ' + parseInt(num || 0).toLocaleString('id-ID');
}

document.addEventListener('DOMContentLoaded', function() {
    fetchUserBalance();
    renderTabs();
    renderCatalog();
});

async function fetchUserBalance() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const data = await response.json();

        if (data.success && data.stats) {
            const balanceText = formatRupiah(data.stats.balance);
            setText('userBalanceDesktop', balanceText);
            setText('userBalanceMobile', balanceText);

            if (data.stats.targetMonthlyRoi) {
                currentDailyRoiDecimal = (data.stats.targetMonthlyRoi / 30) / 100;
                renderCatalog();
            }
        }
    } catch (error) {
        console.error('Error fetching balance:', error);
    }
}

function renderTabs() {
    const providers = ['Semua', 'Telkomsel', 'Indosat', 'XL', 'Axis', 'Tri', 'Smartfren', 'By.U'];
    
    ['providerTabsMobile', 'providerTabsDesktop'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = providers.map(p => {
            const isActive = p === selectedProvider;
            const activeClass = isActive 
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200';
            
            return `
                <button type="button" onclick="selectProvider('${p}')" class="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${activeClass}">
                    ${p}
                </button>
            `;
        }).join('');
    });
}

function selectProvider(prov) {
    selectedProvider = prov;
    renderTabs();
    renderCatalog();
}

function renderCatalog() {
    let items = [];
    if (selectedProvider === 'Semua') {
        Object.keys(REAL_PACKAGES).forEach(prov => {
            REAL_PACKAGES[prov].forEach(pkg => {
                items.push({ ...pkg, provider: prov });
            });
        });
    } else {
        const list = REAL_PACKAGES[selectedProvider] || [];
        items = list.map(pkg => ({ ...pkg, provider: selectedProvider }));
    }

    const html = items.map(item => {
        const estProfit = Math.floor(item.basePrice * currentDailyRoiDecimal);
        const sellPrice = item.basePrice + estProfit;

        return `
            <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md transition relative">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${item.provider}</span>
                    <span class="text-xs font-extrabold text-blue-600">${item.quota}GB</span>
                </div>
                <h4 class="font-bold text-gray-900 text-sm leading-snug mb-3">${item.name}</h4>
                
                <div class="pt-3 border-t border-gray-100 flex justify-between items-end">
                    <div>
                        <p class="text-[10px] text-gray-400">Harga Modal Grosir</p>
                        <p class="font-extrabold text-gray-900 text-base font-mono">${formatRupiah(item.basePrice)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-400">Harga Jual: ${formatRupiah(sellPrice)}</p>
                        <p class="text-xs font-bold text-emerald-600">Profit: +${formatRupiah(estProfit)}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    ['productGridMobile', 'productGridDesktop'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = html;
    });
}
