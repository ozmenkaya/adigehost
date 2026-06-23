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

          {/* SQL Dosyası ile toplu import */}
          <AlantronSqlImport clients={clients} onImported={() => void loadAlantron()} />

          {/* Manuel tek domain ekle */}
          <AlantronAddForm clients={clients} onAdded={() => void loadAlantron()} />

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

// ── Alantron SQL dosyası ile toplu import ────────────────────────────────────
interface ParsedDomain {
  domain: string;
  registrycode: number | null;
  expiryDate: string | null;
  alreadyImported: boolean;
}

function AlantronSqlImport({ clients, onImported }: { clients: Client[]; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [sqlText, setSqlText] = useState('');
  const [parsed, setParsed] = useState<ParsedDomain[] | null>(null);
  const [defaultUserId, setDefaultUserId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const parseSql = async () => {
    if (!sqlText.trim()) return;
    setParsing(true);
    setErr('');
    setParsed(null);
    try {
      const r = await api.post('/admin/sync/alantron/parse-sql', { sql: sqlText });
      setParsed(r.data.data ?? []);
      setMsg(
        `${r.data.meta?.total ?? 0} domain bulundu · ${r.data.meta?.new ?? 0} yeni · ${r.data.meta?.alreadyImported ?? 0} zaten kayıtlı`,
      );
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setParsing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSqlText(String(ev.target?.result ?? ''));
    reader.readAsText(f, 'utf-8');
  };

  const importAll = async () => {
    if (!parsed || !defaultUserId) return;
    const toImport = parsed.filter((d) => !d.alreadyImported);
    if (!toImport.length) {
      setErr('İçe aktarılacak yeni domain yok');
      return;
    }
    setImporting(true);
    setErr('');
    let ok = 0,
      skip = 0;
    for (const d of toImport) {
      try {
        await api.post('/admin/sync/alantron/import', {
          domain: d.domain,
          userId: defaultUserId,
          registrycode: d.registrycode ?? undefined,
          expiryDate: d.expiryDate ?? undefined,
          status: 'active',
        });
        ok++;
      } catch {
        skip++;
      }
    }
    setImporting(false);
    setMsg(`${ok} domain aktarıldı, ${skip} atlandı`);
    setParsed(null);
    setSqlText('');
    setOpen(false);
    onImported();
  };

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <span className="font-semibold text-blue-900">WHMCS SQL Dosyası ile Toplu İçe Aktar</span>
          <p className="text-xs text-blue-700 mt-0.5">
            alantron.net → Formlar/API → WHMCS → Senkronizasyon SQL dosyasını indirin
          </p>
        </div>
        <span className="text-blue-400">{open ? '▲' : '▼'}</span>
      </button>

      {(msg || err) && (
        <div
          className={`mx-5 mb-3 rounded-lg p-2 text-sm ${err ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
        >
          {err || msg}
        </div>
      )}

      {open && (
        <div className="border-t border-blue-200 px-5 pb-5 pt-4 space-y-4 bg-white rounded-b-2xl">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <b>Adımlar:</b>1)
            <a
              href="https://www.alantron.net"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              alantron.net
            </a>
            'e giriş yapın → 2) Formlar/API → WHMCS sayfasına gidin → 3) "Senkronizasyon SQL
            dosyasını"indirin → 4) Aşağıya yapıştırın veya dosyayı yükleyin
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="file"
              accept=".sql,.txt"
              onChange={handleFile}
              className="text-sm text-slate-600"
            />
            <span className="text-slate-400 text-xs">veya aşağıya yapıştırın</span>
          </div>

          <textarea
            value={sqlText}
            onChange={(e) => setSqlText(e.target.value)}
            placeholder="SQL içeriğini buraya yapıştırın..."
            rows={5}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
          />

          <button
            onClick={parseSql}
            disabled={parsing || !sqlText.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {parsing ? 'Ayrıştırılıyor…' : "SQL'i Ayrıştır"}
          </button>

          {parsed && (
            <div className="space-y-3">
              {parsed.filter((d) => !d.alreadyImported).length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700 shrink-0">Müşteri:</label>
                  <select
                    value={defaultUserId}
                    onChange={(e) => setDefaultUserId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm flex-1"
                  >
                    <option value="">— Tüm domainler için müşteri seçin —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Domain</th>
                      <th className="px-3 py-2 text-center">Registrycode</th>
                      <th className="px-3 py-2 text-center">Son Kullanma</th>
                      <th className="px-3 py-2 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.map((d) => (
                      <tr key={d.domain} className={d.alreadyImported ? 'opacity-40' : ''}>
                        <td className="px-3 py-1.5 font-medium">{d.domain}</td>
                        <td className="px-3 py-1.5 text-center font-mono">
                          {d.registrycode ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">{d.expiryDate ?? '—'}</td>
                        <td className="px-3 py-1.5 text-center">
                          {d.alreadyImported ? (
                            <span className="text-green-600">Var</span>
                          ) : (
                            <span className="text-amber-600">Yeni</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsed.filter((d) => !d.alreadyImported).length > 0 && (
                <button
                  onClick={importAll}
                  disabled={importing || !defaultUserId}
                  className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {importing
                    ? 'Aktarılıyor…'
                    : ` ${parsed.filter((d) => !d.alreadyImported).length} Yeni Domaini Panele Aktar`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Alantron domain ekleme formu ──────────────────��─────────────────────────────
function AlantronAddForm({ clients, onAdded }: { clients: Client[]; onAdded: () => void }) {
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
      {err && <div className="mx-5 mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      {open && (
        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Domain<span className="text-red-500">*</span>
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
                Müşteri<span className="text-red-500">*</span>
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
                Registrycode<span className="text-slate-400">(opsiyonel)</span>
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
                Son Kullanma Tarihi<span className="text-slate-400">(opsiyonel)</span>
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
                <input type="radio" checked={status === s} onChange={() => setStatus(s)} />
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
