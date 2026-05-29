# CLAUDE.md — AdigeHost Geliştirme Bağlamı

Bu dosya Claude Code (ve geliştiriciler) için kalıcı proje bağlamıdır.
Detaylı ürün tanımı için `docs/HOSTPANEL_PROJECT.md` dosyasına bakın.

## Proje

**AdigeHost** — WHMCS alternatifi, Türkiye odaklı hosting/VPS/domain satış & yönetim paneli.
Hedef ölçek: 0–500 müşteri, çok-sunuculu.

## Mimari

Monorepo (npm workspaces):

- `backend/` — Node.js 20 + Express + Sequelize (MySQL 8) + Redis/Bull, **TypeScript (CommonJS)**
- `frontend/` — React 18 + Vite + TypeScript + TailwindCSS + Zustand
- `deploy/` — Nginx config + sunucu kurulum/deploy scriptleri
- `docs/` — ürün ve mimari dökümanları

Production: **bare-metal**, PM2 (cluster) + Nginx (reverse proxy + SSL) + Let's Encrypt, Cloudflare önünde.

## Komutlar

```bash
npm install              # tüm workspace bağımlılıkları
npm run dev              # backend + frontend birlikte (concurrently)
npm run dev:backend      # sadece API (tsx watch)
npm run dev:frontend     # sadece arayüz (vite)
npm run build            # her ikisini derle
npm run typecheck        # tip kontrolü (her iki workspace)
npm run lint             # eslint
npm run format           # prettier yaz
npm run migrate --workspace backend           # şema (güvenli)
npm run migrate --workspace backend -- --alter # şema güncelle (dev)
npm run seed --workspace backend              # admin + varsayılan ayarlar
```

## Kod Kuralları (ÖNEMLİ)

1. **API key / token / şifre ASLA log'a yazılmaz** (logger hassas alanları maskeler ama dikkat).
2. **Kart numarası / CVV ASLA saklanmaz** — sadece İyzico token, AES-256-GCM ile şifreli.
3. Hassas veriler DB'de **AES-256-GCM** (`security/encryption.ts`) ile şifrelenir.
4. Tüm önemli işlemler **audit log**'a yazılır (`services/AuditService.logActivity`).
5. Müşteri verisi silme = **anonimleştirme** (yasal saklama süreleri hariç — KVKK).
6. E-fatura seri no **boşluksuz ve sıralı** olmalı (VUK). `helpers.formatInvoiceNumber`.
7. Para işlemlerinde **DECIMAL** kullan, float değil. Hesap için `helpers.round2`.
8. Tüm tarihler **UTC** saklanır; gösterimde TR timezone'a çevrilir.
9. Route handler'larda `asyncHandler` kullan; hataları `ApiError` ile fırlat.
10. Girdi doğrulama **zod + `validate()` middleware**; XSS için `sanitizeBody`.
11. TypeScript `strict` açık; `any` kullanma (gerekirse `unknown` + daralt).

## Dizin Desenleri

- Model eklerken: `models/<Name>.ts` (class + `init`), ilişkiyi `models/index.ts`'e ekle.
- Endpoint eklerken: `routes/<modul>.ts` Router'ını doldur, `routes/index.ts`'te bağlı.
- Entegrasyon: `services/<X>Service.ts`; config'i `config/env.ts`'ten oku.
- Ağır/async iş: Bull kuyruğu (`jobs/queue.ts`), zamanlı iş: `jobs/scheduler.ts`.

## Geliştirme Yol Haritası (Orkestra)

Bkz. `docs/HOSTPANEL_PROJECT.md` → "Geliştirme Notları / Öncelik Sırası".
Mevcut durum: **iskelet hazır** (config, modeller, middleware, auth dikey kesiti, route/servis stub'ları).

Sıradaki fazlar:

- **Faz 1 (kalan):** users routes (profil + KVKK), services CRUD, forgot/reset/verify-email.
- **Faz 2:** IyzicoService, HetznerService, WHMService, DomainService, EDMService (gerçek entegrasyon).
- **Faz 3:** EmailService şablonları, CronService tahsilat motoru, ServerManager, ClaudeService.
- **Faz 4:** Frontend müşteri & admin panelleri, legal sayfalar.
- **Faz 5:** Test, sunucu sertleştirme, Nginx+SSL, İyzico sandbox, EDM test.

## Önemli Notlar

- `.env` ASLA commit edilmez. Şablon: `backend/.env.example`, `frontend/.env.example`.
- `ENCRYPTION_KEY` = `openssl rand -hex 32`. Değişirse şifreli veriler okunamaz!
- Production'da `migrate --force`/`--alter` veri kaybı riski taşır; versiyonlu migration'a geçilecek.
