# HostPanel — Tam Proje Dökümanı

# Claude Code için Proje Bağlamı

---

## 🎯 Proje Özeti

**HostPanel**, WHMCS'e alternatif, Türkiye odaklı tam özellikli bir hosting/VPS satış ve yönetim panelidir.

**Hedef:** 0-500 müşteri kapasiteli, büyüyebilir, çok sunuculu mimari.

---

## 🏗️ Teknoloji Stack

### Backend

- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js
- **ORM:** Sequelize + MySQL 8.0
- **Cache:** Redis
- **Queue:** Bull (Redis tabanlı)
- **Auth:** JWT (access 15dk + refresh 7gün, HttpOnly cookie)
- **Zamanlayıcı:** node-cron
- **Loglama:** Winston
- **Şifreleme:** bcryptjs (round: 12), AES-256-GCM (hassas veriler)
- **Process Manager:** PM2

### Frontend

- **Framework:** React 18 + Vite
- **Styling:** TailwindCSS
- **State:** Zustand
- **HTTP:** Axios
- **Router:** React Router v6

### Altyapı

- **Panel Sunucu:** Hetzner CX22 VPS (Ubuntu 22.04 LTS) — IP: [SUNUCU_IP]
- **Hosting Sunucu:** Hetzner Dedicated (512GB NVMe + 4TB HDD + 64GB RAM + Xeon)
- **Web Sunucu:** Nginx (reverse proxy + SSL termination)
- **SSL:** Let's Encrypt (Certbot)
- **CDN/DDoS:** Cloudflare
- **Yedekleme:** Hetzner Snapshot + Volume

---

## 🔌 Entegrasyonlar

| Servis           | Sağlayıcı                   | Protokol        | Amaç                      |
| ---------------- | --------------------------- | --------------- | ------------------------- |
| VPS Yönetimi     | Hetzner Cloud               | REST API        | VPS sat/yönet             |
| Hosting Yönetimi | WHM/cPanel                  | REST API Token  | Hosting hesabı aç/yönet   |
| Domain           | DomainNameAPI (Atak Domain) | REST API        | Domain kayıt/yenileme/DNS |
| Ödeme            | İyzico                      | SDK + 3D Secure | Tahsilat + kart saklama   |
| E-Fatura         | EDM Bilişim                 | SOAP/WSDL       | E-fatura + e-arşiv        |
| AI Ajan          | Anthropic Claude            | REST API        | Agentic işlemler          |
| E-posta          | SMTP (Nodemailer)           | SMTP            | Bildirimler               |

---

## 📁 Proje Dosya Yapısı

