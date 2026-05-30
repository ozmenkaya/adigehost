# Canlı Ortam Durumu (Production)

Son güncelleme: 2026-05-30

## Erişim

- **Panel:** https://panel.adigehost.tr (ve https://adigehost.tr, https://www.adigehost.tr)
- Sunucu: `lethe` (Hetzner) — IPv4 `91.99.186.98`, IPv6 `2a01:4f8:c010:86ec::1`

## Çalışan servisler

| Servis                    | Rol                                        | Durum |
| ------------------------- | ------------------------------------------ | ----- |
| BIND9 (`named`)           | adigehost.tr authoritative DNS (ns1/ns2)   | ✅    |
| MySQL 8                   | veritabanı `adigehost`                     | ✅    |
| Redis                     | cache / queue / rate-limit / refresh token | ✅    |
| Node API (PM2 cluster ×2) | `adigehost-api`, NODE_ENV=production       | ✅    |
| Nginx                     | reverse proxy + statik frontend + SSL      | ✅    |
| Let's Encrypt             | adigehost.tr (+www,+panel), oto-yenileme   | ✅    |
| UFW                       | 22/80/443/53 açık, gerisi kapalı           | ✅    |

## DNS

Self-hosted BIND9 (bkz. `deploy/dns/`). Registry NS = `ns1.adigehost.tr`, `ns2.adigehost.tr` → 91.99.186.98.

## Önemli yollar

- Kod: `/var/www/adigehost`
- Backend env: `/var/www/adigehost/backend/.env` (chmod 600, git'te DEĞİL)
- Secret yedeği: `/root/.adigehost_secrets` (chmod 600)
- Nginx site: `/etc/nginx/sites-available/adigehost-ip.conf` (repo kopyası: `deploy/nginx/adigehost.tr.conf`)
- DNS zone: `/etc/bind/zones/db.adigehost.tr`

## Yönetim komutları

```bash
pm2 status && pm2 logs adigehost-api      # API izleme
systemctl status named mysql redis nginx  # servis durumu
bash deploy/scripts/deploy.sh             # yeni sürüm deploy (git pull→build→migrate→reload)
certbot renew --dry-run                   # SSL yenileme testi
```

## Sertleştirme yapılacaklar (öneri)

- [ ] API'yi `127.0.0.1:5000`'e bağla (şu an 0.0.0.0; UFW dışarı kapatıyor ama defense-in-depth)
- [ ] `fail2ban` kurulumu (SSH brute-force)
- [ ] MySQL otomatik günlük yedek (`mysqldump` + cron)
- [ ] `ns2`'yi farklı bir sunucuya taşı (DNS yüksek erişilebilirlik)
- [ ] Versiyonlu DB migration'lara geçiş (sync yerine)
