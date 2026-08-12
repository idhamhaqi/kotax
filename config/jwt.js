require('dotenv').config();

module.exports = {
    secret: process.env.JWT_SECRET || 'kuota-aggregator-secret-key-2024-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
};
