import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';

interface Company {
  company_title?: string;
  company_vkn?: string;
  company_tax_office?: string;
  company_address?: string;
  company_city?: string;
  company_district?: string;
  company_postal_code?: string;
  company_email?: string;
  company_phone?: string;
}

interface PageDef {
  slug: string;
  title: string;
  content: (c: Company) => ReactNode;
}

const PAGES: PageDef[] = [
  {
    slug: 'hakkimizda',
    title: 'Hakkımızda',
    content: (c) => (
      <>
        <p>
          <strong>AdigeHost</strong>, Türkiye odaklı kurumsal hosting, VPS ve domain çözümleri sunan
          bir bilişim hizmetleri firmasıdır. Müşterilerimize sunduğumuz hizmetlerde hız,
          güvenilirlik ve şeffaflık önceliklerimizdir.
        </p>
        <h3>Hizmetlerimiz</h3>
        <ul>
          <li>WordPress için optimize edilmiş paylaşımlı hosting paketleri</li>
          <li>Domain kayıt, yenileme ve transfer hizmetleri (.com, .com.tr ve 40+ TLD)</li>
          <li>Bulut VPS sunucuları</li>
          <li>E-posta hizmetleri (DKIM/SPF/DMARC imzalı)</li>
          <li>7/24 teknik destek</li>
        </ul>
        <h3>Neden AdigeHost?</h3>
        <ul>
          <li>
            <strong>Hızlı Kurulum:</strong>Ödeme onayının ardından dakikalar içinde aktif.
          </li>
          <li>
            <strong>Güvenli Altyapı:</strong>SSL sertifikası, DDoS koruması ve düzenli yedekleme.
          </li>
          <li>
            <strong>Türkiye Odaklı:</strong>Havale/EFT ödeme, Türkçe destek, e-fatura.
          </li>
          <li>
            <strong>Şeffaf Fiyat:</strong>KDV dahil net fiyatlar, gizli ücret yok.
          </li>
        </ul>
        <h3>İletişim</h3>
        <p>
          {c.company_title && (
            <>
              <strong>Firma:</strong>
              {c.company_title}
              <br />
            </>
          )}
          {c.company_address && (
            <>
              <strong>Adres:</strong>
              {c.company_address}, {c.company_district}/{c.company_city} {c.company_postal_code}
              <br />
            </>
          )}
          {c.company_email && (
            <>
              <strong>E-posta:</strong>
              <a href={`mailto:destek@adigehost.tr`}>destek@adigehost.tr</a>
              <br />
            </>
          )}
          {c.company_phone && (
            <>
              <strong>Telefon:</strong>
              {c.company_phone}
              <br />
            </>
          )}
          {c.company_vkn && (
            <>
              <strong>VKN/TCKN:</strong>
              {c.company_vkn}
              <br />
            </>
          )}
          {c.company_tax_office && (
            <>
              <strong>Vergi Dairesi:</strong>
              {c.company_tax_office}
              <br />
            </>
          )}
        </p>
      </>
    ),
  },
  {
    slug: 'ssl-sertifikasi',
    title: 'SSL Sertifikası',
    content: () => (
      <>
        <p>
          AdigeHost web sitesi ve müşteri paneli<strong>SSL sertifikası</strong>ile korunmaktadır.
          Tarayıcı adres çubuğundaki<strong>kilit simgesi</strong>ve<code>https://</code>ön eki
          bunun doğrulamasıdır.
        </p>
        <h3>Kullanılan Teknolojiler</h3>
        <ul>
          <li>
            <strong>SSL/TLS Protokolü:</strong>TLS 1.2 ve TLS 1.3
          </li>
          <li>
            <strong>Sertifika Sağlayıcı:</strong>Let's Encrypt (ISRG)
          </li>
          <li>
            <strong>Şifreleme:</strong>ECDHE + AES-256-GCM
          </li>
          <li>
            <strong>Otomatik Yenileme:</strong>Sertifika 90 günde bir otomatik yenilenir
          </li>
        </ul>
        <h3>Hangi Veriler Korunuyor?</h3>
        <ul>
          <li>Giriş bilgileri (e-posta, şifre)</li>
          <li>Kişisel veriler (ad, adres, telefon, e-posta)</li>
          <li>Ödeme bilgileri</li>
          <li>Müşteri paneli işlemleri</li>
        </ul>
        <p>
          Müşterilerimize sağladığımız hosting paketlerine de
          <strong>ücretsiz Let's Encrypt SSL sertifikası</strong>dahildir.
        </p>
      </>
    ),
  },
  {
    slug: 'teslimat-ve-iade',
    title: 'Teslimat ve İade Şartları',
    content: () => (
      <>
        <h3>Hizmet Teslim Süreci</h3>
        <p>
          AdigeHost tarafından sağlanan tüm hizmetler<strong>dijital ortamda anında</strong> teslim
          edilir.
        </p>
        <ul>
          <li>
            <strong>Hosting paketleri:</strong>Ödeme onayını takiben
            <strong>en geç 1 saat içinde</strong>aktive edilir; cPanel giriş bilgileri e-posta ile
            gönderilir.
          </li>
          <li>
            <strong>Domain kaydı:</strong>Ödeme onayı sonrası anında, ilgili registrar üzerinden
            kayıt edilir.
          </li>
          <li>
            <strong>VPS sunucular:</strong>Ödeme onayını takiben
            <strong>en geç 30 dakika içinde</strong>kurulur; root erişim bilgileri e-posta ile
            iletilir.
          </li>
        </ul>

        <h3>Cayma Hakkı (Mesafeli Sözleşmeler Yönetmeliği Madde 15)</h3>
        <p>
          6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ilgili mevzuat gereği,{' '}
          <strong>
            elektronik ortamda anında ifa edilen dijital içerik ve hizmetlerde tüketicinin cayma
            hakkı bulunmamaktadır.
          </strong>
          Hizmetin sunulmaya başlanmasıyla birlikte (hosting hesabının açılması, domain'in tescil
          edilmesi vb.) iade yapılmaz.
        </p>

        <h3>Ödeme İadesi (İstisnai Durumlar)</h3>
        <p>İstisnai durumlarda iade aşağıdaki şartlarla yapılabilir:</p>
        <ul>
          <li>
            Hizmet henüz aktive edilmemiş ise (ödeme yapılmış fakat hosting/domain
            provision'lanmamış)
          </li>
          <li>Teknik bir aksaklık nedeniyle hizmetin sunulamadığı durumlarda</li>
          <li>AdigeHost kaynaklı hatalardan dolayı hizmetin sürekli kullanılamadığı durumlarda</li>
        </ul>
        <p>
          İade talepleri<a href="mailto:destek@adigehost.tr">destek@adigehost.tr</a>adresine fatura
          numarası belirtilerek iletilmelidir. Onaylanan iadeler <strong>14 iş günü içinde</strong>
          aynı ödeme yöntemiyle gerçekleştirilir.
        </p>

        <h3>Domain Kayıtları</h3>
        <p>
          Domain (alan adı) kayıtları, kayıt anından itibaren ilgili registrar (Alantron, ICANN)
          kuralları gereğince<strong>iade edilemez ve geri alınamaz</strong>. Yanlış yazılmış domain
          adlarının kayıt sonrası değiştirilmesi mümkün değildir.
        </p>
      </>
    ),
  },
  {
    slug: 'gizlilik',
    title: 'Gizlilik Sözleşmesi (KVKK Aydınlatma Metni)',
    content: (c) => (
      <>
        <p>
          <strong>{c.company_title ?? 'AdigeHost'}</strong>("biz", "AdigeHost") olarak, 6698 sayılı
          Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında müşterilerimizin gizliliğine ve
          kişisel verilerinin güvenliğine önem veriyoruz.
        </p>

        <h3>Toplanan Veriler</h3>
        <ul>
          <li>
            <strong>Kimlik:</strong>Ad, soyad, TCKN/VKN, vergi dairesi
          </li>
          <li>
            <strong>İletişim:</strong>E-posta, telefon, posta adresi
          </li>
          <li>
            <strong>Müşteri işlem:</strong>Sipariş geçmişi, fatura kayıtları, hizmet kullanımı
          </li>
          <li>
            <strong>Teknik:</strong>IP adresi, çerez verisi, oturum logları
          </li>
          <li>
            <strong>Ödeme:</strong>Banka havale dekontu (kart bilgileri SAKLANMAZ — İyzico tarafında
            işlenir)
          </li>
        </ul>

        <h3>Verilerin Kullanım Amacı</h3>
        <ul>
          <li>Hizmetin sunulması ve sürdürülmesi (hosting, domain, VPS)</li>
          <li>Yasal yükümlülüklerin yerine getirilmesi (e-fatura, VUK)</li>
          <li>Müşteri destek ve iletişim</li>
          <li>Hizmet kalitesinin iyileştirilmesi</li>
          <li>Mevzuat gereği bilgi saklama (en az 10 yıl mali kayıtlar)</li>
        </ul>

        <h3>Verilerin Paylaşımı</h3>
        <p>Verileriniz aşağıdaki yerlerle yasal zorunluluk veya hizmet gereği paylaşılabilir:</p>
        <ul>
          <li>
            <strong>Domain registrar'ları:</strong>Alantron, ICANN (WHOIS kayıtları)
          </li>
          <li>
            <strong>E-Fatura entegratörü:</strong>EDM Bilişim (Gelir İdaresi Başkanlığı)
          </li>
          <li>
            <strong>Ödeme kurulları:</strong>İyzico (kredi kartı için), Bankalar (havale için)
          </li>
          <li>
            <strong>Yetkili merciler:</strong>Mahkeme/savcılık talepleri
          </li>
        </ul>

        <h3>KVKK Hakları (Madde 11)</h3>
        <p>Kişisel verilerinize ilişkin aşağıdaki haklara sahipsiniz:</p>
        <ul>
          <li>Verilerinizin işlenip işlenmediğini öğrenme</li>
          <li>İşlenen veriler hakkında bilgi talep etme</li>
          <li>İşleme amacını öğrenme</li>
          <li>Yurt içi/dışı paylaşılan üçüncü kişileri bilme</li>
          <li>Eksik/yanlış verilerin düzeltilmesini isteme</li>
          <li>Silinmesini/yok edilmesini isteme (yasal saklama süreleri hariç)</li>
        </ul>
        <p>
          Talepleriniz için:<a href="mailto:destek@adigehost.tr">destek@adigehost.tr</a>
        </p>

        <h3>Çerez Kullanımı</h3>
        <p>
          Web sitemiz yalnızca<strong>oturum yönetimi</strong>ve<strong>sepet</strong> amacıyla
          çerez kullanır. Reklam ve takip çerezleri kullanılmaz.
        </p>

        <h3>Veri Güvenliği</h3>
        <p>
          Veriler AES-256-GCM şifrelemesi ile saklanır, şifreler bcrypt ile hash'lenir, tüm iletişim
          TLS 1.2+ üzerinden korunur.
        </p>
      </>
    ),
  },
  {
    slug: 'mesafeli-satis',
    title: 'Mesafeli Satış Sözleşmesi',
    content: (c) => (
      <>
        <h3>MADDE 1 — TARAFLAR</h3>
        <p>
          <strong>SATICI:</strong>
          {c.company_title ?? '—'}
          <br />
          Adres: {c.company_address}, {c.company_district}/{c.company_city} {c.company_postal_code}
          <br />
          VKN/TCKN: {c.company_vkn}
          <br />
          Vergi Dairesi: {c.company_tax_office}
          <br />
          E-posta: destek@adigehost.tr
          <br />
          Telefon: {c.company_phone}
          <br />
        </p>
        <p>
          <strong>ALICI:</strong>Sipariş esnasında üyelik formunda belirtmiş olduğu kişi/firma.
        </p>

        <h3>MADDE 2 — SÖZLEŞMENİN KONUSU</h3>
        <p>
          İşbu sözleşme, ALICI'nın www.adigehost.tr internet sitesinden elektronik ortamda sipariş
          verdiği aşağıda nitelikleri ve satış fiyatı belirtilen ürünlerin/hizmetlerin satışı ile
          ilgili olarak<strong>6502 sayılı Tüketicinin Korunması Hakkında Kanun</strong> ve
          <strong>Mesafeli Sözleşmeler Yönetmeliği</strong>hükümleri çerçevesinde tarafların hak ve
          yükümlülüklerinin saptanmasıdır.
        </p>

        <h3>MADDE 3 — SÖZLEŞME KONUSU HİZMETLER</h3>
        <p>
          Ürünlerin/hizmetlerin tipi, miktarı, marka/modeli, satış bedeli, ödeme şekli, sipariş
          tarihi<strong>"Sipariş Onay E-postası"</strong>ve<strong>Fatura</strong>'da belirtildiği
          gibidir.
        </p>

        <h3>MADDE 4 — TESLİMAT</h3>
        <p>
          Hizmetler dijital ortamda anında teslim edilir (bkz.
          <Link to="/teslimat-ve-iade">Teslimat ve İade Şartları</Link>).
        </p>

        <h3>MADDE 5 — CAYMA HAKKI</h3>
        <p>
          Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesi gereği,
          <strong>elektronik ortamda anında ifa edilen hizmetler</strong>için cayma hakkı
          bulunmamaktadır. Hosting, domain ve VPS hizmetleri bu kapsamdadır.
        </p>

        <h3>MADDE 6 — ÖDEME</h3>
        <p>
          Ödeme; havale/EFT veya İyzico üzerinden kredi/banka kartı ile yapılabilir. ALICI, sipariş
          tutarını teslim almasından önce ödemekle yükümlüdür.
        </p>

        <h3>MADDE 7 — UYUŞMAZLIKLAR</h3>
        <p>
          İşbu sözleşmeden doğacak uyuşmazlıklarda<strong>Tüketici Hakem Heyetleri</strong> ve
          <strong>Tüketici Mahkemeleri</strong>yetkilidir.
        </p>

        <h3>MADDE 8 — YÜRÜRLÜK</h3>
        <p>ALICI siteden sipariş verdiğinde işbu sözleşmenin tüm şartlarını kabul etmiş sayılır.</p>
      </>
    ),
  },
];

export default function Legal() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<Company>({});

  useEffect(() => {
    api
      .get('/public/company')
      .then((r) => setCompany(r.data.data ?? {}))
      .catch(() => {});
  }, []);

  const page = PAGES.find((p) => p.slug === slug);

  return (
    <PageBackdrop>
      <ShopHeader back={{ label: '← Anasayfa', to: '/' }} />

      <main className="mx-auto max-w-3xl px-4 py-12">
        {page ? (
          <article className="glass prose-content animate-fade-up rounded-2xl p-8">
            <h1 className="mb-2 text-3xl font-bold text-white">{page.title}</h1>
            <p className="mb-6 text-xs text-slate-500">
              Son güncelleme: {new Date().toLocaleDateString('tr-TR')}
            </p>
            <div className="space-y-3 leading-relaxed text-slate-300">{page.content(company)}</div>
          </article>
        ) : (
          <div className="space-y-3">
            <h1 className="mb-6 text-3xl font-bold text-white">Yasal Sayfalar</h1>
            {PAGES.map((p) => (
              <Link
                key={p.slug}
                to={`/legal/${p.slug}`}
                className="block rounded-xl glass p-4 transition hover:-translate-y-0.5 hover:border-brand-400/40"
              >
                <div className="font-semibold text-white">{p.title}</div>
                <div className="text-sm text-slate-500">/legal/{p.slug}</div>
              </Link>
            ))}
          </div>
        )}

        <style>{`
 .prose-content h3 { font-size: 1.125rem; font-weight: 700; margin: 1.5rem 0 0.5rem; color: #ffffff; }
 .prose-content ul { list-style: disc; margin-left: 1.5rem; }
 .prose-content li { margin: 0.25rem 0; }
 .prose-content a { color: #93c5fd; text-decoration: underline; }
 .prose-content a:hover { color: #bfdbfe; }
 .prose-content strong { color: #f1f5f9; }
 .prose-content code { background: rgba(255,255,255,0.08); padding: 0 0.4rem; border-radius: 0.25rem; font-size: 0.875em; color: #e0f2fe; }
 `}</style>
      </main>

      <ShopFooter companyTitle={company.company_title ?? 'AdigeHost'} />
    </PageBackdrop>
  );
}
