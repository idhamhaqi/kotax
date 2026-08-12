const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    // Render mitra API page
    res.render('mitra', {
        title: 'Kemitraan API B2B - Kuotax',
        description: 'Hubungkan server pulsa atau PPOB Anda dengan API Kuotax dan dapatkan stok kuota dengan harga termurah di Indonesia.'
    });
});

module.exports = router;
