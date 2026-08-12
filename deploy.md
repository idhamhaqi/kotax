# 🚀 Panduan Lengkap Deploy Production: GitHub, VPS (Ubuntu), Bun Native, PostgreSQL, Certbot & Cloudflare SSL (Full Strict)

Panduan ini disusun secara berurutan, praktis, dan teruji (*foolproof*) untuk me-deploy aplikasi **Kuotax** (`kuotax.web.id`) ke VPS (Ubuntu/Debian) menggunakan runtime **Bun Native**, **PostgreSQL**, **Nginx Reverse Proxy**, **Certbot (Let's Encrypt)**, dan **Cloudflare SSL (Full Strict)**.

---

## 📌 DAFTAR URUTAN LANGKAH (OVERVIEW)

1. **Langkah 1**: Upload Project ke GitHub (Private Repository)
2. **Langkah 2**: Persiapan & Instalasi Server VPS (Ubuntu/Debian)
3. **Langkah 3**: Konfigurasi Database PostgreSQL di VPS
4. **Langkah 4**: Clone Project & Setup Environment (`.env`) di VPS
5. **Langkah 5**: Buat Service Systemd Bun (Auto-Restart / Background Process)
6. **Langkah 6**: Setting DNS Awal di Cloudflare (Opsi *DNS Only* / Awan Abu-Abu)
7. **Langkah 7**: Konfigurasi Nginx & Penerbitan Sertifikat SSL Otomatis via Certbot
8. **Langkah 8**: Aktifkan Proxy Cloudflare (Awan Oranye) & Mode **Full (Strict)**
9. **Langkah 9**: Pengamanan Firewall VPS (UFW)
10. **Langkah 10**: Verifikasi & Pengujian Fitur Production

---

## 1. 📤 LANGKAH 1: UPLOAD PROJECT KE GITHUB

Jalankan perintah berikut di terminal komputer lokal Anda (tempat project berada):

### 1.1 Cek File `.gitignore`
Pastikan file `.gitignore` di root project Anda berisi:
```gitignore
.env
.env.local
.env.production
node_modules/
bun.lockb
*.log
bun-server.log
sessions/
public/uploads/temp/*
!public/uploads/temp/.gitkeep
public/uploads/deposit-proofs/*
!public/uploads/deposit-proofs/.gitkeep
```

### 1.2 Push Kode ke Repository GitHub
```bash
# Inisialisasi git (jika belum)
git init

# Tambahkan seluruh file
git add .

# Commit kode
git commit -m "feat: production ready codebase with webhook & security fixes"

# Hubungkan ke repository GitHub Private milik Anda (ganti URL di bawah)
git remote add origin https://github.com/USERNAME/kuotax-aggregator.git

# Push ke branch main
git branch -M main
git push -u origin main
```

---

## 2. 🖥️ LANGKAH 2: PERSIAPAN SERVER VPS (UBUNTU / DEBIAN)

Login ke VPS Anda via SSH:
```bash
ssh root@IP_VPS_ANDA
```

### 2.1 Update & Upgrade Sistem VPS
```bash
apt update && apt upgrade -y
apt install -y curl git unzip ufw nginx certbot python3-certbot-nginx build-essential
```

### 2.2 Install Bun Runtime (Native)
```bash
# Install Bun secara resmi
curl -fsSL https://bun.sh/install | bash

# Muat environment variable Bun ke session terminal
source ~/.bashrc

# Verifikasi instalasi Bun
bun --version
# Output akan menampilkan versi bun (misal: 1.1.x / 1.2.x)
```

---

## 3. 🗄️ LANGKAH 3: KONFIGURASI POSTGRESQL DI VPS

### 3.1 Install & Jalankan PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql
```

### 3.2 Buat Database & User PostgreSQL
Masuk ke prompt `psql`:
```bash
sudo -u postgres psql
```

Jalankan perintah SQL berikut di dalam prompt `psql` (Ganti `PASSWORD_DB_AMAN` dengan password pilihan Anda):
```sql
CREATE DATABASE kuotax;
CREATE USER kuotax_user WITH ENCRYPTED PASSWORD 'PASSWORD_DB_AMAN';
GRANT ALL PRIVILEGES ON DATABASE kuotax TO kuotax_user;
ALTER DATABASE kuotax OWNER TO kuotax_user;
\q
```

---

## 4. 📂 LANGKAH 4: CLONE PROJECT & SETUP ENVIRONMENT DI VPS

### 4.1 Clone Project dari GitHub
```bash
mkdir -p /var/www
cd /var/www

# Clone repository Anda
git clone https://github.com/USERNAME/kuotax-aggregator.git kuotax
cd /var/www/kuotax
```

### 4.2 Install Dependencies & Build CSS
```bash
# Install paket Node/Bun
bun install

# Build file CSS Tailwind untuk produksi
bun run build:css
```

### 4.3 Buat File `.env` Produksi
Buat file `.env` di VPS:
```bash
nano .env
```

Isi file `.env` dengan konfigurasi produksi berikut (Sesuaikan rahasia & password!):
```env
NODE_ENV=production
PORT=3000

# Security Secrets (Ganti dengan karakter acak & unik!)
SESSION_SECRET=c8d9f0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
JWT_SECRET=f1e2d3c4b5a6987654321fedcba0987654321abcdef

# Database PostgreSQL VPS
DB_HOST=localhost
DB_PORT=5432
DB_USER=kuotax_user
DB_PASSWORD=PASSWORD_DB_AMAN
DB_NAME=kuotax

# Server Limits
MAX_CONNECTIONS=1000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Admin Portal Configuration (Secret Key untuk URL Gate & Login)
ADMIN_KEY=@Polar007
ADMIN_USERNAME=admin
ADMIN_PASSWORD=PasswordAdminKuat2026!

# Webhook Authorization Token (Pengaman Notif Bridge Android)
WEBHOOK_SECRET_TOKEN=kuotax-webhook-secret-2026

# Email Notifikasi Brevo
BREVO_API_KEY=xkeysib-your-actual-brevo-api-key-here
BREVO_SENDER_EMAIL=no-reply@kuotax.web.id
BREVO_SENDER_NAME=Kuotax
```
*Simpan dengan `Ctrl + O`, tekan `Enter`, lalu keluar dengan `Ctrl + X`.*

### 4.4 Inisialisasi Schema Database & Seeding
Jalankan script auto-provisioning tabel dan seeder admin:
```bash
bun run setup:db
# Output: ✅ All tables and default settings have been provisioned successfully!
```

---

## 5. ⚙️ LANGKAH 5: BUAT BACKGROUND SERVICE BUN (SYSTEMD)

Agar aplikasi otomatis berjalan di background dan otomatis nyala kembali jika VPS di-restart / crash.

### 5.1 Buat File Service Systemd
```bash
nano /etc/systemd/system/kuotax.service
```

Isi dengan konfigurasi berikut:
```ini
[Unit]
Description=Kuotax Bun Application Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/kuotax
ExecStart=/root/.bun/bin/bun run server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
*Simpan dengan `Ctrl + O`, `Enter`, `Ctrl + X`.*

### 5.2 Jalankan & Aktifkan Service
```bash
systemctl daemon-reload
systemctl enable --now kuotax

# Cek status service
systemctl status kuotax
# Harus berstatus: active (running)
```

---

## 6. 🌐 LANGKAH 6: SETTING DNS AWAL DI CLOUDFLARE (DNS ONLY)

Sebelum Sertifikat SSL diterbitkan oleh Certbot (Let's Encrypt), matikan sementara Proxy Cloudflare agar server validasi Let's Encrypt dapat langsung menghubungi VPS Anda.

1. Buka Dashboard Cloudflare -> Pilih domain **`kuotax.web.id`**.
2. Masuk ke menu **DNS** -> **Records**.
3. Edit / Tambahkan **A Record**:
   - **Type**: `A`
   - **Name**: `@` (atau `kuotax.web.id`)
   - **IPv4 address**: `IP_PUBLIC_VPS_ANDA`
   - **Proxy status**: **DNS Only** (Icon Awan Warna Abu-Abu 🔘)
4. Tambahkan **CNAME Record**:
   - **Type**: `CNAME`
   - **Name**: `www`
   - **Target**: `kuotax.web.id`
   - **Proxy status**: **DNS Only** (Icon Awan Warna Abu-Abu 🔘)
5. Pada menu **SSL/TLS** -> Ubah mode SSL sementara menjadi **Flexible** atau **Off**.

---

## 7. 🔌 LANGKAH 7: KONFIGURASI NGINX & SERTIFIKAT SSL AUTOMATIC (CERTBOT)

### 7.1 Buat Konfigurasi Nginx Server
```bash
nano /etc/nginx/sites-available/kuotax
```

Isi dengan konfigurasi Nginx berikut:
```nginx
# Restorasi IP Asli Pengunjung dari Header Cloudflare
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/12;
set_real_ip_from 108.162.192.0/12;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;

server {
    listen 80;
    listen [::]:80;
    server_name kuotax.web.id www.kuotax.web.id;

    # Maksimal Ukuran File Upload Bukti Transfer (10 MB)
    client_max_body_size 10M;

    # Log Akses & Error
    access_log /var/log/nginx/kuotax_access.log;
    error_log /var/log/nginx/kuotax_error.log;

    # Proxy ke Aplikasi Bun (Port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_set_header CF-Ray $http_cf_ray;

        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
    }

    # Route Khusus WebSocket Socket.IO (Timeout Panjang)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
    }
}
```
*Simpan (`Ctrl + O`, `Enter`, `Ctrl + X`).*

### 7.2 Aktifkan Site Nginx
```bash
# Buat symlink ke sites-enabled
ln -s /etc/nginx/sites-available/kuotax /etc/nginx/sites-enabled/

# Hapus default site jika ada
rm -f /etc/nginx/sites-enabled/default

# Tes sintaks Nginx
nginx -t

# Reload Nginx
systemctl reload nginx
```

### 7.3 Generate Sertifikat SSL Otomatis dengan Certbot
Jalankan Certbot untuk secara otomatis membuat sertifikat SSL dan meng-update file konfigurasi Nginx Anda:
```bash
certbot --nginx -d kuotax.web.id -d www.kuotax.web.id
```
- Masukkan alamat email Anda untuk notifikasi pembaharuan.
- Ketik `Y` untuk menyetujui *Terms of Service*.
- Pilih opsi **Redirect** (Otomatis mengalihkan HTTP ke HTTPS).

Certbot akan menerbitkan sertifikat SSL Let's Encrypt dan mengonfigurasi `ssl_certificate` di Nginx secara otomatis!

---

## 8. 🟧 LANGKAH 8: AKTIFKAN CLOUDFLARE PROXY & MODE FULL (STRICT)

Setelah sertifikat SSL lokal VPS terpasang oleh Certbot, aktifkan perlindungan penuh Cloudflare:

1. Buka Dashboard Cloudflare -> Domain **`kuotax.web.id`**.
2. Masuk ke menu **DNS** -> **Records**.
3. Ubah status Proxy pada **A Record** (`kuotax.web.id`) dan **CNAME Record** (`www`) menjadi **Proxied** (Awan Warna Oranye 🟠).
4. Masuk ke menu **SSL/TLS** -> Ubah mode enkripsi SSL menjadi **Full (Strict)**.

*Dengan ini, lalu lintas pengguna dienkripsi dari browser -> Cloudflare -> VPS Nginx (Full Strict End-to-End Encryption).*

---

## 9. 🛡️ LANGKAH 9: PENGAMANAN FIREWALL VPS (UFW)

Kunci port internal `3000` dari akses publik langsung, hanya izinkan SSH, HTTP, dan HTTPS.

```bash
# Izinkan port SSH (22), HTTP (80), dan HTTPS (443)
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Aktifkan UFW Firewall
ufw enable
# Ketik 'y' lalu tekan Enter

# Cek status UFW
ufw status
```

---

## 10. ✅ LANGKAH 10: VERIFIKASI & PENGUJIAN FITUR PRODUCTION

1. **Akses Halaman Utama**: 
   Buka `https://kuotax.web.id` di browser. Pastikan icon gembok SSL aktif.
2. **Uji Notif Bridge Android Webhook**:
   - Di aplikasi Android Notif Bridge, atur Webhook URL: `https://kuotax.web.id/api/webhook/deposit`.
   - Atur Header Authorization: `kuotax-webhook-secret-2026`.
3. **Uji Otentikasi & Deposit User**:
   - Lakukan registrasi, verifikasi OTP email, dan buat request deposit di `https://kuotax.web.id/deposit`.
   - Tes pengiriman notifikasi dari HP Android, amati status deposit di UI langsung ter-approve secara **realtime via Socket.IO**.
4. **Uji Admin Portal Security (Double-Layer Gate)**:
   - Akses `https://kuotax.web.id/admin/login` -> **403 Forbidden**.
   - Akses `https://kuotax.web.id/admin/login?key=@Polar007` -> **Form Login Terbuka & URL bersih**.
   - Login dengan username `admin` dan password admin Anda -> **Masuk ke Admin Dashboard**.

---

## 🛠️ PANDUAN PEMELIHARAAN (MAINTENANCE)

### Update Kode Aplikasi Terbaru dari GitHub
Jika Anda membuat perubahan kode di lokal dan telah me-push ke GitHub, jalankan perintah 1-baris ini di VPS:
```bash
cd /var/www/kuotax && git pull origin main && bun install && bun run build:css && systemctl restart kuotax
```

### Perintah Cek Log Server
- **Log Service Bun**: `journalctl -u kuotax -f`
- **Log File Aplikasi**: `tail -f /var/www/kuotax/bun-server.log`
- **Log Error Nginx**: `tail -f /var/log/nginx/kuotax_error.log`
