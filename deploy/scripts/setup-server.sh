#!/usr/bin/env bash
# ============================================================
# AdigeHost - Sunucu ilk kurulum scripti (Ubuntu 22.04)
# Root olarak çalıştırın:  sudo bash deploy/scripts/setup-server.sh
# ============================================================
set -euo pipefail

echo "==> 1) Sistem güncelleme"
apt-get update -y && apt-get upgrade -y

echo "==> 2) Güvenlik: UFW + fail2ban"
apt-get install -y ufw fail2ban
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "==> 3) Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> 4) MySQL 8, Redis, Nginx, Certbot"
apt-get install -y mysql-server redis-server nginx certbot python3-certbot-nginx
systemctl enable --now mysql redis-server nginx

echo "==> 5) PM2 (global)"
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

echo ""
echo "✅ Temel kurulum bitti. Sonraki adımlar:"
echo "   - mysql_secure_installation"
echo "   - MySQL'de veritabanı/kullanıcı oluştur (CREATE DATABASE adigehost; ...)"
echo "   - /var/www/adigehost altına kodu çek, backend/.env'i doldur"
echo "   - bash deploy/scripts/deploy.sh"
echo "   - cp deploy/nginx/adigehost.conf /etc/nginx/sites-available/ && ln -s ... && nginx -t && systemctl reload nginx"
echo "   - certbot --nginx -d panel.adigehost.com"
