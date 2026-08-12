const db = require('../config/database');

function generateTicketCode() {
    return 'TCK-' + Math.floor(100000 + Math.random() * 900000);
}

// ----------------------------------------------------
// USER SUPPORT CONTROLLERS
// ----------------------------------------------------

async function getSupportPage(req, res) {
    try {
        res.render('support', { page: 'support' });
    } catch (error) {
        console.error('Get support page error:', error);
        res.status(500).send('Server Error');
    }
}

async function getUserTickets(req, res) {
    try {
        const userId = req.userId;
        const [tickets] = await db.query(
            `SELECT id, ticket_code, subject, category, status, priority, attachment_url, created_at, updated_at
             FROM support_tickets
             WHERE user_id = $1
             ORDER BY updated_at DESC`,
            [userId]
        );

        // Check if user has active ticket (open or answered)
        const activeTicket = tickets.find(t => t.status === 'open' || t.status === 'answered');

        res.json({
            success: true,
            tickets: tickets,
            hasActiveTicket: !!activeTicket,
            activeTicketCode: activeTicket ? activeTicket.ticket_code : null
        });
    } catch (error) {
        console.error('Get user tickets error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getTicketDetail(req, res) {
    try {
        const userId = req.userId;
        const ticketId = req.params.id;

        const [tickets] = await db.query(
            `SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2`,
            [ticketId, userId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        }

        const [messages] = await db.query(
            `SELECT m.*, u.full_name as user_name
             FROM support_ticket_messages m
             LEFT JOIN users u ON m.sender_id = u.id AND m.sender_type = 'user'
             WHERE m.ticket_id = $1
             ORDER BY m.created_at ASC`,
            [ticketId]
        );

        res.json({
            success: true,
            ticket: tickets[0],
            messages: messages
        });
    } catch (error) {
        console.error('Get ticket detail error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function createTicket(req, res) {
    try {
        const userId = req.userId;
        const { subject, category, priority, message } = req.body;
        const attachmentUrl = req.file ? '/uploads/tickets/' + req.file.filename : null;

        if (!subject || !message) {
            return res.json({ success: false, message: 'Judul subjek dan pesan kendala wajib diisi' });
        }

        // ANTI-SPAM RULE: Max 1 Active Ticket Rule (open or answered)
        const [activeTickets] = await db.query(
            `SELECT ticket_code FROM support_tickets WHERE user_id = $1 AND status IN ('open', 'answered') LIMIT 1`,
            [userId]
        );

        if (activeTickets.length > 0) {
            return res.json({
                success: false,
                message: `Anda masih memiliki 1 tiket aktif (${activeTickets[0].ticket_code}) yang sedang ditangani. Harap selesaikan tiket tersebut sebelum membuat tiket baru.`
            });
        }

        const ticketCode = generateTicketCode();
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [ticketRes] = await connection.query(
                `INSERT INTO support_tickets (ticket_code, user_id, subject, category, status, priority, attachment_url)
                 VALUES ($1, $2, $3, $4, 'open', $5, $6) RETURNING id`,
                [ticketCode, userId, subject.trim(), category || 'Umum', priority || 'normal', attachmentUrl]
            );

            const ticketId = ticketRes[0].id;

            await connection.query(
                `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message, attachment_url)
                 VALUES ($1, 'user', $2, $3, $4)`,
                [ticketId, userId, message.trim(), attachmentUrl]
            );

            await connection.commit();
            connection.release();

            // Emit Socket.IO notification to Admin Room
            const io = req.app.get('io');
            if (io) {
                const [userInfo] = await db.query('SELECT full_name FROM users WHERE id = $1', [userId]);
                io.to('admin').emit('admin-new-ticket', {
                    ticketId: ticketId,
                    ticketCode: ticketCode,
                    subject: subject,
                    userName: userInfo.length > 0 ? userInfo[0].full_name : 'User'
                });
            }

            res.json({
                success: true,
                message: `Tiket berhasil dibuat (${ticketCode}). Admin akan segera membalas keluhan Anda.`,
                ticketCode: ticketCode,
                ticketId: ticketId
            });
        } catch (dbErr) {
            await connection.rollback();
            connection.release();
            throw dbErr;
        }
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function replyTicketUser(req, res) {
    try {
        const userId = req.userId;
        const ticketId = req.params.id;
        const { message } = req.body;
        const attachmentUrl = req.file ? '/uploads/tickets/' + req.file.filename : null;

        if (!message || message.trim() === '') {
            return res.json({ success: false, message: 'Pesan balasan tidak boleh kosong' });
        }

        const [tickets] = await db.query(
            'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
            [ticketId, userId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        }

        const ticket = tickets[0];
        if (ticket.status === 'closed') {
            return res.json({ success: false, message: 'Tiket ini sudah ditutup (closed). Silakan buat tiket baru jika ada kendala lain.' });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message, attachment_url)
                 VALUES ($1, 'user', $2, $3, $4)`,
                [ticketId, userId, message.trim(), attachmentUrl]
            );

            // Re-open ticket status to 'open' when user replies
            await connection.query(
                `UPDATE support_tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [ticketId]
            );

            await connection.commit();
            connection.release();

            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('admin-ticket-updated', {
                    ticketId: ticketId,
                    ticketCode: ticket.ticket_code
                });
            }

            res.json({ success: true, message: 'Balasan berhasil dikirim' });
        } catch (dbErr) {
            await connection.rollback();
            connection.release();
            throw dbErr;
        }
    } catch (error) {
        console.error('Reply ticket user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function closeTicketUser(req, res) {
    try {
        const userId = req.userId;
        const ticketId = req.params.id;

        await db.query(
            `UPDATE support_tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
            [ticketId, userId]
        );

        res.json({ success: true, message: 'Tiket berhasil ditutup' });
    } catch (error) {
        console.error('Close ticket user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}


// ----------------------------------------------------
// ADMIN SUPPORT CONTROLLERS
// ----------------------------------------------------

async function getAdminTicketsPage(req, res) {
    try {
        res.render('admin/tickets', { title: 'Support Tiket', page: 'tickets' });
    } catch (error) {
        console.error('Get admin tickets page error:', error);
        res.status(500).send('Server Error');
    }
}

async function getAdminTickets(req, res) {
    try {
        const statusFilter = req.query.status || 'all';
        let query = `
            SELECT st.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone, u.whatsapp as user_whatsapp
            FROM support_tickets st
            JOIN users u ON st.user_id = u.id
        `;
        const params = [];

        if (statusFilter !== 'all') {
            query += ` WHERE st.status = $1`;
            params.push(statusFilter);
        }

        query += ` ORDER BY st.updated_at DESC`;

        const [tickets] = await db.query(query, params);

        // Get unhandled tickets count (open status)
        const [openCountResult] = await db.query(
            `SELECT COUNT(*)::INTEGER as count FROM support_tickets WHERE status = 'open'`
        );

        res.json({
            success: true,
            tickets: tickets,
            openCount: openCountResult[0].count
        });
    } catch (error) {
        console.error('Get admin tickets error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getAdminTicketDetail(req, res) {
    try {
        const ticketId = req.params.id;

        const [tickets] = await db.query(
            `SELECT st.*, u.full_name as user_name, u.email as user_email, u.whatsapp as user_whatsapp
             FROM support_tickets st
             JOIN users u ON st.user_id = u.id
             WHERE st.id = $1`,
            [ticketId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        }

        const [messages] = await db.query(
            `SELECT m.*, 
                    CASE WHEN m.sender_type = 'admin' THEN 'Administrator' ELSE u.full_name END as sender_name
             FROM support_ticket_messages m
             LEFT JOIN users u ON m.sender_id = u.id AND m.sender_type = 'user'
             WHERE m.ticket_id = $1
             ORDER BY m.created_at ASC`,
            [ticketId]
        );

        res.json({
            success: true,
            ticket: tickets[0],
            messages: messages
        });
    } catch (error) {
        console.error('Get admin ticket detail error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function replyTicketAdmin(req, res) {
    try {
        const adminId = req.adminId || 1;
        const ticketId = req.params.id;
        const { message, closeTicket } = req.body;
        const attachmentUrl = req.file ? '/uploads/tickets/' + req.file.filename : null;

        if (!message || message.trim() === '') {
            return res.json({ success: false, message: 'Pesan balasan tidak boleh kosong' });
        }

        const [tickets] = await db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
        if (tickets.length === 0) {
            return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        }

        const ticket = tickets[0];
        const newStatus = (closeTicket === true || closeTicket === 'true') ? 'closed' : 'answered';

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message, attachment_url)
                 VALUES ($1, 'admin', $2, $3, $4)`,
                [ticketId, adminId, message.trim(), attachmentUrl]
            );

            await connection.query(
                `UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [newStatus, ticketId]
            );

            await connection.commit();
            connection.release();

            // Emit Socket.IO event to User Room
            const io = req.app.get('io');
            if (io) {
                io.to('user-' + ticket.user_id).emit('user-ticket-reply', {
                    ticketId: ticketId,
                    ticketCode: ticket.ticket_code,
                    subject: ticket.subject,
                    newStatus: newStatus
                });
            }

            res.json({
                success: true,
                message: `Balasan berhasil dikirim. Status tiket: ${newStatus.toUpperCase()}`
            });
        } catch (dbErr) {
            await connection.rollback();
            connection.release();
            throw dbErr;
        }
    } catch (error) {
        console.error('Reply ticket admin error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function updateTicketStatusAdmin(req, res) {
    try {
        const ticketId = req.params.id;
        const { status } = req.body;

        if (!['open', 'answered', 'closed'].includes(status)) {
            return res.json({ success: false, message: 'Status tidak valid' });
        }

        await db.query(
            `UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [status, ticketId]
        );

        res.json({ success: true, message: `Status tiket diubah menjadi ${status.toUpperCase()}` });
    } catch (error) {
        console.error('Update ticket status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = {
    getSupportPage,
    getUserTickets,
    getTicketDetail,
    createTicket,
    replyTicketUser,
    closeTicketUser,
    getAdminTicketsPage,
    getAdminTickets,
    getAdminTicketDetail,
    replyTicketAdmin,
    updateTicketStatusAdmin
};
