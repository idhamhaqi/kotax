// 100 Mitra Counter Names
const MITRA_COUNTERS = [
    'Mitra Anwar Cell', 'Mitra Bunga Cell', 'Mitra Bunga Cell 2', 'Mitra Jaya Pulsa',
    'Mitra Rizky Phone', 'Mitra Barokah Cell', 'Mitra Berkah Pulsa', 'Mitra Sumber Rezeki',
    'Mitra Cahaya Cell', 'Mitra Terang Pulsa', 'Mitra Wijaya Counter', 'Mitra Putra Phone',
    'Mitra Surya Cell', 'Mitra Bintang Pulsa', 'Mitra Mentari Counter', 'Mitra Fajar Cell',
    'Mitra Sinar Phone', 'Mitra Gemilang Pulsa', 'Mitra Sejahtera Cell', 'Mitra Makmur Counter',
    'Mitra Mandiri Cell', 'Mitra Abadi Pulsa', 'Mitra Lancar Phone', 'Mitra Sukses Counter',
    'Mitra Maju Cell', 'Mitra Jaya Cell 2', 'Mitra Subur Pulsa', 'Mitra Damai Phone',
    'Mitra Sentosa Cell', 'Mitra Sejati Counter', 'Mitra Prima Pulsa', 'Mitra Utama Cell',
    'Mitra Andalan Phone', 'Mitra Terpercaya Counter', 'Mitra Hebat Cell', 'Mitra Super Pulsa',
    'Mitra Perkasa Phone', 'Mitra Tangguh Cell', 'Mitra Kuat Counter', 'Mitra Sakti Pulsa',
    'Mitra Agung Cell', 'Mitra Mulia Phone', 'Mitra Luhur Counter', 'Mitra Indah Pulsa',
    'Mitra Asri Cell', 'Mitra Permai Phone', 'Mitra Elok Counter', 'Mitra Cantik Cell',
    'Mitra Rapi Pulsa', 'Mitra Bersih Phone', 'Mitra Aman Counter', 'Mitra Nyaman Cell',
    'Mitra Tenang Pulsa', 'Mitra Damai Phone 2', 'Mitra Harmoni Counter', 'Mitra Rukun Cell',
    'Mitra Akur Pulsa', 'Mitra Kompak Phone', 'Mitra Solid Counter', 'Mitra Kuat Cell 2',
    'Mitra Tangguh Pulsa', 'Mitra Kokoh Phone', 'Mitra Teguh Counter', 'Mitra Mantap Cell',
    'Mitra Top Pulsa', 'Mitra Oke Phone', 'Mitra Bagus Counter', 'Mitra Murah Cell',
    'Mitra Hemat Pulsa', 'Mitra Ekonomis Phone', 'Mitra Promo Counter', 'Mitra Diskon Cell',
    'Mitra Bonus Pulsa', 'Mitra Untung Phone', 'Mitra Laba Counter', 'Mitra Cuan Cell',
    'Mitra Profit Pulsa', 'Mitra Raup Phone', 'Mitra Panen Counter', 'Mitra Hasil Cell',
    'Mitra Rejeki Pulsa', 'Mitra Berkah Phone', 'Mitra Rahmat Counter', 'Mitra Hidayah Cell',
    'Mitra Petunjuk Pulsa', 'Mitra Cahaya Phone 2', 'Mitra Nur Counter', 'Mitra Terang Cell 2',
    'Mitra Benderang Pulsa', 'Mitra Sorot Phone', 'Mitra Sinar Counter 2', 'Mitra Kilau Cell',
    'Mitra Cemerlang Pulsa', 'Mitra Gilang Phone', 'Mitra Gemerlap Counter', 'Mitra Bersinar Cell',
    'Mitra Mega Pulsa', 'Mitra Giga Phone', 'Mitra Ultra Counter', 'Mitra Super Cell 2'
];

// 50 Server Names
const SERVER_SOURCES = [
    'Server Purnajaya', 'Server Teknologi Jakarta', 'Server Data Surabaya', 'Server Cloud Bandung',
    'Server Digital Medan', 'Server Net Makassar', 'Server Hub Semarang', 'Server Link Palembang',
    'Server Pro Denpasar', 'Server Max Yogyakarta', 'Server Ultra Tangerang', 'Server Mega Bekasi',
    'Server Prime Depok', 'Server Elite Bogor', 'Server Supreme Malang', 'Server Platinum Bali',
    'Server Gold Pontianak', 'Server Silver Balikpapan', 'Server Bronze Banjarmasin', 'Server Diamond Pekanbaru',
    'Server Crystal Manado', 'Server Pearl Samarinda', 'Server Ruby Jambi', 'Server Sapphire Padang',
    'Server Emerald Lampung', 'Server Topaz Batam', 'Server Jade Mataram', 'Server Onyx Kupang',
    'DC Nusantara', 'DC Indonesia Raya', 'DC Garuda', 'DC Mandala',
    'DC Wijaya Kusuma', 'DC Majapahit', 'DC Sriwijaya', 'DC Tarumanegara',
    'Node Jakarta Pusat', 'Node Surabaya Timur', 'Node Bandung Utara', 'Node Medan Selatan',
    'Core Network Jakarta', 'Core Network Surabaya', 'Core Network Bandung', 'Core Network Bali',
    'Hub Indonesia', 'Hub Nusantara', 'Hub Asia Pacific', 'Hub Southeast Asia',
    'Cloud Indonesia', 'Cloud Archipelago'
];

// Get random counter
function getRandomCounter() {
    return MITRA_COUNTERS[Math.floor(Math.random() * MITRA_COUNTERS.length)];
}

// Get random server
function getRandomServer() {
    return SERVER_SOURCES[Math.floor(Math.random() * SERVER_SOURCES.length)];
}

// Get random source (70% counter, 30% server for realism)
function getRandomSource() {
    const isCounter = Math.random() < 0.7; // 70% chance counter
    return {
        type: isCounter ? 'counter' : 'server',
        name: isCounter ? getRandomCounter() : getRandomServer()
    };
}

module.exports = {
    MITRA_COUNTERS,
    SERVER_SOURCES,
    getRandomCounter,
    getRandomServer,
    getRandomSource
};
