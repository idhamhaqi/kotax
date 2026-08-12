const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const depositController = require('../controllers/depositController');
const { verifyToken } = require('../middleware/auth');

// Ensure temp directory exists for uploads
const tempDir = path.join(__dirname, '../public/uploads/temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer for disk storage (avoids RAM exhaustion / OOM crashes)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
        }
        cb(null, true);
    }
});

// Get active payment methods for deposit selection
router.get('/methods', verifyToken, depositController.getActivePaymentMethods);

// Step 1: Initiate deposit (generate unique amount & save to DB)
router.post('/initiate', verifyToken, depositController.initiateDeposit);

// Step 2: Upload proof for existing deposit
router.post('/upload-proof', verifyToken, upload.single('proof'), depositController.uploadProof);

// LEGACY: Keep old confirm endpoint for backward compatibility
router.post('/confirm', verifyToken, upload.single('proof'), depositController.confirmDeposit);

// Get initiated deposits (belum upload bukti)
router.get('/initiated', verifyToken, depositController.getInitiatedDeposits);

// Cancel deposit
router.post('/cancel', verifyToken, depositController.cancelDeposit);

// Get deposit history
router.get('/history', verifyToken, depositController.getDepositHistory);

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Ukuran file terlalu besar. Maksimal 5MB'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'Error upload file'
        });
    }
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
    next();
});

module.exports = router;
