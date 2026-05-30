import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

export default function Settings() {
  const [bank, setBank] = useState({
    bank_name: '',
    bank_iban: '',
    bank_account_holder: '',
    bank_branch: '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((r) => setBank({ ...bank, ...r.data.data.bank }))
      .catch((e) => setError(getApiErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api.put('/admin/settings', { bank });
      setMsg('Ayarlar kaydedildi');
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const f = (label: string, key: keyof typeof bank) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={bank[key]}
        onChange={(e) => setBank({ ...bank, [key]: e.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Ayarlar</h1>
      <p className="text-sm text-slate-500">
        Havale/EFT ödemeleri için banka bilgileri. Müşteri sipariş verdiğinde bu bilgiler
        gösterilir.
      </p>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-800">Banka / Havale Bilgileri</h2>
        {f('Banka Adı', 'bank_name')}
        {f('IBAN', 'bank_iban')}
        {f('Hesap Sahibi', 'bank_account_holder')}
        {f('Şube', 'bank_branch')}
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Kaydet
        </button>
      </form>
    </div>
  );
}
