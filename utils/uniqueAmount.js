// Generate unique amount for deposits
// Returns format: 100257 for 100K + 257 unique code
function generateUniqueAmount(baseAmount) {
    const roundedBase = Math.floor(baseAmount / 1000) * 1000;
    const uniqueDigits = Math.floor(Math.random() * 900) + 100; // 100-999
    return roundedBase + uniqueDigits; // Example: 100123 -> 100000 + 257 = 100257
}

module.exports = { generateUniqueAmount };
