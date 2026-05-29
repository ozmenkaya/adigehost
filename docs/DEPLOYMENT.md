# Deployment

Hedef: Ubuntu 22.04 LTS, bare-metal, PM2 + Nginx + Let's Encrypt, Cloudflare önünde.

## 1) Sunucu Hazırlığı

```bash
sudo bash deploy/scripts/setup-server.sh
```

Bu script: sistem güncelleme, UFW (22/80/443), fail2ban, Node 20, MySQL, Redis, Nginx, Certbot, PM2 kurar.

## 2) MySQL

```bash
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE adigehost CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'adigehost_user'@'localhost' IDENTIFIED BY 'GÜÇLÜ_ŞİFRE';"
sudo mysql -e "GRANT ALL PRIVILEGES ON adigehost.* TO 'adigehost_user'@'localhost'; FLUSH PRIVILEGES;"
```

## 3) Kod & Ortam

```bash
cd /var/www
git clone git@github.com:ozmenkaya/adigehost.git
cd adigehost
cp backend/.env.example backend/.env
# Doldur: DB_PASS, JWT_SECRET (openssl rand -hex 48), ENCRYPTION_KEY (openssl rand -hex 32),
#         entegrasyon anahtarları, SMTP, ADMIN_EMAIL/ADMIN_PASS
```

## 4) İlk Deploy

```bash
npm ci
npm run build:backend
npm run migrate --workspace backend
npm run seed --workspace backend
npm run build:frontend
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup
```

## 5) Nginx + SSL

```bash
sudo cp deploy/nginx/adigehost.conf /etc/nginx/sites-available/adigehost.conf
sudo ln -s /etc/nginx/sites-available/adigehost.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d panel.adigehost.com
```

## Sonraki Deploy'lar (sıfır-kesinti)

```bash
cd /var/www/adigehost
bash deploy/scripts/deploy.sh
```

(git pull → npm ci → build → migrate → `pm2 reload`)

## Cloudflare

- DNS: A kaydı panel.adigehost.com → sunucu IP, proxy (turuncu bulut) açık.
- SSL/TLS modu: **Full (strict)** (origin'de Let's Encrypt olduğundan).
- Nginx `X-Forwarded-For` ile gerçek IP alınır (`trust proxy` açık).

## Yedekleme

- MySQL: günlük `mysqldump` + Hetzner Volume/Snapshot.
- `.env` ve `ENCRYPTION_KEY` güvenli bir kasada ayrıca yedeklenmeli.

## İzleme

```bash
pm2 status
pm2 logs adigehost-api
curl -s https://panel.adigehost.com/api/health/ready | jq
```