```
hostpanel/
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js                      # Ana Express sunucu
│       ├── models/
│       │   └── index.js                  # Tüm Sequelize modelleri
│       ├── middleware/
│       │   ├── auth.js                   # JWT doğrulama
│       │   ├── rateLimiter.js            # IP bazlı istek sınırı
│       │   ├── validate.js               # Input doğrulama
│       │   ├── sanitize.js               # XSS temizleme
│       │   ├── auditLog.js               # KVKK zorunlu log
│       │   └── csrfProtection.js         # CSRF koruması
│       ├── services/
│       │   ├── HetznerService.js         # Hetzner Cloud API
│       │   ├── WHMService.js             # WHM/cPanel API
│       │   ├── DomainService.js          # DomainNameAPI
│       │   ├── IyzicoService.js          # Ödeme + kart saklama
│       │   ├── EDMService.js             # E-fatura SOAP
│       │   ├── ClaudeService.js          # Anthropic AI ajan
│       │   ├── EmailService.js           # Bildirim e-postaları
│       │   ├── ServerManager.js          # Çok sunucu yönetimi
│       │   └── CronService.js            # Otomatik tahsilat motoru
│       ├── routes/
│       │   ├── auth.js                   # Kayıt, giriş, şifre sıfırla
│       │   ├── users.js                  # Profil, KVKK hakları
│       │   ├── services.js               # VPS + hosting CRUD
│       │   ├── domains.js                # Domain işlemleri
│       │   ├── invoices.js               # Fatura + ödeme
│       │   ├── tickets.js                # Destek talepleri
│       │   ├── hetzner.js                # VPS kontrol aksiyonları
│       │   ├── whm.js                    # Hosting kontrol aksiyonları
│       │   ├── servers.js                # Sunucu yönetimi (admin)
│       │   ├── admin.js                  # Admin endpoint'leri
│       │   └── webhooks.js               # İyzico + EDM callback
│       ├── kvkk/
│       │   ├── ConsentService.js         # Açık rıza yönetimi
│       │   ├── DataRequestService.js     # Veri talep & silme
│       │   └── RetentionService.js       # Otomatik veri silme
│       ├── security/
│       │   ├── encryption.js             # AES-256-GCM yardımcıları
│       │   └── tokenRotation.js          # JWT refresh yönetimi
│       └── utils/
│           ├── logger.js                 # Winston logger
│           ├── helpers.js                # Yardımcı fonksiyonlar
│           └── migrate.js                # DB migration
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── pages/
        │   ├── auth/
        │   │   ├── Login.jsx
        │   │   ├── Register.jsx
        │   │   └── ForgotPassword.jsx
        │   ├── client/
        │   │   ├── Dashboard.jsx         # Genel özet
        │   │   ├── Services.jsx          # Servis listesi
        │   │   ├── VPSDetail.jsx         # VPS yönetim paneli
        │   │   ├── HostingDetail.jsx     # Hosting yönetim
        │   │   ├── Domains.jsx           # Domain yönetimi
        │   │   ├── Invoices.jsx          # Faturalar
        │   │   ├── Payment.jsx           # İyzico ödeme formu
        │   │   ├── Tickets.jsx           # Destek talepleri
        │   │   └── Profile.jsx           # Hesap + KVKK
        │   ├── admin/
        │   │   ├── Dashboard.jsx         # İstatistikler
        │   │   ├── Clients.jsx           # Müşteri yönetimi
        │   │   ├── Services.jsx          # Tüm servisler
        │   │   ├── Servers.jsx           # Sunucu yönetimi
        │   │   ├── Invoices.jsx          # Tüm faturalar
        │   │   ├── Tickets.jsx           # Destek yönetimi
        │   │   ├── Domains.jsx           # Domain yönetimi
        │   │   ├── Settings.jsx          # Sistem ayarları
        │   │   └── Logs.jsx              # İşlem logları
        │   └── legal/
        │       ├── KullanimSartlari.jsx
        │       ├── AydinlatmaMetni.jsx
        │       ├── GizlilikPolitikasi.jsx
        │       ├── CerezPolitikasi.jsx
        │       └── IadePolitikasi.jsx
        ├── components/
        │   ├── shared/
        │   │   ├── Navbar.jsx
        │   │   ├── Sidebar.jsx
        │   │   ├── Modal.jsx
        │   │   ├── DataTable.jsx
        │   │   ├── StatusBadge.jsx
        │   │   ├── LoadingSpinner.jsx
        │   │   └── CookieBanner.jsx
        │   ├── client/
        │   │   ├── VPSCard.jsx
        │   │   ├── InvoiceCard.jsx
        │   │   ├── DomainCard.jsx
        │   │   └── TicketForm.jsx
        │   └── admin/
        │       ├── StatsCard.jsx
        │       ├── ServerCapacity.jsx
        │       └── ClientTable.jsx
        ├── store/
        │   ├── authStore.js
        │   ├── serviceStore.js
        │   └── uiStore.js
        ├── hooks/
        │   ├── useAuth.js
        │   ├── useServices.js
        │   └── useInvoices.js
        └── utils/
            ├── api.js                    # Axios instance
            └── helpers.js               # Formatlama, tarih

```

---

## 🗄️ Veritabanı Şeması

### Tablolar

