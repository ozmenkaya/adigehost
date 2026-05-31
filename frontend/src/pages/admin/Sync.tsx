import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface WhmAccount {
  serverId: string;
  serverName: string;
  cpanelUser: string;
  domain: string;
  plan: string;
  diskused: string;
  disklimit: string;
  email: string;
  suspended: boolean;
  imported: boolean;
}

interface AlantronDomain {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  config: { provider?: string; registrycode?: number } | null;
  user?: { firstName: string; lastName: string; email: string } | null;
  createdAt: string;
  nextDue?: string | null;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

type Tab = 'whm' | 'alantron';

export default function Sync() {
  const [tab, setTab] = useState<Tab>('whm');

  // WHM
  const [whmAccounts, setWhmAccounts] = useState<WhmAccount[]>([]);
  const [whmLoading, setWhmLoading] = useState(false);
  const [whmError, setWhmError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientMap, setClientMap] = useState<Record<string, string>>({}); // cpanelUser → userId
  const [clients, setClients] = useState<Client[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Alantron
  const [alDomains, setAlDomains] = useState<AlantronDomain[]>([]);
  const [alLoading, setAlLoading] = useState(false);
  const [alNote, setAlNote] = useState('');

  const loadWhm = async () => {
    setWhmLoading(true);
    setWhmError('');
    try {
      const r = await api.get('/admin/sync/whm');
      setWhmAccounts(r.data.data ?? []);
    } catch (e) {
      setWhmError(getApiErrorMessage(e));
    } finally {
      setWhmLoading(false);
    }
  };

  const loadAlantron = async () => {
    setAlLoading(true);
    try {
      const r = await api.get('/admin/sync/alantron');
      setAlDomains(r.data.data ?? []);
      setAlNote(r.data.meta?.note ?? '');
    } catch (e) {
      setAlNote(getApiErrorMessage(e));
    } finally {
      setAlLoading(false);
    }
  };

  const loadClients = async () => {
    const r = await api.get('/admin/clients', { params: { limit: 200 } });
    setClients(r.data.data ?? []);
  };

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    if (tab === 'whm') void loadWhm();
    if (tab === 'alantron') void loadAlantron();
  }, [tab]);

