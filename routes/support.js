const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { verifyToken } = require('../middleware/auth');
const uploadSupport = require('../middleware/uploadSupport');

router.get('/', verifyToken, supportController.getUserTickets);
router.get('/:id', verifyToken, supportController.getTicketDetail);
router.post('/create', verifyToken, uploadSupport.single('attachment'), supportController.createTicket);
router.post('/:id/reply', verifyToken, uploadSupport.single('attachment'), supportController.replyTicketUser);
router.post('/:id/close', verifyToken, supportController.closeTicketUser);

module.exports = router;