```sql
-- Kullanıcılar
users
  id UUID PK
  first_name, last_name, email, password (bcrypt)
  phone, company, address, city, country
  role ENUM(admin, client)
  status ENUM(active, suspended, pending)
  email_verified BOOLEAN
  credit DECIMAL(10,2)
  reset_token, reset_expires
  last_login, created_at, updated_at

-- Sunucular (çok sunucu yönetimi)
servers
  id UUID PK
  name VARCHAR(100)           -- "TR-Node-01"
  type ENUM(dedicated, vps)
  provider ENUM(hetzner_dedicated, hetzner_cloud)
  hetzner_id INTEGER
  ip_address VARCHAR(45)
  location VARCHAR(10)        -- nbg1, fsn1
  purpose ENUM(hosting, vps, mixed)
  whm_host, whm_port, whm_user
  whm_token VARCHAR(255)      -- AES-256 şifreli
  disk_total, disk_used, disk_threshold
  account_limit, account_count
  bandwidth_limit
  status ENUM(active, maintenance, full, offline)
  is_default BOOLEAN
  accepts_new BOOLEAN
  last_sync DATETIME

-- Servisler (VPS/Hosting)
services
  id UUID PK
  user_id UUID FK → users
  server_id UUID FK → servers
  type ENUM(vps, hosting, domain)
  name VARCHAR(100)
  status ENUM(pending, active, suspended, cancelled, terminated)
  hetzner_id INTEGER
  hetzner_ip VARCHAR(45)
  hetzner_ipv6 VARCHAR(100)
  hetzner_plan VARCHAR(20)
  hetzner_location VARCHAR(10)
  hetzner_os VARCHAR(30)
  price DECIMAL(10,2)
  billing_cycle ENUM(monthly, quarterly, annually)
  next_due DATE
  domain VARCHAR(100)
  config JSON

-- Faturalar
invoices
  id UUID PK
  user_id UUID FK → users
  invoice_num VARCHAR(20) UNIQUE   -- ARŞ-2025-00001
  status ENUM(draft, unpaid, paid, overdue, cancelled)
  subtotal, tax, total DECIMAL(10,2)
  due_date DATE
  paid_at DATETIME
  payment_method VARCHAR(30)
  iyzico_payment_id VARCHAR(100)
  edm_invoice_id VARCHAR(100)
  edm_invoice_uuid VARCHAR(100)
  edm_type ENUM(efatura, earşiv)
  notes TEXT

-- Fatura Kalemleri
invoice_items
  id UUID PK
  invoice_id UUID FK → invoices
  service_id UUID FK → services
  description VARCHAR(255)
  quantity INTEGER
  unit_price, total DECIMAL(10,2)

-- Ödemeler
payments
  id UUID PK
  user_id UUID FK → users
  invoice_id UUID FK → invoices
  amount DECIMAL(10,2)
  status ENUM(pending, success, failed, refunded)
  iyzico_payment_id VARCHAR(100)
  iyzico_card_token VARCHAR(255)    -- AES-256 şifreli
  iyzico_card_user_key VARCHAR(255) -- AES-256 şifreli
  payment_3d BOOLEAN
  error_message TEXT
  created_at DATETIME

-- Kayıtlı Kartlar
saved_cards
  id UUID PK
  user_id UUID FK → users
  card_alias VARCHAR(50)      -- "İş Kartım"
  card_last4 VARCHAR(4)
  card_brand VARCHAR(20)      -- Visa, Mastercard
  card_token VARCHAR(255)     -- AES-256 şifreli
  card_user_key VARCHAR(255)  -- AES-256 şifreli
  is_default BOOLEAN

-- Ticketlar
tickets
  id UUID PK
  user_id UUID FK → users
  service_id UUID FK → services
  ticket_num VARCHAR(15) UNIQUE
  subject VARCHAR(200)
  status ENUM(open, answered, customer_reply, closed)
  priority ENUM(low, medium, high, urgent)
  department ENUM(sales, support, billing, abuse)
  last_reply DATETIME
  ai_suggestion TEXT           -- Claude'un otomatik yanıt önerisi

-- Ticket Yanıtları
ticket_replies
  id UUID PK
  ticket_id UUID FK → tickets
  user_id UUID FK → users
  message TEXT
  is_admin BOOLEAN
  is_ai_suggestion BOOLEAN     -- Claude tarafından mı önerildi?

-- Domainler
domains
  id UUID PK
  user_id UUID FK → users
  name VARCHAR(253) UNIQUE
  tld VARCHAR(20)
  status ENUM(active, expired, pending, transferred)
  expires_at DATE
  auto_renew BOOLEAN
  nameservers JSON
  registrar VARCHAR(50)
  price DECIMAL(10,2)
  domainnameapi_id VARCHAR(100)

-- KVKK Rızaları
consents
  id UUID PK
  user_id UUID FK → users
  consent_type ENUM(service, kvkk, marketing, international_transfer)
  accepted BOOLEAN
  ip_address VARCHAR(45)
  user_agent TEXT
  version VARCHAR(10)          -- Hangi metin versiyonu
  accepted_at DATETIME

-- Aktivite Logları
activity_logs
  id UUID PK
  user_id UUID FK → users
  action VARCHAR(100)
  resource VARCHAR(50)
  resource_id VARCHAR(50)
  details JSON
  ip VARCHAR(45)
  created_at DATETIME

-- Sistem Ayarları
settings
  key VARCHAR(100) PK
  value TEXT
  type ENUM(string, number, boolean, json)
  group VARCHAR(50)
```

