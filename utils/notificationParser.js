/**
 * Notification Parser Utility
 * Extracts incoming credit transaction details (amount, credit status, sender) 
 * from Android notification text (DANA, SeaBank, Mandiri, BCA, BRI, BNI, GoPay, OVO, ShopeePay, etc.)
 */

function parseNotification({ packageName, appName, title, text }) {
    if (!text || typeof text !== 'string') {
        return { isCredit: false, amount: null, senderName: null };
    }

    const fullText = `${title || ''} ${text}`.trim();
    const lowerText = fullText.toLowerCase();

    // 1. Check if this is explicitly a DEBIT / outgoing transaction (Ignore)
    const debitKeywords = [
        'didebit', 'telah ditransfer ke', 'transfer ke', 'pembayaran ke', 
        'berhasil dikirim ke', 'pengeluaran', 'pembelian', 'bayar ke'
    ];
    for (const keyword of debitKeywords) {
        if (lowerText.includes(keyword)) {
            return { isCredit: false, amount: null, senderName: null };
        }
    }

    // 2. Check if this is a CREDIT / incoming money transaction
    const creditKeywords = [
        'diterima', 'menerima', 'masuk', 'kredit', 'berhasil diterima',
        'transfer masuk', 'terima transfer', 'terima saldo', 'saldo masuk',
        'transfer dr', 'transfer dari'
    ];
    
    let isCredit = creditKeywords.some(kw => lowerText.includes(kw));

    // Special case for m-Transfer / m-BCA if title is m-Transfer and contains 'transfer dr' or 'berhasil'
    if (!isCredit && lowerText.includes('transfer dr')) {
        isCredit = true;
    }

    if (!isCredit) {
        return { isCredit: false, amount: null, senderName: null };
    }

    // 3. Extract amount
    // Matches patterns like: Rp10.000, Rp 10.000, Rp 1.000,00, Rp1.000,00, Rp 55.000.000, IDR 100.257
    // Group 1 catches the full number string including dots and commas
    const rupiahRegex = /(?:Rp\.?|IDR\.?)\s*([\d\.]+(?:,\d{1,2})?)/i;
    const match = fullText.match(rupiahRegex);

    let amount = null;
    let rawAmountStr = null;

    if (match && match[1]) {
        rawAmountStr = match[1];
        // If there's decimal like ",00", drop the decimal part
        let integerPart = rawAmountStr.split(',')[0];
        // Remove all dots (thousand separators)
        let cleanedDigits = integerPart.replace(/\./g, '').trim();
        let parsed = parseInt(cleanedDigits, 10);
        if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
        }
    }

    // 4. Try extracting Sender Name if available
    let senderName = null;
    // DANA format: "Rp10.000 telah diterima dari YULI YANTI 💰"
    const danaSenderMatch = fullText.match(/diterima dari ([^💰\n\.\,]+)/i);
    if (danaSenderMatch && danaSenderMatch[1]) {
        senderName = danaSenderMatch[1].trim();
    }
    // BCA / BRI format: "Transfer dr ROBERT Rp..." or "Transfer dari PUTRI sebesar IDR..."
    const bcaSenderMatch = fullText.match(/transfer\s+(?:dr|dari)\s+(.+?)(?:\s+sebesar|\s+(?:Rp\.?|IDR\.?)\b|\s+ke\b|\s+\d)/i);
    if (!senderName && bcaSenderMatch && bcaSenderMatch[1]) {
        senderName = bcaSenderMatch[1].trim();
    }

    return {
        isCredit: !!amount,
        amount,
        senderName,
        rawAmountStr
    };
}

module.exports = { parseNotification };
