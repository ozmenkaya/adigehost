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
  server?: { name: string } | null;
}

interface EmailAccount {
  email: string;
  login: string;
  domain: string;
  quota: number;
  diskused: number;
  diskusedpercent: number;
}

type Tab = 'emails' | 'databases' | 'subdomains' | 'settings';

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function UsageBar({ pct }: { pct: number }) {
  const p = Math.min(100, Math.round(pct));
  const color = p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-9 text-right text-xs text-slate-400">{p}%</span>
    </div>
  );
}

export default function HostingDetail() {
  const { id } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [tab, setTab] = useState<Tab>('emails');

  // email state
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [newLogin, setNewLogin] = useState('');
  const [newEmailPass, setNewEmailPass] = useState('');
  const [newQuota, setNewQuota] = useState(250);
  const [addingEmail, setAddingEmail] = useState(false);
  const [changingPass, setChangingPass] = useState<string | null>(null);
  const [passMap, setPassMap] = useState<Record<string, string>>({});

  // db state
  const [databases, setDatabases] = useState<string[]>([]);
  const [newDb, setNewDb] = useState('');

  // subdomain state
  const [subdomains, setSubdomains] = useState<unknown[]>([]);

  // cpanel password
  const [newCpanelPass, setNewCpanelPass] = useState('');

  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const flash = (m: string, isErr = false) => {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setMsg(''); setError(''); }, 5000);
  };

  const loadService = async () => {
    const s = await api.get(`/services/${id}`);
    setService(s.data.data);
  };

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

  const loadDatabases = async () => {
    try {
      const r = await api.get(`/whm/${id}/databases`);
      const data = r.data.data;
      setDatabases(
        Array.isArray(data)
          ? data.map((x: { database?: string } | string) =>
              typeof x === 'string' ? x : (x.database ?? JSON.stringify(x)),
            )
          : [],
      );
    } catch { /* sessiz */ }
  };

  const loadSubdomains = async () => {
    try {
      const r = await api.get(`/whm/${id}/subdomains`);
      setSubdomains(Array.isArray(r.data.data) ? r.data.data : []);
    } catch { /* sessiz */ }
  };

  useEffect(() => {
    void loadService();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === 'emails') void loadEmails();
    if (tab === 'databases') void loadDatabases();
    if (tab === 'subdomains') void loadSubdomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const domain = service?.domain ?? service?.name ?? '';

  // ── E-posta: ekle ──────────────────────────────────────────────────────────
  const addEmail = async (e: FormEvent) => {
    e.preventDefault();
    setAddingEmail(true);
    try {
      await api.post(`/whm/${id}/emails`, {
        login: newLogin,
        password: newEmailPass,
        quota: newQuota,
      });
      setNewLogin('');
      setNewEmailPass('');
      setNewQuota(250);
      flash(`${newLogin}@${domain} oluşturuldu`);
      void loadEmails();
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    } finally {
      setAddingEmail(false);
    }
  };

  // ── E-posta: sil ──────────────────────────────────────────────────────────
  const deleteEmail = async (login: string) => {
    if (!confirm(`${login}@${domain} silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api.delete(`/whm/${id}/emails/${login}`);
      flash(`${login}@${domain} silindi`);
      void loadEmails();
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    }
  };

  // ── E-posta: şifre değiştir ────────────────────────────────────────────────
  const changeEmailPass = async (e: FormEvent, login: string) => {
    e.preventDefault();
    const pw = passMap[login] ?? '';
    if (pw.length < 8) return;
    setChangingPass(login);
    try {
      await api.put(`/whm/${id}/emails/${login}/password`, { password: pw });
      setPassMap((m) => ({ ...m, [login]: '' }));
      flash(`${login}@${domain} şifresi güncellendi`);
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    } finally {
      setChangingPass(null);
    }
  };

  // ── DB: oluştur ────────────────────────────────────────────────────────────
  const createDatabase = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/whm/${id}/databases`, { name: newDb });
      setNewDb('');
      flash('Veritabanı oluşturuldu');
      void loadDatabases();
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    }
  };

  // ── cPanel şifre ──────────────────────────────────────────────────────────
  const changeCpanelPass = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/whm/${id}/password`, { password: newCpanelPass });
      setNewCpanelPass('');
      flash('cPanel şifresi güncellendi');
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    }
  };

  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500';

  if (!service) return <div className="text-slate-400">Yükleniyor…</div>;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'emails', label: '✉ E-posta' },
    { key: 'databases', label: '🗄 Veritabanları' },
    { key: 'subdomains', label: '🌐 Subdomainler' },
    { key: 'settings', label: '⚙ Ayarlar' },
  ];

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
            </span>{' '}
            · cPanel: <span className="font-mono">{service.config?.cpanelUser ?? '—'}</span>
            {service.server?.name && ` · ${service.server.name}`}
          </p>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Sekmeler */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── E-POSTA ─────────────────────────────────────────────────────── */}
      {tab === 'emails' && (
        <div className="space-y-4">
          {/* Mevcut hesaplar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">
                E-posta Hesapları{' '}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={() => void loadEmails()}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{acc.email}</p>
                        <p className="text-xs text-slate-400">
                          {fmtBytes(acc.diskused)} kullanıldı
                          {acc.quota > 0 ? ` / ${acc.quota} MB` : ' / Sınırsız'}
                        </p>
                        {acc.quota > 0 && <UsageBar pct={acc.diskusedpercent} />}
                      </div>
                      <button
                        onClick={() => deleteEmail(acc.login)}
                        className="ml-4 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                    {/* Şifre değiştir satırı */}
                    <form
                      onSubmit={(e) => changeEmailPass(e, acc.login)}
                      className="mt-2 flex gap-2"
                    >
                      <input
                        type="password"
                        placeholder="Yeni şifre (min 8)"
                        minLength={8}
                        value={passMap[acc.login] ?? ''}
                        onChange={(e) =>
                          setPassMap((m) => ({ ...m, [acc.login]: e.target.value }))
                        }
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
                ))}
              </div>
            )}
          </div>

          {/* Yeni hesap ekle */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Yeni E-posta Hesabı</h2>
            <form onSubmit={addEmail} className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  required
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value.toLowerCase())}
                  placeholder="kullanici"
                  className={`flex-1 ${inp}`}
                />
                <span className="text-sm text-slate-500">@{domain}</span>
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
                    className={`flex-1 ${inp}`}
                  />
                  <span className="text-sm text-slate-500">MB</span>
                  <span className="text-xs text-slate-400">(0=∞)</span>
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

      {/* ── VERİTABANLARI ────────────────────────────────────────────────── */}
      {tab === 'databases' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-800">
            Veritabanları{' '}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
              {databases.length}
            </span>
          </h2>
          <ul className="mb-4 space-y-1 text-sm">
            {databases.length === 0 ? (
              <li className="text-slate-400">Henüz veritabanı yok.</li>
            ) : (
              databases.map((d) => (
                <li key={d} className="font-mono text-slate-700 rounded bg-slate-50 px-3 py-1.5">
                  {d}
                </li>
              ))
            )}
          </ul>
          <form onSubmit={createDatabase} className="flex gap-2">
            <input
              value={newDb}
              onChange={(e) => setNewDb(e.target.value)}
              placeholder="veritabani_adi"
              className={`flex-1 ${inp}`}
            />
            <button className="rounded-lg border border-slate-300 px-4 text-sm hover:bg-slate-100">
              Oluştur
            </button>
          </form>
        </div>
      )}

      {/* ── SUBDOMAİNLER ─────────────────────────────────────────────────── */}
      {tab === 'subdomains' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-800">
            Subdomainler{' '}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
              {subdomains.length}
            </span>
          </h2>
          {subdomains.length === 0 ? (
            <p className="text-sm text-slate-400">Subdomain bulunamadı.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {subdomains.map((s, i) => (
                <li key={i} className="font-mono text-slate-700 rounded bg-slate-50 px-3 py-1.5">
                  {typeof s === 'string' ? s : JSON.stringify(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── AYARLAR ──────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-4">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 font-semibold text-slate-800">Hesap Bilgileri</h2>
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
                <dd className={service.status === 'active' ? 'text-green-600' : 'text-amber-500'}>
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
