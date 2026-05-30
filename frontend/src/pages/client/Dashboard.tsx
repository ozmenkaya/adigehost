import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState({ services: 0 });

  useEffect(() => {
    api
      .get('/services')
      .then((res) => setCounts({ services: res.data.data.length }))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Hoş geldiniz, {user?.firstName} 👋</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link
          to="/app/services"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
        >
          <div className="text-sm text-slate-500">Servislerim</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{counts.services}</div>
        </Link>
        <Link
          to="/app/profile"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
        >
          <div className="text-sm text-slate-500">Profil</div>
          <div className="mt-1 text-lg font-semibold text-brand-700">Hesabımı Yönet</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-600">
          AdigeHost müşteri panelinize hoş geldiniz. VPS ve hosting servislerinizi, faturalarınızı
          ve destek taleplerinizi buradan yönetebilirsiniz.
        </p>
      </div>
    </div>
  );
}
