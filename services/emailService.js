const db = require('../config/database');

const DEFAULT_LOGO_URL = 'https://img.mailinblue.com/11838366/images/content_library/original/6a7adc9224e51a588957dcd8.png';

/**
 * Get active email logo URL from settings or default fallback
 */
async function getEmailLogoUrl() {
    try {
        const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'email_logo_url'");
        if (rows.length > 0 && rows[0].setting_value && rows[0].setting_value.trim()) {
            return rows[0].setting_value.trim();
        }
    } catch (e) {
        console.error('Error fetching email_logo_url:', e);
    }
    return DEFAULT_LOGO_URL;
}

/**
 * Send email using Brevo (Sendinblue) API via native fetch
 */
async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@kuotax.web.id';
    const senderName = process.env.BREVO_SENDER_NAME || 'Kuotax';

    if (!apiKey) {
        console.warn('⚠️ BREVO_API_KEY is not set. Email not sent to:', toEmail);
        return false;
    }

    try {
        const payload = {
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail, name: toName || 'Pengguna Kuotax' }],
            subject: subject,
            htmlContent: htmlContent
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Brevo API Error:', error);
            return false;
        }

        console.log(`✅ Email sent to ${toEmail} | Subject: ${subject}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send email via Brevo:', error);
        return false;
    }
}

/**
 * Unified Email HTML Wrapper
 */
function buildEmailWrapper({ logoUrl, title, badge, contentHtml, footerNote }) {
    const activeLogo = logoUrl || DEFAULT_LOGO_URL;
    const year = new Date().getFullYear();

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title || 'Kuotax Notification'}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#1f2937;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8; padding:30px 15px;">
            <tr>
                <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #e5e7eb;">
                        
                        <!-- Header Bar with Logo -->
                        <tr>
                            <td align="center" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding:28px 20px; text-align:center;">
                                <img src="${activeLogo}" alt="Kuotax Logo" width="180" height="40" style="max-height:48px; max-width:200px; width:180px; height:auto; border:0; outline:none; display:inline-block; margin-bottom:6px;">
                                <div style="color:#d1fae5; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Marketplace Kuota Internet Indonesia</div>
                            </td>
                        </tr>

                        <!-- Sub Header / Badge -->
                        ${title ? `
                        <tr>
                            <td style="padding:24px 30px 5px 30px; text-align:center;">
                                <h2 style="margin:0; font-size:20px; font-weight:800; color:#111827; letter-spacing:-0.3px;">${title}</h2>
                                ${badge ? `<span style="display:inline-block; margin-top:8px; padding:5px 16px; font-size:12px; font-weight:800; border-radius:20px; ${badge.style}">${badge.text}</span>` : ''}
                            </td>
                        </tr>
                        ` : ''}

                        <!-- Body Content -->
                        <tr>
                            <td style="padding:20px 30px 30px 30px; font-size:14px; line-height:1.6; color:#374151;">
                                ${contentHtml}
                            </td>
                        </tr>

                        <!-- Footer Note (Optional) -->
                        ${footerNote ? `
                        <tr>
                            <td style="padding:0 30px 24px 30px;">
                                <div style="background-color:#fffbe6; border:1px solid #ffe58f; padding:12px 16px; border-radius:10px; font-size:12px; color:#855900; line-height:1.5;">
                                    ${footerNote}
                                </div>
                            </td>
                        </tr>
                        ` : ''}

                        <!-- Footer Links & Copyright -->
                        <tr>
                            <td align="center" style="background-color:#f9fafb; padding:20px 30px; border-top:1px solid #f3f4f6; text-align:center; font-size:12px; color:#9ca3af;">
                                <p style="margin:0 0 6px 0; font-weight:700; color:#4b5563; font-size:12px;">KUOTAX OFFICIAL</p>
                                <p style="margin:0; font-size:11px;">Email ini dikirim secara otomatis oleh sistem Kuotax. Jika butuh bantuan, hubungi kami via menu Tiket Bantuan di aplikasi.</p>
                                <p style="margin:8px 0 0 0; font-size:11px; color:#9ca3af;">&copy; ${year} Kuotax Platform. All rights reserved.</p>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

/**
 * Send OTP Verification Email
 */
async function sendVerificationEmail(email, name, otpCode) {
    const logoUrl = await getEmailLogoUrl();
    const subject = '🔐 Verifikasi Akun Kuotax Anda';

    const contentHtml = `
        <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Terima kasih telah mendaftar di Kuotax. Untuk menyelesaikan verifikasi keamanan akun Anda, gunakan kode OTP di bawah ini:</p>
        
        <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; padding: 16px 36px; font-size: 32px; font-weight: 800; color: #059669; background-color: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; letter-spacing: 8px;">
                ${otpCode}
            </div>
        </div>

        <p style="font-size: 13px; color: #6b7280; text-align: center; margin-bottom: 0;">
            Kode OTP ini berlaku selama <strong>15 menit</strong>. Jangan bagikan kode ini kepada siapapun termasuk pihak Kuotax.
        </p>
    `;

    const html = buildEmailWrapper({
        logoUrl,
        title: 'Verifikasi Akun (Kode OTP)',
        badge: { text: 'Keamanan Akun', style: 'background-color:#ecfdf5; color:#047857;' },
        contentHtml,
        footerNote: '<strong>PENTING:</strong> Petugas Kuotax tidak pernah meminta Kode OTP Anda. Jaga kerahasiaan akun Anda.'
    });

    return await sendBrevoEmail(email, name, subject, html);
}

/**
 * Send Deposit Notification
 * status: 'pending', 'approved', 'rejected'
 */
async function sendDepositEmail(email, name, amount, status, adminMessage = '') {
    const logoUrl = await getEmailLogoUrl();
    const amountStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    
    let subject = '';
    let statusText = '';
    let badgeStyle = '';

    if (status === 'pending') {
        subject = '⏳ Deposit Sedang Diproses - Kuotax';
        statusText = 'Diproses (Sedang Diverifikasi)';
        badgeStyle = 'background-color:#fef3c7; color:#b45309;';
    } else if (status === 'approved') {
        subject = '✅ Deposit Berhasil Disetujui - Kuotax';
        statusText = 'Disetujui / Saldo Bertambah';
        badgeStyle = 'background-color:#d1fae5; color:#047857;';
    } else if (status === 'rejected') {
        subject = '❌ Deposit Ditolak - Kuotax';
        statusText = 'Ditolak';
        badgeStyle = 'background-color:#fee2e2; color:#b91c1c;';
    }

    const contentHtml = `
        <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Berikut adalah rincian informasi pembaruan transaksi deposit saldo Anda:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color:#f9fafb; border-radius:10px; overflow:hidden; border:1px solid #f3f4f6;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Nominal Deposit</td>
                <td style="padding: 12px 16px; font-weight: 800; color: #059669; font-size: 16px; text-align:right;">${amountStr}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Status Transaksi</td>
                <td style="padding: 12px 16px; font-weight: 700; text-align:right;">${statusText}</td>
            </tr>
            ${adminMessage ? `
            <tr>
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Catatan Admin</td>
                <td style="padding: 12px 16px; font-weight: 600; color: #374151; text-align:right;">${adminMessage}</td>
            </tr>` : ''}
        </table>
        
        ${status === 'pending' ? '<p style="color: #4b5563; font-size: 13px;">Sistem sedang memverifikasi bukti transfer / mutasi Anda. Saldo akan otomatis bertambah setelah dikonfirmasi.</p>' : ''}
        ${status === 'approved' ? '<p style="color: #047857; font-size: 13px; font-weight:600;">Saldo Anda telah berhasil ditambahkan ke akun Kuotax. Selamat bertransaksi!</p>' : ''}
        ${status === 'rejected' ? '<p style="color: #b91c1c; font-size: 13px;">Permohonan deposit tidak sesuai / ditolak. Jika merasa terjadi kekeliruan, silakan hubungi tim support kami.</p>' : ''}
    `;

    const html = buildEmailWrapper({
        logoUrl,
        title: 'Informasi Deposit Saldo',
        badge: { text: statusText, style: badgeStyle },
        contentHtml
    });

    return await sendBrevoEmail(email, name, subject, html);
}

/**
 * Send Withdrawal Notification
 * status: 'pending', 'approved', 'rejected'
 */
async function sendWithdrawalEmail(email, name, amount, status, adminMessage = '') {
    const logoUrl = await getEmailLogoUrl();
    const amountStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    
    let subject = '';
    let statusText = '';
    let badgeStyle = '';

    if (status === 'pending') {
        subject = '⏳ Permohonan Penarikan Dana - Kuotax';
        statusText = 'Sedang Diproses';
        badgeStyle = 'background-color:#fef3c7; color:#b45309;';
    } else if (status === 'approved') {
        subject = '✅ Penarikan Dana Berhasil - Kuotax';
        statusText = 'Berhasil Ditransfer';
        badgeStyle = 'background-color:#d1fae5; color:#047857;';
    } else if (status === 'rejected') {
        subject = '❌ Penarikan Dana Ditolak - Kuotax';
        statusText = 'Ditolak (Saldo Dikembalikan)';
        badgeStyle = 'background-color:#fee2e2; color:#b91c1c;';
    }

    const contentHtml = `
        <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Berikut adalah pembaruan mengenai permintaan penarikan saldo (withdrawal) akun Anda:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color:#f9fafb; border-radius:10px; overflow:hidden; border:1px solid #f3f4f6;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Nominal Penarikan</td>
                <td style="padding: 12px 16px; font-weight: 800; color: #1f2937; font-size: 16px; text-align:right;">${amountStr}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Status Penarikan</td>
                <td style="padding: 12px 16px; font-weight: 700; text-align:right;">${statusText}</td>
            </tr>
            ${adminMessage ? `
            <tr>
                <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Catatan Admin</td>
                <td style="padding: 12px 16px; font-weight: 600; color: #374151; text-align:right;">${adminMessage}</td>
            </tr>` : ''}
        </table>
        
        ${status === 'pending' ? '<p style="color: #4b5563; font-size: 13px;">Permohonan pencairan dana telah masuk antrean dan sedang ditransfer oleh tim keuangan kami.</p>' : ''}
        ${status === 'approved' ? '<p style="color: #047857; font-size: 13px; font-weight:600;">Dana telah berhasil ditransfer ke rekening bank / e-wallet tujuan Anda. Silakan cek mutasi rekening Anda.</p>' : ''}
        ${status === 'rejected' ? '<p style="color: #b91c1c; font-size: 13px;">Permohonan penarikan Anda tidak dapat diproses. Saldo telah dikembalikan ke akun Kuotax Anda.</p>' : ''}
    `;

    const html = buildEmailWrapper({
        logoUrl,
        title: 'Status Penarikan Dana',
        badge: { text: statusText, style: badgeStyle },
        contentHtml
    });

    return await sendBrevoEmail(email, name, subject, html);
}

/**
 * Send Password Reset Email
 */
async function sendPasswordResetEmail(email, name, resetLink) {
    const logoUrl = await getEmailLogoUrl();
    const subject = '🔑 Reset Password Akun Kuotax Anda';

    const contentHtml = `
        <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Kami menerima permintaan untuk melakukan reset password akun Kuotax Anda. Klik tombol di bawah untuk membuat password baru:</p>
        
        <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
                🔑 Reset Password Saya
            </a>
        </div>

        <p style="font-size: 12px; color: #6b7280; line-height: 1.5; word-break: break-all; background-color:#f9fafb; padding:12px; border-radius:8px; border:1px solid #f3f4f6;">
            Jika tombol tidak berfungsi, salin dan buka tautan berikut di browser Anda:<br>
            <a href="${resetLink}" style="color: #059669; font-weight:600;">${resetLink}</a>
        </p>
    `;

    const html = buildEmailWrapper({
        logoUrl,
        title: 'Permintaan Reset Password',
        badge: { text: 'Tautan Berlaku 30 Menit', style: 'background-color:#fef3c7; color:#b45309;' },
        contentHtml,
        footerNote: '<strong>Keamanan:</strong> Jika Anda merasa tidak pernah meminta reset password, abaikan email ini. Password lama Anda akan tetap aman.'
    });

    return await sendBrevoEmail(email, name, subject, html);
}

/**
 * Send Support Ticket Email Notification
 */
async function sendSupportTicketEmail(email, name, ticketId, subjectText, messageText, isReply = true) {
    const logoUrl = await getEmailLogoUrl();
    const subject = isReply ? `📩 Balasan Tiket [${ticketId}] - ${subjectText}` : `🎫 Tiket Bantuan Terbuat [${ticketId}] - ${subjectText}`;

    const contentHtml = `
        <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
            ${isReply ? `Tim Support Kuotax telah memberikan balasan untuk tiket kendala <strong>[${ticketId}]</strong>:` : `Tiket bantuan Anda <strong>[${ticketId}]</strong> telah berhasil dibuat:`}
        </p>
        
        <div style="background-color: #f9fafb; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 14px; color: #374151; line-height: 1.6;">
            <strong>Isi Pesan:</strong><br>
            <div style="margin-top:6px; color:#4b5563;">${messageText.replace(/\n/g, '<br>')}</div>
        </div>

        <p style="font-size: 13px; color: #6b7280;">Anda dapat memantau atau memberikan balasan lebih lanjut melalui menu <strong>Tiket Bantuan</strong> di aplikasi Kuotax.</p>
    `;

    const html = buildEmailWrapper({
        logoUrl,
        title: isReply ? 'Balasan Tiket Bantuan' : 'Tiket Bantuan Terbuat',
        badge: { text: ticketId, style: 'background-color:#ecfdf5; color:#047857;' },
        contentHtml
    });

    return await sendBrevoEmail(email, name, subject, html);
}

/**
 * Send Test Email (for Admin Settings Testing)
 */
async function sendTestEmail({ toEmail, templateType }) {
    const logoUrl = await getEmailLogoUrl();
    const testName = 'Pengguna Uji Coba';
    let subject = '';
    let title = '';
    let badge = null;
    let contentHtml = '';
    let footerNote = null;

    switch (templateType) {
        case 'otp':
            subject = '🧪 [TEST] Verifikasi Kode OTP Kuotax';
            title = 'Verifikasi Akun (Kode OTP)';
            badge = { text: 'Test Email Mode', style: 'background-color:#ecfdf5; color:#047857;' };
            contentHtml = `
                <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${testName}</strong>,</p>
                <p style="font-size: 14px; color: #4b5563;">Ini adalah contoh email notifikasi verifikasi kode OTP untuk pengujian format email di Admin Panel:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; padding: 16px 36px; font-size: 32px; font-weight: 800; color: #059669; background-color: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; letter-spacing: 8px;">
                        849201
                    </div>
                </div>
            `;
            footerNote = '<strong>Catatan Pengujian:</strong> Kode OTP ini adalah data simulasi pengujian.';
            break;

        case 'reset_password':
            subject = '🧪 [TEST] Reset Password Akun Kuotax';
            title = 'Permintaan Reset Password';
            badge = { text: 'Test Email Mode', style: 'background-color:#fef3c7; color:#b45309;' };
            contentHtml = `
                <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${testName}</strong>,</p>
                <p style="font-size: 14px; color: #4b5563;">Ini adalah contoh email reset password untuk pengujian tampilan tombol & tautan:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="https://kuotax.web.id/reset-password?token=test123456789" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
                        🔑 Reset Password Saya
                    </a>
                </div>
            `;
            break;

        case 'deposit_pending':
        case 'deposit_approved':
        case 'deposit_rejected':
            const depStatus = templateType.replace('deposit_', '');
            const depStatusLabel = depStatus === 'pending' ? 'Diproses' : (depStatus === 'approved' ? 'Disetujui / Berhasil' : 'Ditolak');
            const depColor = depStatus === 'pending' ? 'background-color:#fef3c7; color:#b45309;' : (depStatus === 'approved' ? 'background-color:#d1fae5; color:#047857;' : 'background-color:#fee2e2; color:#b91c1c;');
            subject = `🧪 [TEST] Status Deposit: ${depStatusLabel}`;
            title = 'Informasi Deposit Saldo';
            badge = { text: depStatusLabel, style: depColor };
            contentHtml = `
                <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${testName}</strong>,</p>
                <p style="font-size: 14px; color: #4b5563;">Ini adalah contoh email notifikasi deposit status <strong>${depStatusLabel}</strong>:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color:#f9fafb; border-radius:10px; border:1px solid #f3f4f6;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Nominal Deposit</td>
                        <td style="padding: 12px 16px; font-weight: 800; color: #059669; font-size: 16px; text-align:right;">Rp 100.123</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Metode Pembayaran</td>
                        <td style="padding: 12px 16px; font-weight: 700; text-align:right;">QRIS Dinamis (Testing)</td>
                    </tr>
                </table>
            `;
            break;

        case 'withdrawal_pending':
        case 'withdrawal_approved':
        case 'withdrawal_rejected':
            const wdStatus = templateType.replace('withdrawal_', '');
            const wdStatusLabel = wdStatus === 'pending' ? 'Sedang Diproses' : (wdStatus === 'approved' ? 'Berhasil Ditransfer' : 'Ditolak');
            const wdColor = wdStatus === 'pending' ? 'background-color:#fef3c7; color:#b45309;' : (wdStatus === 'approved' ? 'background-color:#d1fae5; color:#047857;' : 'background-color:#fee2e2; color:#b91c1c;');
            subject = `🧪 [TEST] Status Penarikan: ${wdStatusLabel}`;
            title = 'Status Penarikan Dana';
            badge = { text: wdStatusLabel, style: wdColor };
            contentHtml = `
                <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${testName}</strong>,</p>
                <p style="font-size: 14px; color: #4b5563;">Ini adalah contoh email notifikasi penarikan dana status <strong>${wdStatusLabel}</strong>:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color:#f9fafb; border-radius:10px; border:1px solid #f3f4f6;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Nominal Penarikan</td>
                        <td style="padding: 12px 16px; font-weight: 800; color: #1f2937; font-size: 16px; text-align:right;">Rp 250.000</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 16px; color: #6b7280; font-size: 13px;">Bank / E-Wallet Tujuan</td>
                        <td style="padding: 12px 16px; font-weight: 700; text-align:right;">BCA - 1234567890 (Testing)</td>
                    </tr>
                </table>
            `;
            break;

        case 'support_ticket':
        default:
            subject = '🧪 [TEST] Balasan Tiket [TCK-881920] - Kendala Deposit';
            title = 'Balasan Tiket Bantuan';
            badge = { text: 'TCK-881920', style: 'background-color:#ecfdf5; color:#047857;' };
            contentHtml = `
                <p style="font-size: 15px; color: #1f2937; margin-top:0;">Halo <strong>${testName}</strong>,</p>
                <p style="font-size: 14px; color: #4b5563;">Ini adalah contoh email notifikasi balasan tiket support dari Admin:</p>
                <div style="background-color: #f9fafb; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 14px; color: #374151;">
                    <strong>Isi Balasan Admin:</strong><br>
                    <div style="margin-top:6px; color:#4b5563;">Halo, pembayaran deposit Anda sebesar Rp 100.123 telah kami verifikasi dan saldo telah masuk ke akun Anda. Terima kasih!</div>
                </div>
            `;
            break;
    }

    const html = buildEmailWrapper({
        logoUrl,
        title,
        badge,
        contentHtml,
        footerNote
    });

    return await sendBrevoEmail(toEmail, testName, subject, html);
}

module.exports = {
    sendVerificationEmail,
    sendDepositEmail,
    sendWithdrawalEmail,
    sendPasswordResetEmail,
    sendSupportTicketEmail,
    sendTestEmail
};
