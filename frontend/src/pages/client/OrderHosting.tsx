import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface CpanelInfo {
  username: string;
  password: string;
  url: string;
}

export default function OrderHosting() {
  const navigate = useNavigate();
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ serviceId: string; cpanel: CpanelInfo } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/services/hosting', { domain });
      setCreated({ serviceId: res.data.data.service.id, cpanel: res.data.data.cpanel });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <h1 className="text-xl font-bold text-green-800">✅ Hosting hesabınız oluşturuldu!</h1>
          <p className="mt-1 text-sm text-green-700">
            cPanel giriş bilgileriniz aşağıdadır. <strong>Şifre yalnızca bir kez gösterilir</strong>{' '}
            — lütfen güvenli bir yere kaydedin.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Kullanıcı adı</span>
              <span className="font-mono font-medium">{created.cpanel.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Şifre</span>
              <span className="font-mono font-medium">{created.cpanel.password}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">cPanel</span>
              <a
                href={created.cpanel.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-600 hover:underline"
              >
                Giriş yap ↗
              </a>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/app/services/${created.serviceId}`)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Hosting'i Yönet
          </button>
          <button
            onClick={() => navigate('/app/services')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Servislerime Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Hosting Sipariş Et</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Alan adı (domain)</label>
          <input
            required
            value={domain}
            onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
            placeholder="orneksite.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            cPanel hosting hesabı bu alan adı için oluşturulur.
          </p>
        </div>
        <button
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Oluşturuluyor…' : 'Hosting Oluştur'}
        </button>
      </form>
    </div>
  );
}
