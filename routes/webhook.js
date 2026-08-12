const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook receiver endpoint from Android Notif Bridge
router.post('/deposit', webhookController.handleIncomingNotification);

// Alias / for backward compatibility or direct URL setup
router.post('/', webhookController.handleIncomingNotification);

module.exports = router;
