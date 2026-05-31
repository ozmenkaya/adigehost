import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Service {
  id: string;
  type: string;
  name: string;
  status: string;
  domain: string | null;
  config: { cpanelUser?: string } | null;
  server?: { name: string; whmHost?: string; whmPort?: number } | null;
}

interface EmailAccount {
  email: string;
  login: string;
  domain: string;
  quota: number;
  diskused: number;
  diskusedpercent: number;
}

type Tab = 'emails' | 'settings';

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function UsageBar({ pct }: { pct: number }) {
  const p = Math.min(100, Math.round(pct));
  const color = p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-amber-400' : 'bg-brand-500';
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-8 text-right text-xs text-slate-400">{p}%</span>
    </div>
  );
}

export default function HostingDetail() {
  const { id } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [tab, setTab] = useState<Tab>('emails');

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [newLogin, setNewLogin] = useState('');
  const [newEmailPass, setNewEmailPass] = useState('');
  const [newQuota, setNewQuota] = useState(250);
  const [addingEmail, setAddingEmail] = useState(false);
  const [changingPass, setChangingPass] = useState<string | null>(null);
  const [passMap, setPassMap] = useState<Record<string, string>>({});

  const [newCpanelPass, setNewCpanelPass] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const flash = (m: string, isErr = false) => {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setMsg(''); setError(''); }, 5000);
  };

  useEffect(() => {
    api.get(`/services/${id}`)
      .then((r) => setService(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === 'emails') void loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const loadEmails = async () => {
    setEmailsLoading(true);
    try {
      const r = await api.get(`/whm/${id}/emails`);
      setEmails(r.data.data ?? []);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    } finally {
      setEmailsLoading(false);
    }
  };

  const domain = service?.domain ?? service?.name ?? '';

  const cpanelUrl = service?.server?.whmHost
    ? `https://${service.server.whmHost}:${service.server.whmPort ?? 2083}`
    : null;

  const addEmail = async (e: FormEvent) => {
    e.preventDefault();
    setAddingEmail(true);
    try {
      await api.post(`/whm/${id}/emails`, { login: newLogin, password: newEmailPass, quota: newQuota });
      flash(`${newLogin}@${domain} oluşturuldu`);
      setNewLogin(''); setNewEmailPass(''); setNewQuota(250);
      void loadEmails();
    } catch (err) { flash(getApiErrorMessage(err), true); }
    finally { setAddingEmail(false); }
  };

  const deleteEmail = async (login: string) => {
    if (!confirm(`${login}@${domain} silinsin mi? Geri alınamaz.`)) return;
    try {
      await api.delete(`/whm/${id}/emails/${login}`);
      flash(`${login}@${domain} silindi`);
      void loadEmails();
    } catch (err) { flash(getApiErrorMessage(err), true); }
  };

  const changeEmailPass = async (e: FormEvent, login: string) => {
    e.preventDefault();
    const pw = passMap[login] ?? '';
    if (pw.length < 8) return;
    setChangingPass(login);
    try {
      await api.put(`/whm/${id}/emails/${login}/password`, { password: pw });
      setPassMap((m) => ({ ...m, [login]: '' }));
      flash(`${login}@${domain} şifresi güncellendi`);
    } catch (err) { flash(getApiErrorMessage(err), true); }
    finally { setChangingPass(null); }
  };

  const changeCpanelPass = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/whm/${id}/password`, { password: newCpanelPass });
      setNewCpanelPass('');
      flash('cPanel şifresi güncellendi');
    } catch (err) { flash(getApiErrorMessage(err), true); }
  };

  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500';

  if (!service) return <div className="text-slate-400">Yükleniyor…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Başlık */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
          <p className="text-sm text-slate-500">
            Hosting ·{' '}
            <span className={service.status === 'active' ? 'text-green-600' : 'text-amber-500'}>
              {service.status}
            </span>
            {service.server?.name && ` · ${service.server.name}`}
          </p>
        </div>

        {/* cPanel butonu */}
        {cpanelUrl && (
          <a
            href={cpanelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V18c0-.55.45-1 1-1s1 .45 1 1v1.93c-3.95-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.05 7.44-7 7.93zM12 8a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>
            cPanel'e Giriş
          </a>
        )}
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Sekmeler */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {([['emails', '✉ E-posta Hesapları'], ['settings', '⚙ Ayarlar']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── E-POSTA ────────────────────────────────────────────────── */}
      {tab === 'emails' && (
        <div className="space-y-4">
          {/* Mevcut hesaplar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">
                Hesaplar{' '}
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                  {emails.length}
                </span>
              </h2>
              <button onClick={() => void loadEmails()} className="text-xs text-brand-600 hover:text-brand-700">
                Yenile
              </button>
            </div>

            {emailsLoading ? (
              <p className="text-sm text-slate-400">Yükleniyor…</p>
            ) : emails.length === 0 ? (
              <p className="text-sm text-slate-400">Henüz e-posta hesabı yok.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {emails.map((acc) => (
                  <div key={acc.email} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{acc.email}</p>
                        <p className="text-xs text-slate-400">
                          {fmtBytes(acc.diskused)} kullanıldı
                          {acc.quota > 0 ? ` / ${acc.quota} MB` : ' / Sınırsız'}
                        </p>
                        {acc.quota > 0 && <UsageBar pct={acc.diskusedpercent} />}
                        {/* Şifre satırı */}
                        <form onSubmit={(e) => changeEmailPass(e, acc.login)} className="mt-2 flex gap-2">
                          <input
                            type="password"
                            placeholder="Yeni şifre (min 8)"
                            minLength={8}
                            value={passMap[acc.login] ?? ''}
                            onChange={(e) => setPassMap((m) => ({ ...m, [acc.login]: e.target.value }))}
                            className={`flex-1 text-xs ${inp}`}
                          />
                          <button
                            type="submit"
                            disabled={changingPass === acc.login || (passMap[acc.login]?.length ?? 0) < 8}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-40"
                          >
                            {changingPass === acc.login ? '…' : 'Şifre Güncelle'}
                          </button>
                        </form>
                      </div>
                      <button
                        onClick={() => deleteEmail(acc.login)}
                        className="mt-0.5 shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Yeni hesap */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Yeni E-posta Hesabı Ekle</h2>
            <form onSubmit={addEmail} className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  required
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, ''))}
                  placeholder="kullanici"
                  className={`flex-1 ${inp}`}
                />
                <span className="text-sm font-medium text-slate-500">@{domain}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="password"
                  minLength={8}
                  value={newEmailPass}
                  onChange={(e) => setNewEmailPass(e.target.value)}
                  placeholder="Şifre (min 8 karakter)"
                  className={inp}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10240}
                    value={newQuota}
                    onChange={(e) => setNewQuota(Number(e.target.value))}
                    className={`w-24 ${inp}`}
                  />
                  <span className="text-sm text-slate-500">MB kota <span className="text-slate-400">(0=∞)</span></span>
                </div>
              </div>
              <button
                disabled={addingEmail}
                className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {addingEmail ? 'Oluşturuluyor…' : '+ Hesap Oluştur'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── AYARLAR ──────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {/* cPanel linki */}
          {cpanelUrl && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <h2 className="mb-1 font-semibold text-orange-800">cPanel Kontrol Paneli</h2>
              <p className="mb-3 text-sm text-orange-700">
                Dosya yöneticisi, e-posta yönlendirme, SSL, Softaculous ve diğer araçlara cPanel üzerinden erişebilirsiniz.
              </p>
              <a
                href={cpanelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
              >
                cPanel'i Aç →
              </a>
              <p className="mt-2 text-xs text-orange-600">
                Kullanıcı adı: <span className="font-mono font-bold">{service.config?.cpanelUser}</span>
              </p>
            </div>
          )}

          {/* cPanel şifre */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-800">cPanel Şifresi Değiştir</h2>
            <form onSubmit={changeCpanelPass} className="flex gap-2">
              <input
                type="password"
                required
                minLength={8}
                value={newCpanelPass}
                onChange={(e) => setNewCpanelPass(e.target.value)}
                placeholder="Yeni şifre (min 8 karakter)"
                className={`flex-1 ${inp}`}
              />
              <button className="rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                Güncelle
              </button>
            </form>
          </div>

          {/* Hesap bilgileri */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Hesap Bilgileri</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-400">Alan Adı</dt>
                <dd className="font-medium text-slate-700">{service.domain ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">cPanel Kullanıcısı</dt>
                <dd className="font-mono text-slate-700">{service.config?.cpanelUser ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Durum</dt>
                <dd className={service.status === 'active' ? 'text-green-600 font-medium' : 'text-amber-500 font-medium'}>
                  {service.status}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Sunucu</dt>
                <dd className="text-slate-700">{service.server?.name ?? '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
