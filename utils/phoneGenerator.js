// Indonesian phone number generator by provider (Official 2026 Prefixes)
const providerPrefixes = {
    'Telkomsel': ['0811', '0812', '0813', '0821', '0822', '0823', '0851', '0852', '0853'],
    'Indosat': ['0814', '0815', '0816', '0855', '0856', '0857', '0858'],
    'XL': ['0817', '0818', '0819', '0859', '0877', '0878', '0879'],
    'Axis': ['0831', '0832', '0833', '0838'],
    'Tri': ['0895', '0896', '0897', '0898', '0899'],
    'Smartfren': ['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889'],
    'By.U': ['0851']
};

function generateIndonesianPhone(provider) {
    const prefixes = providerPrefixes[provider] || providerPrefixes['Telkomsel'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    // Standard Indonesian mobile numbers are 11-12 digits long
    const remainingCount = Math.random() < 0.5 ? 7 : 8;
    
    let suffix = '';
    for (let i = 0; i < remainingCount; i++) {
        suffix += Math.floor(Math.random() * 10);
    }

    const fullNumber = prefix + suffix;
    
    // Censor middle part cleanly: e.g. 0812345****89
    const head = fullNumber.substring(0, 7);
    const tail = fullNumber.substring(fullNumber.length - 2);
    return `${head}****${tail}`;
}

module.exports = { generateIndonesianPhone, providerPrefixes };