---

## 🔄 Otomatik Tahsilat Motoru (CronService)

```
Her ayın 1'i — saat 02:00

1. Vadesi gelen servisleri bul
2. Her servis için fatura oluştur
3. İyzico: kayıtlı karta otomatik çekim
4a. Başarılı → EDM SOAP: e-fatura/e-arşiv kes → PDF e-posta
4b. Başarısız → Uyarı e-postası (1, 3, 7. gün)
5. 7. gün hâlâ ödenmemişse → Servis askıya al
   - Hetzner: powerOff
   - WHM: suspendacct
   - Admin'e bildirim
```

---

## 🧾 EDM E-Fatura Karar Mantığı

```
Müşteri fatura alacak →
EDM SOAP: CheckUser(VKN/TCKN)
  ├── E-Fatura mükellefi → SendInvoice() [e-fatura]
  └── Değil → ArchiveInvoice() [e-arşiv]
```

---

## 🤖 Claude AI Entegrasyonu (ClaudeService)

Claude, HostPanel'de **agentic** olarak çalışacak:

### Görevler

```
1. Ticket Analizi
   - Yeni ticket gelince otomatik analiz
   - Benzer geçmiş ticketlara bak
   - Yanıt önerisi oluştur (admin onaylar)
   - Kritik/acil ticketları tespit et

2. Sunucu Monitoring
   - WHM API'den sunucu metriklerini al
   - Anormal durumları tespit et
   - Çözüm önerisi sun
   - Kritikse admin'e bildir

3. Müşteri Asistanı (Client Panel)
   - Müşteri sorularını yanıtla
   - Servis durumunu anlat
   - Fatura açıkla
   - Domain yönetimi rehberliği

4. Admin Raporlama
   - Gelir analizi
   - Müşteri kayıp/kazanım trendi
   - Kapasite tahminleme
   - Öneriler sun

5. Otomatik İşlemler (Onay Gerekmeyenler)
   - Ticket kategorize et
   - Spam ticket'ı işaretle
   - Standart yanıtları otomatik gönder
```

### Yetki Seviyeleri

```
Tam Otomatik (onay gerekmez):
├── Ticket kategorize etme
├── Standart yanıt gönderme (DNS, SSL soruları)
└── Raporlama

Onay Gerekli (admin onaylar):
├── Servis askıya alma önerisi
├── Müşteriye özel indirim önerisi
└── Sunucu bakım modu önerisi

Kesinlikle Otomatik Yapamaz:
├── Fatura silme/iptal
├── Ödeme işlemleri
└── Müşteri hesabı silme
```

