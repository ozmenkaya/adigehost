import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface SshKey {
  id: string;
  name: string;
  publicKey: string;
  fingerprint: string | null;
  createdAt: string;
}

export default function SshKeys() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const flash = (m: string, isErr = false) => {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => {
      setMsg('');
      setError('');
    }, 5000);
  };

  const load = () =>
    api
      .get('/ssh-keys')
      .then((r) => setKeys(r.data.data ?? []))
      .catch((e) => setError(getApiErrorMessage(e)));

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/ssh-keys', { name: name.trim(), publicKey: publicKey.trim() });
      setName('');
      setPublicKey('');
      flash('SSH anahtarı eklendi');
      await load();
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Anahtar silinsin mi?')) return;
    try {
      await api.delete(`/ssh-keys/${id}`);
      flash('Anahtar silindi');
      await load();
    } catch (err) {
      flash(getApiErrorMessage(err), true);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SSH Anahtarları</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kayıtlı anahtarlarınızı yeni VPS kurulumlarında seçebilirsiniz. Anahtar eklerseniz sunucuya
          parola yerine anahtarınızla giriş yaparsınız.
        </p>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Yeni anahtar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Yeni Anahtar Ekle</h2>
        <form onSubmit={add} className="space-y-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anahtar adı (örn: Laptop)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <textarea
            required
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            rows={4}
            placeholder="ssh-ed25519 AAAA... veya ssh-rsa AAAA..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400">
            Public anahtarınızı yapıştırın (genelde <code>~/.ssh/id_ed25519.pub</code>). Özel anahtarı
            (private key) ASLA paylaşmayın.
          </p>
          <button
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Ekleniyor…' : '+ Anahtar Ekle'}
          </button>
        </form>
      </div>

      {/* Liste */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">
          Anahtarlarım{' '}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
            {keys.length}
          </span>
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-slate-400">Henüz kayıtlı anahtarınız yok.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{k.name}</p>
                  <p className="truncate font-mono text-xs text-slate-400">{k.fingerprint ?? '—'}</p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(k.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <button
                  onClick={() => remove(k.id)}
                  className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
