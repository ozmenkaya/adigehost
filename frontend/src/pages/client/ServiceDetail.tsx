import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../utils/api';
import HostingDetail from './HostingDetail';
import DomainDetail from './DomainDetail';
import VpsDetail from './VpsDetail';

/**
 * Servis tipine göre uygun detay sayfasını gösterir.
 * Hosting → HostingDetail (e-posta + cPanel)
 * Domain → DomainDetail (NS + DNS + güvenlik)
 */
export default function ServiceDetail() {
  const { id } = useParams();
  const [type, setType] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/services/${id}`)
      .then((r) => setType(r.data.data?.type ?? ''))
      .catch((e) => setError(e?.response?.data?.error?.message ?? 'Servis bulunamadı'));
  }, [id]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!type) return <div className="text-slate-400">Yükleniyor…</div>;

  if (type === 'hosting') return <HostingDetail />;
  if (type === 'domain') return <DomainDetail />;
  if (type === 'vps') return <VpsDetail />;
  return <div className="text-slate-500">Bu servis tipi için detay sayfası yok ({type})</div>;
}
