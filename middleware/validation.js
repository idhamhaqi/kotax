// Input validation middleware
function validateRegister(req, res, next) {
    const { full_name, email, bank_name, bank_account_number, phone, province, city, whatsapp, password, password_confirm, referral_code } = req.body;

    if (!full_name || full_name.trim().length < 3) {
        return res.json({ success: false, message: 'Nama lengkap minimal 3 karakter' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.json({ success: false, message: 'Email tidak valid' });
    }

    if (!bank_name || !bank_account_number) {
        return res.json({ success: false, message: 'Data bank harus diisi' });
    }

    // Validate bank account number format (numbers only, min 5 digits)
    const bankAccountClean = bank_account_number.replace(/\s/g, '');
    if (!/^\d{5,}$/.test(bankAccountClean)) {
        return res.json({ success: false, message: 'Nomor rekening tidak valid (minimal 5 digit angka)' });
    }

    // Validate phone number
    if (!phone || phone.trim() === '') {
        return res.json({ success: false, message: 'Nomor HP harus diisi' });
    }
    const phoneClean = phone.replace(/[\s\-()]/g, '');
    if (!/^(08|628|\+628)\d{8,12}$/.test(phoneClean)) {
        return res.json({ success: false, message: 'Format nomor HP tidak valid (contoh: 08123456789)' });
    }

    // Validate province
    if (!province || province.trim() === '') {
        return res.json({ success: false, message: 'Provinsi harus dipilih' });
    }

    // Validate city
    if (!city || city.trim() === '') {
        return res.json({ success: false, message: 'Kota/Kabupaten harus dipilih' });
    }

    // Validate WhatsApp number
    if (!whatsapp || whatsapp.trim() === '') {
        return res.json({ success: false, message: 'Nomor WhatsApp harus diisi' });
    }

    // Validate WhatsApp format (Indonesian phone number)
    const waClean = whatsapp.replace(/[\s\-()]/g, '');
    if (!/^(08|628|\+628)\d{8,12}$/.test(waClean)) {
        return res.json({ success: false, message: 'Format nomor WhatsApp tidak valid (contoh: 08123456789)' });
    }

    if (!password || password.length < 8) {
        return res.json({ success: false, message: 'Password minimal 8 karakter, harus mengandung huruf besar, huruf kecil, dan angka' });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        return res.json({ success: false, message: 'Password minimal 8 karakter, harus mengandung huruf besar, huruf kecil, dan angka' });
    }

    if (password !== password_confirm) {
        return res.json({ success: false, message: 'Password tidak sama' });
    }

    // Validate referral code (mandatory)
    if (!referral_code || referral_code.trim() === '') {
        return res.json({ success: false, message: 'Kode referral wajib diisi' });
    }

    next();
}

function validateLogin(req, res, next) {
    const { email, password } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.json({ success: false, message: 'Email tidak valid' });
    }

    if (!password) {
        return res.json({ success: false, message: 'Password harus diisi' });
    }

    next();
}

module.exports = { validateRegister, validateLogin };