  const toggle = (key: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleAll = () => {
    const notImported = whmAccounts.filter((a) => !a.imported).map((a) => a.cpanelUser);
    setSelected(selected.size === notImported.length ? new Set() : new Set(notImported));
  };

  const importSelected = async () => {
    const toImport = whmAccounts.filter((a) => selected.has(a.cpanelUser));
    // userId atanmamış var mı?
    const missing = toImport.filter((a) => !clientMap[a.cpanelUser]);
    if (missing.length > 0) {
      setWhmError(`Şu hesaplar için müşteri seçilmedi: ${missing.map((a) => a.domain).join(', ')}`);
      return;
    }
    setImporting(true);
    setImportMsg('');
    setWhmError('');
    try {
      const r = await api.post('/admin/sync/whm/import', {
        accounts: toImport.map((a) => ({
          cpanelUser: a.cpanelUser,
          domain: a.domain,
          serverId: a.serverId,
          plan: a.plan,
          userId: clientMap[a.cpanelUser],
        })),
      });
      setImportMsg(r.data.message);
      setSelected(new Set());
      void loadWhm();
    } catch (e) {
      setWhmError(getApiErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const notImportedCount = whmAccounts.filter((a) => !a.imported).length;
  const importedCount = whmAccounts.filter((a) => a.imported).length;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Senkronizasyon</h1>

      {/* Sekmeler */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 max-w-sm">
        <button
          onClick={() => setTab('whm')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'whm' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🗄 WHM Hesapları
        </button>
        <button
          onClick={() => setTab('alantron')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'alantron' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🌐 Alantron
        </button>
      </div>

      {/* ── WHM ─────────────────────────────────────────────────────────── */}
      {tab === 'whm' && (
        <div className="space-y-4">
          {importMsg && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{importMsg}</div>
          )}
          {whmError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{whmError}</div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              {!whmLoading && (
                <>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">
                    Toplam: <b>{whmAccounts.length}</b>
                  </span>
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-700">
                    Kayıtlı: <b>{importedCount}</b>
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">
                    Kayıtsız: <b>{notImportedCount}</b>
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void loadWhm()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                Yenile
              </button>
              {selected.size > 0 && (
                <button
                  onClick={importSelected}
                  disabled={importing}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {importing ? 'Aktarılıyor…' : `✓ ${selected.size} Hesabı Panele Aktar`}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selected.size === notImportedCount && notImportedCount > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3">Domain</th>
                  <th className="px-3 py-3">Kullanıcı</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3">Disk</th>
                  <th className="px-3 py-3">Sunucu</th>
                  <th className="px-3 py-3">Müşteri</th>
                  <th className="px-3 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {whmLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      WHM'den çekiliyor…
                    </td>
                  </tr>
                ) : whmAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      Hesap bulunamadı.
                    </td>
                  </tr>
                ) : (
                  whmAccounts.map((a) => (
                    <tr
                      key={a.cpanelUser}
                      className={`hover:bg-slate-50 ${a.imported ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="rounded"
                          disabled={a.imported}
                          checked={selected.has(a.cpanelUser)}
                          onChange={() => toggle(a.cpanelUser)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800">{a.domain}</div>
                        <div className="text-xs text-slate-400">{a.email}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                        {a.cpanelUser}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{a.plan || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {a.diskused}/{a.disklimit}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{a.serverName}</td>
                      <td className="px-3 py-2.5">
                        {!a.imported && selected.has(a.cpanelUser) ? (
                          <select
                            value={clientMap[a.cpanelUser] ?? ''}
                            onChange={(e) =>
                              setClientMap((m) => ({ ...m, [a.cpanelUser]: e.target.value }))
                            }
                            className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">— Müşteri seç —</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.firstName} {c.lastName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {a.imported ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            ✓ Kayıtlı
                          </span>
                        ) : a.suspended ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                            Askıda
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            Kayıtsız
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ALANTRON ─────────────────────────────────────────────────────── */}
      {tab === 'alantron' && (
        <div className="space-y-4">
          {alNote && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              ℹ️ {alNote}
            </div>
          )}

          {/* Domain ekle formu */}
          <AlantronAddForm
            clients={clients}
            onAdded={() => void loadAlantron()}
          />

          {/* Kayıtlı domainler */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-semibold text-slate-800">
                Kayıtlı Domainler{' '}
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                  {alDomains.length}
                </span>
              </span>
              <button
                onClick={() => void loadAlantron()}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                Yenile
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Müşteri</th>
                  <th className="px-4 py-3">Registrycode</th>
                  <th className="px-4 py-3">Son. Tarihi</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : alDomains.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Henüz domain yok. Yukarıdan ekleyin.
                    </td>
                  </tr>
                ) : (
                  alDomains.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {d.domain ?? d.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {d.user ? `${d.user.firstName} ${d.user.lastName}` : '—'}
                        {d.user?.email && (
                          <div className="text-xs text-slate-400">{d.user.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {d.config?.registrycode ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {d.nextDue ? new Date(d.nextDue).toLocaleDateString('tr-TR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            d.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : d.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={async () => {
                            if (!confirm(`${d.domain ?? d.name} panelden silinsin mi?`)) return;
                            await api.delete(`/admin/sync/alantron/${d.id}`).catch(() => {});
                            void loadAlantron();
                          }}
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alantron domain ekleme formu ────────────────��─────────────────────────────
function AlantronAddForm({
  clients,
  onAdded,
}: {
  clients: Client[];
  onAdded: () => void;
}) {
  const [domain, setDomain] = useState('');
  const [userId, setUserId] = useState('');
  const [registrycode, setRegistrycode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState<'active' | 'pending'>('active');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm w-full';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      await api.post('/admin/sync/alantron/import', {
        domain: domain.trim().toLowerCase(),
        userId,
        registrycode: registrycode ? Number(registrycode) : undefined,
        expiryDate: expiryDate || undefined,
        status,
      });
      setMsg(`${domain} eklendi`);
      setDomain('');
      setRegistrycode('');
      setExpiryDate('');
      setOpen(false);
      onAdded();
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-slate-800">+ Domain Ekle</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {msg && (
        <div className="mx-5 mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</div>
      )}
      {err && (
        <div className="mx-5 mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Domain <span className="text-red-500">*</span>
              </label>
              <input
                required
                placeholder="ornek.com.tr"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Müşteri <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={inp}
              >
                <option value="">— Seçin —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Registrycode <span className="text-slate-400">(opsiyonel)</span>
              </label>
              <input
                type="number"
                placeholder="Alantron iç ID"
                value={registrycode}
                onChange={(e) => setRegistrycode(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Son Kullanma Tarihi <span className="text-slate-400">(opsiyonel)</span>
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={inp}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="font-medium text-slate-600">Durum:</label>
            {(['active', 'pending'] as const).map((s) => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                {s === 'active' ? 'Aktif' : 'Beklemede'}
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              İptal
            </button>
            <button
              disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Kaydediliyor…' : 'Panele Ekle'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
