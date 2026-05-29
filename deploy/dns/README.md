# Self-hosted DNS (BIND9)

`adigehost.tr` domaini bu sunucudaki BIND9 ile **authoritative** olarak servis edilir.
Sunucu: `lethe` — IPv4 `91.99.186.98`, IPv6 `2a01:4f8:c010:86ec::1`.

## Dosyalar
- `named.conf.options` → `/etc/bind/named.conf.options` (authoritative-only, recursion kapalı)
- `named.conf.local`   → `/etc/bind/named.conf.local` (zone tanımı)
- `db.adigehost.tr`    → `/etc/bind/zones/db.adigehost.tr` (zone kayıtları)

## Kurulum
```bash
apt-get install -y bind9 bind9utils
cp deploy/dns/named.conf.options /etc/bind/named.conf.options
cp deploy/dns/named.conf.local   /etc/bind/named.conf.local
mkdir -p /etc/bind/zones
cp deploy/dns/db.adigehost.tr    /etc/bind/zones/db.adigehost.tr
named-checkconf
named-checkzone adigehost.tr /etc/bind/zones/db.adigehost.tr
systemctl restart named
ufw allow 53/tcp && ufw allow 53/udp
```

## Zone değişikliği yaparken
`db.adigehost.tr` içindeki **Serial** numarasını her değişiklikte ARTIR (YYYYMMDDnn),
yoksa secondary/cache güncellenmez. Ardından:
```bash
named-checkzone adigehost.tr /etc/bind/zones/db.adigehost.tr && rndc reload adigehost.tr
```

## Registrar (METUnic) tarafında yapılması gerekenler
1. **Child nameserver / glue kayıtları** oluştur:
   - `ns1.adigehost.tr` → `91.99.186.98`
   - `ns2.adigehost.tr` → `91.99.186.98`
2. Domainin **nameserver'larını** şu ikisi yap: `ns1.adigehost.tr`, `ns2.adigehost.tr`
3. Yayılmayı bekle (dakikalar–saatler).

## Doğrulama (yayıldıktan sonra)
```bash
dig @8.8.8.8 +short adigehost.tr NS         # ns1/ns2.adigehost.tr dönmeli
dig @8.8.8.8 +short panel.adigehost.tr A    # 91.99.186.98 dönmeli
```

## Güvenlik notu
- Sunucu açık resolver DEĞİL (`recursion no`) — dış domain sorgularına REFUSED döner.
- Tek sunucu = tek hata noktası. Yüksek erişilebilirlik için `ns2` ileride ikinci bir
  sunucuya (farklı IP, secondary zone) taşınmalı.
