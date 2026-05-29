# AdigeHost 🚀

WHMCS alternatifi, **Türkiye odaklı** hosting / VPS / domain satış ve yönetim paneli.
KVKK & e-fatura (EDM) uyumlu, İyzico ödeme entegrasyonlu, Claude AI destekli.

> Hedef ölçek: 0–500 müşteri, çok-sunuculu mimari.

## Teknoloji

| Katman      | Teknoloji                                                                        |
| ----------- | -------------------------------------------------------------------------------- |
| Backend     | Node.js 20, Express, **TypeScript**, Sequelize (MySQL 8), Redis, Bull            |
| Frontend    | React 18, Vite, TypeScript, TailwindCSS, Zustand                                 |
| Auth        | JWT (access 15dk + refresh 7g, HttpOnly cookie)                                  |
| Güvenlik    | bcrypt, AES-256-GCM, Helmet, rate-limit, zod doğrulama                           |
| Altyapı     | PM2 (cluster) + Nginx + Let's Encrypt, Cloudflare                                |
| Entegrasyon | Hetzner Cloud, WHM/cPanel, DomainNameAPI, İyzico, EDM e-fatura, Anthropic Claude |

## Hızlı Başlangıç (Geliştirme)

Gereksinimler: Node 20+, MySQL 8, Redis.

```bash
# 1) Bağımlılıklar
npm install

# 2) Ortam dosyaları
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# backend/.env içinde DB, JWT_SECRET ve ENCRYPTION_KEY'i doldurun:
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   JWT_SECRET=$(openssl rand -hex 48)

# 3) Veritabanı şeması + başlangıç verisi
npm run migrate --workspace backend
npm run seed --workspace backend

# 4) Çalıştır (API :5000, arayüz :5173)
npm run dev
```

## Proje Yapısı

```
adigehost/
├── backend/      # Express + TypeScript API
│   └── src/{config,models,middleware,services,routes,kvkk,security,jobs,utils}
├── frontend/     # React + Vite + TS arayüz
│   └── src/{pages,components,store,hooks,utils}
├── deploy/       # nginx config + setup/deploy scriptleri
├── docs/         # ürün & mimari dökümanları
├── ecosystem.config.cjs   # PM2
└── CLAUDE.md     # geliştirme bağlamı / kod kuralları
```

## Production Kurulum

```bash
# Sunucuda (Ubuntu 22.04, root):
sudo bash deploy/scripts/setup-server.sh     # Node, MySQL, Redis, Nginx, PM2, UFW
# MySQL DB/kullanıcı oluştur, backend/.env doldur, sonra:
bash deploy/scripts/deploy.sh                 # build + migrate + pm2 reload
# Nginx + SSL:
cp deploy/nginx/adigehost.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/adigehost.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d panel.adigehost.com
```

Detaylar: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Dökümanlar

- [Ürün dökümanı](docs/HOSTPANEL_PROJECT.md) — tam özellik & mimari tanımı
- [Mimari](docs/ARCHITECTURE.md)
- [Deploy](docs/DEPLOYMENT.md)
- [Geliştirme bağlamı / kurallar](CLAUDE.md)

## Lisans

Özel (proprietary). Tüm hakları saklıdır.
