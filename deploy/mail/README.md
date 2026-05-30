# Mail Sunucusu (Postfix + OpenDKIM)

`adigehost.tr` adına e-posta gönderimi. DNS kayıtları kendi BIND zone'umuzda
(bkz. `deploy/dns/db.adigehost.tr`).

## Bileşenler

- **Postfix** — SMTP gönderim (mail.adigehost.tr). Uygulama `127.0.0.1:25` üzerinden
  kimlik doğrulamasız relay eder (sadece localhost).
- **OpenDKIM** — giden maili imzalar (selector: `mail`, 2048-bit). Socket `localhost:8891`.

## Kurulum (yeni sunucuda)

```bash
DEBIAN_FRONTEND=noninteractive apt-get install -y postfix opendkim opendkim-tools
# DKIM anahtarı
mkdir -p /etc/opendkim/keys/adigehost.tr
cd /etc/opendkim/keys/adigehost.tr && opendkim-genkey -b 2048 -d adigehost.tr -s mail
chown -R opendkim:opendkim /etc/opendkim
# Configleri kopyala
cp deploy/mail/opendkim.conf /etc/opendkim.conf
cp deploy/mail/{key.table,signing.table,trusted.hosts} /etc/opendkim/
# Postfix ayarları (postfix-main.cf referans; postconf -e ile uygula)
systemctl restart opendkim postfix
ufw allow 25/tcp
```

## DNS kayıtları (zone'da mevcut)

| Tip         | Ad               | Değer                                                  |
| ----------- | ---------------- | ------------------------------------------------------ |
| A           | mail             | 91.99.186.98                                           |
| MX          | @                | 10 mail.adigehost.tr                                   |
| TXT (SPF)   | @                | `v=spf1 a mx ip4:91.99.186.98 ip6:... ~all`            |
| TXT (DKIM)  | mail.\_domainkey | `v=DKIM1; k=rsa; p=...` (mail.txt)                     |
| TXT (DMARC) | \_dmarc          | `v=DMARC1; p=none; rua=mailto:postmaster@adigehost.tr` |

DKIM public key: `/etc/opendkim/keys/adigehost.tr/mail.txt`. Zone'a eklendikten sonra
`rndc reload adigehost.tr`.

## Doğrulama

```bash
opendkim-testkey -d adigehost.tr -s mail -vvv   # key OK
swaks --to check-auth@verifier.port25.com --from noreply@adigehost.tr --server 127.0.0.1:25
# Rapor /var/mail/root'a düşer → SPF/DKIM/DMARC = pass
```

Son test sonucu: **SPF pass, DKIM pass, DMARC pass**.

## Bilinen / yapılacaklar

- **IPv6 PTR yok** → giden mailde IPv4 tercih ediliyor (`smtp_address_preference = ipv4`).
  En iyi teslimat için Hetzner Console'dan IPv4 PTR'yi `mail.adigehost.tr` yapın.
- `adigehost.tr` mydestination'da → bu domaindeki adresler yereldir; mailbox yok
  (postmaster/noreply/abuse → root alias). Gerçek mailbox (alma/IMAP) için Dovecot gerekir.
- Uygulama tarafı: Entegrasyonlar → SMTP (host 127.0.0.1, port 25).
