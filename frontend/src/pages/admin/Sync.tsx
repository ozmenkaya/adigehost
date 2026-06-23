import { useEffect, useState } from 'react';
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
  const [alSyncing, setAlSyncing] = useState(false);
  const [alSyncMsg, setAlSyncMsg] = useState('');

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

  const syncAlantron = async () => {
    setAlSyncing(true);
    setAlSyncMsg('');
    try {
      const r = await api.post('/admin/sync/alantron/refresh');
      const s = r.data.data as {
        total: number;
        updated: number;
        unchanged: number;
        notManaged: string[];
        errors: { domain: string; message: string }[];
      };
      let msg = `${s.total} domain tarandı · ${s.updated} güncellendi · ${s.unchanged} zaten güncel`;
      if (s.notManaged.length) msg += ` · ⚠ ${s.notManaged.length} yönetilmiyor (${s.notManaged.join(', ')})`;
      if (s.errors.length) msg += ` · ${s.errors.length} hata`;
      setAlSyncMsg(msg);
      await loadAlantron();
    } catch (e) {
      setAlSyncMsg(getApiErrorMessage(e));
    } finally {
      setAlSyncing(false);
    }
  };

  const loadClients = async () => {
    const r = await api.get('/admin/clients', { params: { limit: 100 } });
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
      if (n.has(key)) n.delete(key);
      else n.add(key);
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
            tab === 'whm'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          WHM Hesapları
        </button>
        <button
          onClick={() => setTab('alantron')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'alantron'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Alantron
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
                    Toplam:<b>{whmAccounts.length}</b>
                  </span>
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-700">
                    Kayıtlı:<b>{importedCount}</b>
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">
                    Kayıtsız:<b>{notImportedCount}</b>
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
                  {importing ? 'Aktarılıyor…' : ` ${selected.size} Hesabı Panele Aktar`}
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
                            Kayıtlı
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
              ℹ {alNote}
            </div>
          )}

          {/* Kayıtlı domainler */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-semibold text-slate-800">
                Kayıtlı Domainler{' '}
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                  {alDomains.length}
                </span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void syncAlantron()}
                  disabled={alSyncing}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {alSyncing ? 'Senkronize ediliyor…' : 'Alantron\'dan Güncelle'}
                </button>
                <button
                  onClick={() => void loadAlantron()}
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  Yenile
                </button>
              </div>
            </div>
            {alSyncMsg && (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                {alSyncMsg}
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Müşteri</th>
                  <th className="px-4 py-3">RC</th>
                  <th className="px-4 py-3">Son Kullanma</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3 text-right">İşlemler</th>
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
                      Henüz domain yok.
                    </td>
                  </tr>
                ) : (
                  alDomains.map((d) => {
                    const expiry = d.nextDue ? new Date(d.nextDue) : null;
                    const daysLeft = expiry
                      ? Math.ceil((expiry.getTime() - Date.now()) / 86400000)
                      : null;
                    const isExpiring = daysLeft !== null && daysLeft < 30;
                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-slate-50 ${isExpiring ? 'bg-red-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{d.domain ?? d.name}</div>
                          {isExpiring && (
                            <div className="text-xs text-red-600 font-medium">
                              {daysLeft! < 0 ? 'Süresi doldu!' : `${daysLeft} gün kaldı`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <DomainAssign
                            id={d.id}
                            currentUser={d.user}
                            clients={clients}
                            onAssigned={() => void loadAlantron()}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {d.config?.registrycode ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {expiry ? expiry.toLocaleDateString('tr-TR') : '—'}
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
                          {d.config?.registrycode && (
                            <DomainActions
                              id={d.id}
                              domain={d.domain ?? d.name}
                              registrycode={d.config.registrycode}
                              onRenewed={() => void loadAlantron()}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Müşteri atama satır bileşeni ─────────────────────────────────────────────
function DomainAssign({
  id,
  currentUser,
  clients,
  onAssigned,
}: {
  id: string;
  currentUser?: { firstName: string; lastName: string; email: string } | null;
  clients: Client[];
  onAssigned: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="cursor-pointer group" onClick={() => setEditing(true)} title="Müşteri ata">
        {currentUser ? (
          <div>
            <div className="text-slate-700 group-hover:text-brand-600 text-sm">
              {currentUser.firstName} {currentUser.lastName}
            </div>
            <div className="text-xs text-slate-400">{currentUser.email}</div>
          </div>
        ) : (
          <span className="text-xs text-brand-500 hover:text-brand-700">+ Müşteri ata</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <select
        autoFocus
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="rounded border border-slate-300 px-1.5 py-1 text-xs flex-1"
      >
        <option value="">— Seçin —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
          </option>
        ))}
      </select>
      <button
        disabled={!userId || saving}
        onClick={async () => {
          setSaving(true);
          await api.put(`/admin/sync/alantron/${id}/assign`, { userId }).catch(() => {});
          setSaving(false);
          setEditing(false);
          onAssigned();
        }}
        className="rounded bg-brand-600 px-2 py-1 text-xs text-white disabled:opacity-40"
      >
        {saving ? '…' : ''}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-slate-400 hover:text-slate-600"
      ></button>
    </div>
  );
}

// ── Domain operasyon butonları ────────────────────────────────────────────────
function DomainActions({
  id,
  domain,
  onRenewed,
}: {
  id: string;
  domain: string;
  registrycode?: number;
  onRenewed: () => void;
}) {
  const [renewing, setRenewing] = useState(false);
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [msg, setMsg] = useState('');

  const renew = async () => {
    if (!confirm(`${domain} 1 yıl yenilensin mi? (Alantron bakiyenizden düşer)`)) return;
    setRenewing(true);
    try {
      const r = await api.post(`/admin/sync/alantron/${id}/renew`, { year: 1 });
      setMsg(r.data.message);
      onRenewed();
    } catch (e) {
      setMsg(getApiErrorMessage(e));
    } finally {
      setRenewing(false);
    }
  };

  const fetchInfo = async () => {
    if (showInfo) {
      setShowInfo(false);
      return;
    }
    try {
      const r = await api.get(`/admin/sync/alantron/${id}/info`);
      setInfo(r.data.data);
      setShowInfo(true);
    } catch (e) {
      setMsg(getApiErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-1 items-end">
      {msg && <div className="text-xs text-green-600">{msg}</div>}
      <div className="flex gap-1">
        <button
          onClick={renew}
          disabled={renewing}
          className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40"
        >
          {renewing ? '…' : '↻ Yenile'}
        </button>
        <button
          onClick={fetchInfo}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          {showInfo ? 'Kapat' : 'Bilgi'}
        </button>
      </div>
      {showInfo && info && (
        <div className="mt-1 text-left rounded bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600 w-56">
          {Object.entries(info)
            .filter(([, v]) => v && String(v).length < 50)
            .slice(0, 8)
            .map(([k, v]) => (
              <div key={k}>
                <b>{k}:</b>
                {String(v)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