---

## 🔐 Güvenlik Katmanları

```
Ağ: Cloudflare → Nginx → Node.js (localhost)
Auth: JWT HttpOnly cookie + CSRF token
Şifre: bcrypt round 12
Hassas veri: AES-256-GCM (API key, kart token, WHM token)
Rate limit: Login 5/15dk, API 120/dk
Güvenlik başlıkları: Helmet.js
Input: express-validator + sanitize-html
Log: Tüm işlemler audit_log'a yazılır (KVKK)
SSH: Sadece key ile giriş, şifre kapalı
Firewall: UFW (sadece 80, 443, SSH portu)
```

---

## ⚖️ KVKK & Hukuki Uyum

```
Zorunlu Belgeler:
├── Aydınlatma Metni
├── Gizlilik Politikası
├── Çerez Politikası
├── Kullanım Şartları
├── Hizmet Sözleşmesi (Mesafeli Satış)
└── SLA

Teknik Gereklilikler:
├── Kayıt sırasında ayrı ayrı rıza onayları
├── Pazarlama e-postası ayrı onay (opsiyonel)
├── Yurt dışı aktarım onayı (Hetzner DE sunucuları)
├── Veri görüntüleme/silme/indirme (Madde 11)
├── 30 gün yanıt süresi (otomatik hatırlatma)
├── Veri ihlali bildirim sistemi (72 saat KVK)
├── Audit log (2 yıl saklama - BTK 5651)
└── Fatura 10 yıl saklama (VUK)

Kart Güvenliği (PCI-DSS):
├── Kart numarası/CVV hiç saklanmaz
├── Sadece İyzico token saklanır (şifreli)
└── Payment log'larında kart bilgisi geçmez
```

---

## 🌐 API Endpoint Listesi

### Auth

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
```

### Kullanıcı

```
GET    /api/users/me
PUT    /api/users/me
GET    /api/users/me/cards
DELETE /api/users/me/cards/:id
GET    /api/users/me/data          # KVKK - verileri görüntüle
GET    /api/users/me/data/export   # KVKK - verileri indir
DELETE /api/users/me               # KVKK - hesap sil
PUT    /api/users/me/consents      # Rıza güncelle
```

### Servisler

```
GET    /api/services
GET    /api/services/:id
POST   /api/services/vps
POST   /api/services/hosting
DELETE /api/services/:id
PUT    /api/services/:id/cancel
```

### Hetzner VPS Aksiyonları

```
POST /api/hetzner/:id/poweron
POST /api/hetzner/:id/poweroff
POST /api/hetzner/:id/reboot
POST /api/hetzner/:id/reset
POST /api/hetzner/:id/rebuild
POST /api/hetzner/:id/snapshot
GET  /api/hetzner/:id/snapshots
DELETE /api/hetzner/:id/snapshots/:snapshotId
POST /api/hetzner/:id/console
POST /api/hetzner/:id/backup/enable
POST /api/hetzner/:id/backup/disable
GET  /api/hetzner/:id/metrics
POST /api/hetzner/:id/firewall
GET  /api/hetzner/:id/floating-ips
POST /api/hetzner/:id/floating-ips
```

### WHM Hosting Aksiyonları

```
POST /api/whm/:id/suspend
POST /api/whm/:id/unsuspend
POST /api/whm/:id/password
GET  /api/whm/:id/stats
GET  /api/whm/:id/databases
POST /api/whm/:id/databases
GET  /api/whm/:id/subdomains
```

### Domainler

```
POST   /api/domains/check
POST   /api/domains/register
GET    /api/domains
GET    /api/domains/:id
POST   /api/domains/:id/renew
PUT    /api/domains/:id/nameservers
PUT    /api/domains/:id/autorenew
GET    /api/domains/:id/dns
POST   /api/domains/:id/dns
DELETE /api/domains/:id/dns/:recordId
```

### Faturalar

```
GET  /api/invoices
GET  /api/invoices/:id
GET  /api/invoices/:id/pdf
POST /api/invoices/:id/pay
POST /api/invoices/:id/pay/saved-card
```

### Ticketlar

```
GET    /api/tickets
POST   /api/tickets
GET    /api/tickets/:id
POST   /api/tickets/:id/reply
PUT    /api/tickets/:id/close
```

### Admin

```
GET    /api/admin/dashboard
GET    /api/admin/clients
GET    /api/admin/clients/:id
PUT    /api/admin/clients/:id/suspend
GET    /api/admin/services
GET    /api/admin/invoices
GET    /api/admin/tickets
PUT    /api/admin/tickets/:id/assign
GET    /api/admin/servers
POST   /api/admin/servers
PUT    /api/admin/servers/:id
DELETE /api/admin/servers/:id
POST   /api/admin/servers/:id/sync
GET    /api/admin/logs
GET    /api/admin/settings
PUT    /api/admin/settings
```

### Webhooks

```
POST /api/webhooks/iyzico
POST /api/webhooks/edm
```

---

## ⚙️ Sistem Ayarları (settings tablosu)

```
[general]
app_name        = "HostPanel"
app_url         = "https://panel.domain.com"
support_email   = "destek@domain.com"
logo_url        = "/assets/logo.png"
language        = "tr"

