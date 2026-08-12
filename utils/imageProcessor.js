const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Process and convert image to WebP format from buffer or file path
 * @param {Buffer|string} imageInput - Image buffer or temp file path
 * @param {string} filename - Original filename
 * @param {string} uploadPath - Path to save processed image
 * @returns {Promise<string>} - Filename of processed image
 */
async function processDepositProof(imageInput, filename, uploadPath) {
    try {
        // Ensure upload directory exists
        await fs.mkdir(uploadPath, { recursive: true }).catch(() => {});

        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const uniqueFilename = `deposit_${timestamp}.webp`;
        const outputPath = path.join(uploadPath, uniqueFilename);

        // Process image: resize and convert to WebP with quality 80
        await sharp(imageInput)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Cleanup temporary file if imageInput was a file path string
        if (typeof imageInput === 'string') {
            await fs.unlink(imageInput).catch(() => {});
        }

        return uniqueFilename;
    } catch (error) {
        if (typeof imageInput === 'string') {
            await fs.unlink(imageInput).catch(() => {});
        }
        console.error('Error processing image:', error);
        throw new Error('Gagal memproses gambar', { cause: error });
    }
}

/**
 * Process payment method image (logo or QR code)
 */
async function processPaymentImage(imageInput, prefix, uploadPath) {
    try {
        await fs.mkdir(uploadPath, { recursive: true }).catch(() => {});
        const timestamp = Date.now();
        const uniqueFilename = `${prefix}_${timestamp}.webp`;
        const outputPath = path.join(uploadPath, uniqueFilename);

        await sharp(imageInput)
            .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 85 })
            .toFile(outputPath);

        if (typeof imageInput === 'string') {
            await fs.unlink(imageInput).catch(() => {});
        }

        return uniqueFilename;
    } catch (error) {
        if (typeof imageInput === 'string') {
            await fs.unlink(imageInput).catch(() => {});
        }
        console.error('Error processing payment image:', error);
        throw new Error('Gagal memproses gambar metode pembayaran', { cause: error });
    }
}

/**
 * Delete deposit proof image
 * @param {string} filename - Filename to delete
 * @param {string} uploadPath - Path where image is stored
 */
async function deleteDepositProof(filename, uploadPath) {
    try {
        if (!filename) return;

        const filePath = path.join(uploadPath, filename);
        await fs.unlink(filePath);
        console.log(`Deleted file: ${filename}`);
    } catch (error) {
        // Don't throw error if file doesn't exist
        console.error('Error deleting file:', error.message);
    }
}

/**
 * Delete file by public relative URL (e.g. /uploads/payment-methods/logo_123.webp)
 */
async function deleteFileByUrl(url) {
    try {
        if (!url || typeof url !== 'string') return;
        // Strip leading slash
        const relativePath = url.startsWith('/') ? url.substring(1) : url;
        const fullPath = path.join(__dirname, '../public', relativePath);
        await fs.unlink(fullPath).catch(() => {});
        console.log(`Deleted file by URL: ${url}`);
    } catch (err) {
        console.error('Error deleting file by URL:', err.message);
    }
}

module.exports = {
    processDepositProof,
    deleteDepositProof,
    processPaymentImage,
    deleteFileByUrl
};
