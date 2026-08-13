# 🤖 Kuotax Auto-Order Bot (Lightweight Dual-Mode Engine)

Bot ini dirancang khusus untuk memindai dan mengeksekusi (*fill order*) secara **otomatis** di Kuotax Aggregator tanpa perlu mengeklik manual dari browser web.

---

## ⚡ Fitur Utama:
1. **Auto-Login**: Cukup masukkan email & password akun Kuotax Anda.
2. **Auto-Scan & Claim (Milidetik)**: Memindai orderan aktif dan mengeksekusi orderan terbaik yang modalnya sesuai dengan Saldo Utama Anda.
3. **Looping Otomatis Sampai Saldo Habis**: Setelah 1 orderan selesai diproses, bot langsung mengeksekusi orderan berikutnya secara terus-menerus.
4. **Dual Mode Running**:
   - **Mode Web UI Control Panel** (`http://localhost:4000`): Tampilan visual yang intuitif dengan statistik live, tombol Start/Stop, dan terminal log.
   - **Mode Terminal CLI**: Sangat ringan (RAM < 15MB) untuk dijalankan di background VPS atau Terminal PC.

---

## 🚀 Cara Menjalankan:

### Mode 1: Web UI Control Panel (Disarankan)
```bash
node bot/webServer.js
# Atau dengan Bun:
bun run bot/webServer.js
```
Buka browser Anda dan akses: **`http://localhost:4000`**

### Mode 2: Terminal CLI (Super Ringan)
```bash
node bot/cli.js
```
Masukkan Email & Password Anda langsung di terminal.

---

## ⚙️ Pengaturan `config.json`
Anda dapat menyesuaikan file `bot/config.json`:
- `targetUrl`: URL target (default: `https://kuotax.web.id`).
- `pollIntervalMs`: Jeda waktu pemindaian pasar (default: `1500` ms).
- `minBalanceThreshold`: Batas minimal saldo utama untuk berhenti otomatis (default: `10000` Rp).