[company]
company_name    = "Şirket Adı"
company_address = "Adres"
company_city    = "İstanbul"
tax_office      = "Vergi Dairesi"
tax_number      = "Vergi No"
phone           = "0212..."

[billing]
vat_rate        = 20
invoice_prefix  = "ARŞ"
efatura_prefix  = "FAT"
payment_due_days= 7
suspend_after   = 7
warning_days    = "1,3,7"
currency        = "TRY"

[integrations]
hetzner_token         = (şifreli)
whm_host              = (dedicated IP)
whm_port              = 2087
whm_user              = root
whm_token             = (şifreli)
domain_api_user       = (şifreli)
domain_api_pass       = (şifreli)
iyzico_api_key        = (şifreli)
iyzico_secret_key     = (şifreli)
iyzico_base_url       = https://api.iyzipay.com
edm_user              = (şifreli)
edm_pass              = (şifreli)
edm_wsdl              = https://efatura.edmbilisim.com.tr/...
anthropic_api_key     = (şifreli)

[smtp]
smtp_host     = mail.domain.com
smtp_port     = 587
smtp_user     = (şifreli)
smtp_pass     = (şifreli)
smtp_from     = "HostPanel <noreply@domain.com>"
```

---

## 🖥️ Çok Sunucu Yönetimi (ServerManager)

```javascript
// Yeni hosting hesabı açılırken otomatik sunucu seçimi:

ServerManager.getAvailableServer()
  → Aktif + accepts_new=true sunucuları filtrele
  → disk_used < disk_threshold (%80)
  → account_count < account_limit
  → En az dolu olanı seç
  → Uygun yoksa → admin uyarı gönder

// Kapasite cron (her gece 03:00):
ServerManager.syncServerStats()
  → Her sunucu için WHM API'den metrikleri çek
  → DB güncelle
  → Eşik aşıldıysa admin'e e-posta
