const db = require('../config/database');
const emailService = require('../services/emailService');

// Get settings page
async function getSettingsPage(req, res) {
    try {
        // Get all settings
        const [settings] = await db.query('SELECT setting_key, setting_value FROM settings');

        // Convert to object
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = setting.setting_value;
        });

        res.render('admin/settings', { settings: settingsObj });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
}

// Update settings
async function updateSettings(req, res) {
    try {
        const { order_multiplier, target_monthly_roi, google_analytics_script, email_logo_url } = req.body;

        const settingsToUpdate = [];
        if (order_multiplier !== undefined) settingsToUpdate.push({ key: 'order_multiplier', value: String(order_multiplier) });
        if (target_monthly_roi !== undefined) settingsToUpdate.push({ key: 'target_monthly_roi', value: String(target_monthly_roi) });
        if (google_analytics_script !== undefined) settingsToUpdate.push({ key: 'google_analytics_script', value: String(google_analytics_script) });
        if (email_logo_url !== undefined) settingsToUpdate.push({ key: 'email_logo_url', value: String(email_logo_url).trim() });

        for (const setting of settingsToUpdate) {
            await db.query(
                `INSERT INTO settings (setting_key, setting_value)
                 VALUES ($1, $2)
                 ON CONFLICT (setting_key) DO UPDATE SET setting_value = $3 RETURNING id`,
                [setting.key, setting.value, setting.value]
            );
        }

        res.json({ success: true, message: 'Settings berhasil disimpan' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

// Send Test Email (For Admin Settings Testing)
async function sendTestEmail(req, res) {
    try {
        const { to_email, template_type } = req.body;
        if (!to_email || !to_email.trim()) {
            return res.json({ success: false, message: 'Alamat email tujuan wajib diisi' });
        }

        const success = await emailService.sendTestEmail({
            toEmail: to_email.trim(),
            templateType: template_type || 'otp'
        });

        if (success) {
            res.json({ success: true, message: `Email uji coba template (${template_type}) berhasil dikirim ke ${to_email}!` });
        } else {
            res.json({ success: false, message: 'Gagal mengirim email uji coba. Pastikan BREVO_API_KEY valid di file .env' });
        }
    } catch (error) {
        console.error('Send test email error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server saat mengirim email uji coba' });
    }
}

// Get deposit settings (for API)
async function getDepositSettings(req, res) {
    try {
        const [settings] = await db.query(
            `SELECT setting_key, setting_value FROM settings
             WHERE setting_key IN ('deposit_bank_name', 'deposit_bank_account', 'deposit_account_holder', 'admin_contact')`
        );

        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = setting.setting_value;
        });

        // Check if payment method is configured
        const hasPaymentMethod = settingsObj.deposit_bank_name &&
                                 settingsObj.deposit_bank_account &&
                                 settingsObj.deposit_account_holder;

        res.json({
            success: true,
            settings: settingsObj,
            hasPaymentMethod
        });
    } catch (error) {
        console.error('Get deposit settings error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
}

module.exports = {
    getSettingsPage,
    updateSettings,
    sendTestEmail,
    getDepositSettings
};
