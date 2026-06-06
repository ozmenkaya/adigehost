import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

const COMPANY_FIELDS: Array<[string, string]> = [
  ['company_title', 'Ünvan'],
  ['company_vkn', 'VKN'],
  ['company_tax_office', 'Vergi Dairesi'],
  ['company_address', 'Adres'],
  ['company_city', 'İl'],
  ['company_district', 'İlçe'],
  ['company_postal_code', 'Posta Kodu'],
  ['company_email', 'E-posta'],
  ['company_phone', 'Telefon'],
  ['company_alias', 'EDM Etiketi (GB/PK alias)'],
];

export default function Settings() {
  const [bank, setBank] = useState<Record<string, string>>({
    bank_name: '',
    bank_iban: '',
    bank_account_holder: '',
    bank_branch: '',
  });
  const [company, setCompany] = useState<Record<string, string>>({});
  const [domain, setDomain] = useState<Record<string, string>>({
    domain_provider: '',
    domain_markup: '1.3',
    vat_rate: '20',
  });
  const [vps, setVps] = useState<Record<string, string>>({
    vps_markup: '1.4',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((r) => {
        setBank((b) => ({ ...b, ...r.data.data.bank }));
        setCompany(r.data.data.company ?? {});
        setDomain((d) => ({ ...d, ...(r.data.data.domain ?? {}) }));
        setVps((v) => ({ ...v, ...(r.data.data.vps ?? {}) }));
      })
      .catch((e) => setError(getApiErrorMessage(e)));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api.put('/admin/settings', { bank, company, domain, vps });
      setMsg('Ayarlar kaydedildi');
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const bankField = (label: string, key: string) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={bank[key] ?? ''}
        onChange={(e) => setBank({ ...bank, [key]: e.target.value })}
        className={inp}
      />
    </div>
  );

  const markup = parseFloat(domain.domain_markup || '1.3');
  const markupPercent = isNaN(markup) ? 30 : Math.round((markup - 1) * 100);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Ayarlar</h1>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={save} className="space-y-6">
        {/* ── Banka ── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">Banka / Havale Bilgileri</h2>
          <p className="text-xs text-slate-500">Müşteri sipariş verdiğinde gösterilir.</p>
          {bankField('Banka Adı', 'bank_name')}
          {bankField('IBAN', 'bank_iban')}
          {bankField('Hesap Sahibi', 'bank_account_holder')}
          {bankField('Şube', 'bank_branch')}
        </div>

        {/* ── Domain Fiyatlama ── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">Domain Fiyatlama</h2>
          <p className="text-xs text-slate-500">
            Müsaitlik sorgusunda kullanılan sağlayıcı ve fiyat hesaplama ayarları.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Varsayılan Sağlayıcı
            </label>
            <select
              value={domain.domain_provider ?? ''}
              onChange={(e) => setDomain({ ...domain, domain_provider: e.target.value })}
              className={inp}
            >
              <option value="">Otomatik (Alantron &gt; DomainNameAPI)</option>
              <option value="alantron">Alantron</option>
              <option value="domainnameapi">DomainNameAPI (Atak Domain)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Kâr Marjı (Markup)
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                max="10"
                value={domain.domain_markup ?? '1.3'}
                onChange={(e) => setDomain({ ...domain, domain_markup: e.target.value })}
                className={inp}
              />
              <p className="mt-1 text-xs text-slate-400">
                1.3 = %30 kâr · 2.0 = %100 kâr · Mevcut:<strong>%{markupPercent}</strong>
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">KDV Oranı (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={domain.vat_rate ?? '20'}
                onChange={(e) => setDomain({ ...domain, vat_rate: e.target.value })}
                className={inp}
              />
              <p className="mt-1 text-xs text-slate-400">
                Fiyatlar müşteriye KDV dahil gösterilir.
              </p>
            </div>
          </div>
        </div>

        {/* ── VPS Fiyatlama ── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">VPS Fiyatlama (Hetzner Cloud)</h2>
          <p className="text-xs text-slate-500">
            Hetzner Cloud'un EUR fiyatları üzerine uygulanan kâr marjı. KDV oranı yukarıdaki
            domain ayarından alınır.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Kâr Marjı (Hetzner Çarpanı)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              max="10"
              value={vps.vps_markup ?? '1.4'}
              onChange={(e) => setVps({ ...vps, vps_markup: e.target.value })}
              className={inp}
            />
            <p className="mt-1 text-xs text-slate-400">
              1.4 = %40 kâr · 2.0 = %100 kâr · Mevcut:{' '}
              <strong>
                %{(() => {
                  const m = parseFloat(vps.vps_markup || '1.4');
                  return isNaN(m) ? 40 : Math.round((m - 1) * 100);
                })()}
              </strong>
            </p>
            <p className="mt-2 text-xs text-slate-500 italic">
              Formül: <code>(EUR fiyat) × USD/TRY × çarpan × (1 + KDV)</code>
            </p>
          </div>
        </div>

        {/* ── Şirket / E-Fatura ── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">Şirket Bilgileri (E-Fatura Satıcı)</h2>
          <p className="text-xs text-slate-500">
            E-fatura / e-arşiv kesiminde "satıcı"olarak kullanılır. Eksiksiz olmalıdır.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {COMPANY_FIELDS.map(([key, label]) => (
              <div
                key={key}
                className={key === 'company_title' || key === 'company_address' ? 'col-span-2' : ''}
              >
                <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                <input
                  value={company[key] ?? ''}
                  onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
                  className={inp}
                />
              </div>
            ))}
          </div>
        </div>

        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Kaydet
        </button>
      </form>
    </div>
  );
}
