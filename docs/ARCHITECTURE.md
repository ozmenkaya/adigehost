# Mimari

## Genel Akış

```
İstemci (tarayıcı)
   │  HTTPS
Cloudflare (CDN/DDoS)
   │
Nginx (reverse proxy + SSL termination)
   ├── /            → frontend/dist (statik SPA)
   └── /api/*       → 127.0.0.1:5000 (PM2 cluster, Node/Express)
                         │
                ┌────────┼─────────────┐
              MySQL 8   Redis        Harici API'ler
            (Sequelize) (cache/      (Hetzner, WHM,
                         queue/        İyzico, EDM,
                         rate-limit)   DomainNameAPI,
                                       Anthropic)
```

## Backend Katmanları

1. **config/** — env doğrulama (zod, fail-fast), DB, Redis, logger.
2. **middleware/** — auth (JWT), rateLimiter (Redis store), validate (zod), sanitize (XSS), errorHandler.
3. **models/** — Sequelize modelleri + ilişkiler (`index.ts`).
4. **routes/** — Express router'ları; `routes/index.ts` montaj noktası.
5. **services/** — iş mantığı & harici entegrasyonlar.
6. **kvkk/** — rıza, veri talebi, saklama politikaları.
7. **security/** — encryption (AES-256-GCM), password (bcrypt), tokens (JWT + refresh).
8. **jobs/** — Bull kuyrukları + node-cron zamanlayıcı.
9. **utils/** — ApiError, asyncHandler, helpers, migrate, seed.

## Kimlik Doğrulama

- **Access token:** JWT (15dk), `Authorization: Bearer` veya `access_token` HttpOnly cookie.
- **Refresh token:** opak rastgele değer, Redis'te saklanır → sunucu tarafında iptal edilebilir.
- Refresh'te **rotation** (eski token silinir, yenisi verilir).

## Güvenlik

- Helmet başlıkları, CORS allowlist, Redis tabanlı rate limit (login 5/15dk, API 120/dk).
- Tüm girdiler zod ile doğrulanır + sanitize-html ile temizlenir.
- Hassas alanlar (whm_token, kart token, api key) DB'de AES-256-GCM şifreli.
- Audit log (activity_logs) — KVKK/BTK uyumu.

## Veri Modeli

13 tablo: users, servers, services, invoices, invoice_items, payments, saved_cards,
tickets, ticket_replies, domains, consents, activity_logs, settings.
Detaylı şema: `docs/HOSTPANEL_PROJECT.md` → "Veritabanı Şeması".

## Ölçeklenme Notları

- PM2 cluster (2+ instance). Cron yalnızca `NODE_APP_INSTANCE=0`'da çalışır.
- Rate-limit ve refresh-token Redis'te → çok-instance tutarlı.
- Ağır işler (provisioning, e-fatura, e-posta) Bull kuyruğuna alınır.