```

---

## 📧 E-posta Şablonları

```
1. hosgeldin          → Kayıt sonrası
2. email_dogrulama    → E-posta doğrulama linki
3. sifre_sifirla      → Şifre sıfırlama linki
4. servis_hazir       → VPS/Hosting aktif edildi
5. fatura_olusturuldu → Yeni fatura kesildi
6. odeme_alindi       → Ödeme başarılı + fatura PDF
7. odeme_basarisiz    → Ödeme başarısız uyarısı (1,3,7. gün)
8. servis_askiya      → Servis askıya alındı
9. servis_iptal       → Servis iptal edildi
10. ticket_yanit      → Ticket'a yanıt geldi
11. domain_yaklasan   → Domain bitimine 30/7/1 gün kaldı
12. kapasite_uyari    → Admin: sunucu doluyor
```

---

## 🚀 Kurulum & Deploy

### Sunucu Bilgileri

- **OS:** Ubuntu 22.04 LTS
- **Panel VPS IP:** [SUNUCU_IP]
- **SSH:** Key ile giriş (şifre kapalı)
- **SSH Key:** id_ed25519_lethe_epica

### Kurulum Sırası

```bash
# 1. Güvenlik sertleştirme
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
apt install fail2ban -y

# 2. Yazılım kurulumu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs mysql-server redis-server nginx certbot

# 3. MySQL güvenlik
mysql_secure_installation

# 4. Node.js bağımlılıkları
cd /var/www/hostpanel/backend
npm install

# 5. PM2
npm install -g pm2
pm2 start src/index.js --name hostpanel-api
pm2 startup
pm2 save

# 6. Frontend build
cd /var/www/hostpanel/frontend
npm install && npm run build

# 7. Nginx + SSL
certbot --nginx -d panel.domain.com
```

---

## 📝 Geliştirme Notları

### Öncelik Sırası

```
Faz 1 — Backend Temel
  ✅ index.js (yazıldı)
  ✅ models/index.js (yazıldı)
  ✅ middleware/auth.js (yazıldı)
  → auth routes
  → user routes
  → temel service CRUD

Faz 2 — Entegrasyonlar
  → IyzicoService (ödeme + kart saklama)
  → HetznerService (VPS provisioning)
  → WHMService (hosting)
  → DomainService (DomainNameAPI)
  → EDMService (SOAP e-fatura)

Faz 3 — Otomasyon
  → EmailService (şablonlar)
  → CronService (tahsilat motoru)
  → ServerManager (çok sunucu)
  → ClaudeService (AI ajan)

Faz 4 — Frontend
  → Auth sayfaları
  → Müşteri paneli
  → Admin paneli

Faz 5 — Test & Deploy
  → Sunucu sertleştirme
  → Nginx + SSL
  → EDM test ortamı
  → İyzico sandbox
```

### Önemli Kurallar

```
1. API key'ler ASLA log'a yazılmaz
2. Kart numarası/CVV ASLA saklanmaz
3. Hassas veriler DB'de AES-256-GCM şifreli
4. Tüm işlemler audit_log'a yazılır
5. Müşteri verisi silme = anonimleştirme (yasal saklama hariç)
6. E-fatura seri no boşluksuz ve sıralı olmalı (VUK)
7. Para işlemlerinde DECIMAL kullan (float değil)
8. Tüm tarihler UTC, gösterimde TR timezone
```

---

## 🔑 .env Değişkenleri

```env
# Uygulama
NODE_ENV=production
PORT=5000
APP_NAME=HostPanel
APP_URL=https://panel.domain.com

# Veritabanı
DB_HOST=localhost
DB_PORT=3306
DB_NAME=hostpanel
DB_USER=hostpanel_user
DB_PASS=

# JWT
JWT_SECRET=                    # min 64 karakter
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Şifreleme
ENCRYPTION_KEY=                # 32 byte hex

# Hetzner
HETZNER_API_TOKEN=

# WHM
WHM_HOST=
WHM_PORT=2087
WHM_USER=root
WHM_API_TOKEN=

# DomainNameAPI
DOMAIN_API_URL=https://api.domainnameapi.com/DomainNameService.svc
DOMAIN_API_USER=
DOMAIN_API_PASS=

# İyzico
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
IYZICO_BASE_URL=https://api.iyzipay.com

# EDM
EDM_WSDL_URL=
EDM_USER=
EDM_PASS=

# Anthropic
ANTHROPIC_API_KEY=

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin
ADMIN_EMAIL=
ADMIN_PASS=
```
