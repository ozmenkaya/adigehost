import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Field {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select' | 'boolean';
  secret?: boolean;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}
interface Provider {
  key: string;
  label: string;
  category: string;
  description: string;
  testable: boolean;
  fields: Field[];
}
interface Integration {
  id: string;
  provider: string;
  name: string;
  values: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  status: 'unknown' | 'connected' | 'error';
  lastError: string | null;
}

const STATUS: Record<string, string> = {
  connected: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-500',
};

export default function Integrations() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [items, setItems] = useState<Integration[]>([]);
  const [editing, setEditing] = useState<{ provider: Provider; existing?: Integration } | null>(
    null,
  );
  const [form, setForm] = useState<{ name: string; values: Record<string, unknown> }>({
    name: '',
    values: {},
  });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api
      .get('/admin/integrations')
      .then((r) => setItems(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  useEffect(() => {
    api
      .get('/admin/integrations/providers')
      .then((r) => setProviders(r.data.data))
      .catch(() => {});
    load();
  }, []);

  const openNew = (provider: Provider) => {
    setError('');
    setMsg('');
    setForm({ name: `${provider.label}`, values: {} });
    setEditing({ provider });
  };
  const openEdit = (provider: Provider, existing: Integration) => {
    setError('');
    setMsg('');
    setForm({ name: existing.name, values: { ...existing.values } });
    setEditing({ provider, existing });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      if (editing.existing) {
        await api.put(`/admin/integrations/${editing.existing.id}`, {
          name: form.name,
          values: form.values,
        });
      } else {
        await api.post('/admin/integrations', {
          provider: editing.provider.key,
          name: form.name,
          values: form.values,
        });
      }
      setEditing(null);
      setMsg('Kaydedildi');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const test = async (id: string) => {
    setBusy(id);
    setMsg('');
    setError('');
    try {
      const r = await api.post(`/admin/integrations/${id}/test`);
      setMsg(
        r.data.data.connected ? 'Bağlantı başarılı' : ` ${r.data.data.error ?? 'Bağlanılamadı'}`,
      );
      load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const makeDefault = async (id: string) => {
    await api.post(`/admin/integrations/${id}/default`);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm('Bağlantı silinsin mi?')) return;
    await api.delete(`/admin/integrations/${id}`);
    load();
  };

  const setVal = (key: string, v: unknown) =>
    setForm((f) => ({ ...f, values: { ...f.values, [key]: v } }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Entegrasyonlar</h1>
        <p className="text-sm text-slate-500">
          Harici servisleri bağlayın. Her sağlayıcı için birden fazla bağlantı tanımlayabilir,
          birini varsayılan yapabilirsiniz. Gizli alanlar şifreli saklanır.
        </p>
      </div>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {providers.map((p) => {
        const conns = items.filter((i) => i.provider === p.key);
        return (
          <div key={p.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">{p.label}</h2>
                <p className="text-xs text-slate-500">{p.description}</p>
              </div>
              <button
                onClick={() => openNew(p)}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
              >
                + Bağlantı
              </button>
            </div>

            {conns.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {conns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{c.name}</span>
                      {c.isDefault && (
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          VARSAYILAN
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {p.testable && (
                        <button
                          disabled={busy === c.id}
                          onClick={() => test(c.id)}
                          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                        >
                          {busy === c.id ? '…' : 'Test'}
                        </button>
                      )}
                      {!c.isDefault && (
                        <button
                          onClick={() => makeDefault(c.id)}
                          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                        >
                          Varsayılan yap
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(p, c)}
                        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Form modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {editing.existing ? 'Düzenle' : 'Yeni'}: {editing.provider.label}
            </h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bağlantı Adı</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {editing.provider.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {field.label}
                </label>
                {field.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(form.values[field.key])}
                    onChange={(e) => setVal(field.key, e.target.checked)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={String(form.values[field.key] ?? '')}
                    onChange={(e) => setVal(field.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Seçin</option>
                    {field.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field.type === 'password'
                        ? 'password'
                        : field.type === 'number'
                          ? 'number'
                          : 'text'
                    }
                    value={String(form.values[field.key] ?? '')}
                    placeholder={
                      field.secret && editing.existing
                        ? 'Değiştirmek için yazın (boş = aynı kalır)'
                        : field.placeholder
                    }
                    onChange={(e) => setVal(field.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
