const QRCode = require('qrcode');

/**
 * Calculate CRC16-CCITT checksum for QRIS/EMVCo QR codes.
 * Polynomial: 0x1021, Init: 0xFFFF
 */
function calculateCRC16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff;
            } else {
                crc = (crc << 1) & 0xffff;
            }
        }
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/** Map of known EMVCo / QRIS tag IDs to human-readable names */
const TAG_NAMES = {
    "00": "Payload Format Indicator",
    "01": "Point of Initiation Method",
    "52": "Merchant Category Code",
    "53": "Transaction Currency",
    "54": "Transaction Amount",
    "55": "Tip or Convenience Indicator",
    "56": "Value of Convenience Fee (Fixed)",
    "57": "Value of Convenience Fee (%)",
    "58": "Country Code",
    "59": "Merchant Name",
    "60": "Merchant City",
    "61": "Postal Code",
    "62": "Additional Data Field",
    "63": "CRC"
};

/** Tags that contain nested TLV sub-elements */
const NESTED_TAGS = new Set([
    ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
    "62"
]);

/**
 * Parse a raw TLV string into an array of TLV elements.
 */
function parseTLV(data) {
    const elements = [];
    let pos = 0;

    while (pos < data.length) {
        if (pos + 4 > data.length) break;

        const tag = data.substring(pos, pos + 2);
        const length = parseInt(data.substring(pos + 2, pos + 4), 10);

        if (isNaN(length) || pos + 4 + length > data.length) break;

        const value = data.substring(pos + 4, pos + 4 + length);
        const name = TAG_NAMES[tag] || `Unknown (${tag})`;

        const element = { tag, name, length, value };

        if (NESTED_TAGS.has(tag)) {
            element.children = parseTLV(value);
        }

        elements.push(element);
        pos += 4 + length;
    }

    return elements;
}

/**
 * Rebuild a QRIS string from TLV elements (without CRC).
 */
function buildTLVString(elements) {
    return elements
        .map((el) => {
            const value = el.children ? buildTLVString(el.children) : el.value;
            const length = value.length.toString().padStart(2, "0");
            return `${el.tag}${length}${value}`;
        })
        .join("");
}

/**
 * Create a TLV element.
 */
function makeTLV(tag, value, name = "") {
    return { tag, name, length: value.length, value };
}

/**
 * Convert a static QRIS string to dynamic by injecting amount.
 * Zero user fee - exact amount only.
 */
function convertQRIS(qrisString, options = {}) {
    if (!qrisString || typeof qrisString !== "string") {
        throw new Error("QRIS string tidak valid");
    }

    const str = qrisString.trim();
    if (!str.startsWith("000201")) {
        throw new Error("QRIS string harus diawali dengan 000201");
    }

    const elements = parseTLV(str);
    const result = [];
    let amountInserted = false;

    // Tags to skip (we will re-insert them)
    const managedTags = new Set(["54", "55", "56", "57", "63"]);

    for (const el of elements) {
        if (managedTags.has(el.tag)) continue;

        if (el.tag === "01") {
            // Change static (11) -> dynamic (12)
            result.push(makeTLV("01", "12", "Point of Initiation Method"));
            continue;
        }

        // Insert amount before tag 58 (Country Code)
        if (el.tag === "58" && !amountInserted) {
            const amountVal = Math.round(Number(options.amount || 0));
            if (amountVal <= 0) {
                throw new Error("Nominal transaksi QRIS harus lebih besar dari 0");
            }
            const amountStr = amountVal.toString();
            result.push(makeTLV("54", amountStr, "Transaction Amount"));
            amountInserted = true;
        }

        result.push(el);
    }

    // Build string without CRC, then calculate CRC16
    const withoutCRC = buildTLVString(result);
    const crcInput = withoutCRC + "6304";
    const crc = calculateCRC16(crcInput);

    return crcInput + crc;
}

/**
 * Render a high-resolution PNG DataURL for a QRIS payload string.
 */
async function generateQRCodeDataURL(qrisString) {
    try {
        return await QRCode.toDataURL(qrisString, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            margin: 2,
            width: 450,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
    } catch (err) {
        console.error('Failed to generate QR Code DataURL:', err);
        throw err;
    }
}

module.exports = {
    calculateCRC16,
    parseTLV,
    convertQRIS,
    generateQRCodeDataURL
};
