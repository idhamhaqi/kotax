const db = require('../config/database');
const { parseNotification } = require('../utils/notificationParser');
const { sendDepositEmail } = require('../services/emailService');

async function handleIncomingNotification(req, res) {
    // 1. Optional Security Token Check
    const webhookSecret = process.env.WEBHOOK_SECRET_TOKEN;
    if (webhookSecret) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== webhookSecret) {
            console.warn('[Webhook] Unauthorized webhook request received from IP:', req.ip);
            return res.status(401).json({ success: false, message: 'Unauthorized webhook token' });
        }
    }

    // Extract fields flexibly from Android Notification JSON payload
    const body = req.body || {};
    const text = body.text || body.message || body.content || body.body || body.notif_text || body.notification || body.ticker || '';
    const title = body.title || body.subject || body.header || '';
    const packageName = body.packageName || body.package || body.package_name || '';
    const appName = body.appName || body.app || packageName || 'Android App';
    const deviceIdentifier = body.deviceIdentifier || body.device_id || body.deviceId || body.device || 'unknown';
    const rawTs = body.timestamp || body.time || body.date;
    const notifTimestamp = rawTs ? parseInt(rawTs, 10) : Date.now();

    // Log to Webhook Monitor (webhook_logs) in real-time
    const { logWebhookEvent } = require('./adminController');
    const io = req.app.get('io');
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    logWebhookEvent({
        provider: appName,
        event_type: 'android_notification',
        status: text ? 'success' : 'invalid_payload',
        http_code: text ? 200 : 400,
        payload: body,
        ip_address: String(ip),
        response_body: text ? 'Notification received & logged' : 'Missing notification text',
        io
    }).catch(err => console.error('[Webhook Log Error]', err));

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid or missing notification text' });
    }

    const devId = deviceIdentifier;
    const app = appName;

    try {
        // 2. Deduplication check & raw log insertion
        const [existing] = await db.query(
            `SELECT id FROM bank_notifications 
             WHERE notification_timestamp = $1 AND device_identifier = $2 AND text = $3 LIMIT 1`,
            [notifTimestamp, devId, text]
        );

        if (existing.length > 0) {
            console.log('[Webhook] Duplicate notification received. Ignoring.');
            return res.json({ success: true, message: 'Duplicate notification ignored' });
        }

        // Parse notification text for amount and credit indicator
        const parsed = parseNotification({ packageName, appName: app, title, text });

        // Save notification log to database
        const [insertResult] = await db.query(
            `INSERT INTO bank_notifications 
             (package_name, app_name, title, text, amount, device_identifier, notification_timestamp, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
                packageName || null,
                app,
                title || null,
                text,
                parsed.amount || null,
                devId,
                notifTimestamp,
                parsed.isCredit ? 'processing' : 'ignored'
            ]
        );

        const notifLogId = insertResult[0].id;

        if (!parsed.isCredit || !parsed.amount) {
            console.log(`[Webhook] Ignored non-credit notification from ${app}`);
            return res.json({
                success: true,
                message: 'Notification logged (non-credit or amount unparsed)'
            });
        }

        const targetAmount = parsed.amount;
        console.log(`[Webhook] Processing parsed credit amount: Rp ${targetAmount.toLocaleString('id-ID')} from ${app}`);

        // 3. Atomic Deposit Matching & Approval Transaction
        const connection = await db.getConnection();
        let isApproved = false;
        let depositId = null;
        let userId = null;
        let creditAmount = 0;
        let matchedUser = null;

        try {
            await connection.beginTransaction();

            // Find deposit matching unique_amount with status 'initiated' or 'pending'
            const [deposits] = await connection.query(
                `SELECT id, user_id, amount, unique_amount, status 
                 FROM deposits 
                 WHERE unique_amount = $1 AND status IN ('initiated', 'pending')
                 ORDER BY created_at ASC
                 LIMIT 1
                 FOR UPDATE`,
                [targetAmount]
            );

            if (deposits.length === 0) {
                await connection.query(
                    'UPDATE bank_notifications SET status = $1 WHERE id = $2',
                    ['unmatched', notifLogId]
                );
                await connection.commit();

                console.log(`[Webhook] No active deposit found for unique amount Rp ${targetAmount.toLocaleString('id-ID')}`);
                return res.json({
                    success: true,
                    message: 'Notification logged, but no matching pending deposit found',
                    parsedAmount: targetAmount
                });
            }

            const deposit = deposits[0];
            depositId = deposit.id;
            userId = deposit.user_id;
            creditAmount = Number(deposit.unique_amount);

            // Lock user row
            const [users] = await connection.query(
                'SELECT id, full_name, email FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );

            matchedUser = users[0];

            // Update deposit status to 'approved'
            await connection.query(
                `UPDATE deposits 
                 SET status = $1, admin_note = $2, updated_at = NOW() 
                 WHERE id = $3`,
                ['approved', `Auto-Approved via Webhook (${app})`, depositId]
            );

            // Add full unique amount to user balance
            await connection.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [creditAmount, userId]
            );

            // Insert transaction record
            await connection.query(
                `INSERT INTO transactions (user_id, type, amount, description)
                 VALUES ($1, $2, $3, $4)`,
                [userId, 'deposit', creditAmount, `Deposit otomatis via Webhook (${app})`]
            );

            // Update notification log record
            await connection.query(
                'UPDATE bank_notifications SET status = $1, deposit_id = $2 WHERE id = $3',
                ['matched', depositId, notifLogId]
            );

            await connection.commit();
            isApproved = true;

        } catch (trxError) {
            await connection.rollback();
            throw trxError;
        } finally {
            connection.release();
        }

        if (isApproved) {
            console.log(`✅ [Webhook Auto-Approve] Deposit #${depositId} for User #${userId} approved automatically! Credited: Rp ${creditAmount.toLocaleString('id-ID')}`);

            // 4. Send Email Notification (Safe catch to prevent email error breaking webhook)
            if (matchedUser && matchedUser.email) {
                try {
                    sendDepositEmail(matchedUser.email, matchedUser.full_name, creditAmount, 'approved');
                } catch (emailErr) {
                    console.error('[Webhook Email Notification Error]', emailErr);
                }
            }

            // 5. Socket.IO Real-time Broadcast
            const io = req.app.get('io');
            if (io) {
                io.to('user-' + userId).emit('deposit-approved', {
                    depositId,
                    amount: creditAmount,
                    message: `Deposit Anda sebesar Rp ${creditAmount.toLocaleString('id-ID')} telah diverifikasi otomatis!`
                });
                io.to('user-' + userId).emit('balance-updated');
                io.to('admin').emit('deposit-updated', { id: depositId, status: 'approved' });
                io.to('admin').emit('stats-updated');
            }

            return res.json({
                success: true,
                message: 'Deposit verified and auto-approved successfully',
                depositId,
                creditedAmount: creditAmount
            });
        }

    } catch (error) {
        console.error('[Webhook Handler Error]', error);
        return res.status(500).json({ success: false, message: 'Internal server error processing webhook' });
    }
}

module.exports = { handleIncomingNotification };
