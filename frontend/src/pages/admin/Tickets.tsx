import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import {
  DEPARTMENT_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  fmtRelative,
  type Ticket,
  type TicketDepartment,
  type TicketPriority,
} from '../../utils/ticket';

const STATUS_FILTERS = [
  { key: 'pending', label: 'Yanıt Bekleyen' },
  { key: 'open', label: 'Açık' },
  { key: 'closed', label: 'Kapalı' },
  { key: 'all', label: 'Tümü' },
] as const;

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meta, setMeta] = useState<{ total: number; waiting: number; openTotal: number } | null>(null);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]['key']>('pending');
  const [department, setDepartment] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/tickets', {
        params: {
          status,
          department: department || undefined,
          priority: priority || undefined,
          search: search.trim() || undefined,
        },
      });
      setTickets(r.data.data ?? []);
      setMeta(r.data.meta ?? null);
      setError('');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, department, priority]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Destek Talepleri</h1>
        <p className="text-sm text-slate-500">
          {meta
            ? `${meta.waiting} talep yanıt bekliyor · ${meta.openTotal} açık talep`
            : 'Yükleniyor…'}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              status === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">Tüm departmanlar</option>
          {(Object.keys(DEPARTMENT_LABEL) as TicketDepartment[]).map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABEL[d]}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">Tüm öncelikler</option>
          {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p].label}
            </option>
          ))}
        </select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Talep no veya konu"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Ara
          </button>
        </form>
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor…</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Bu filtrede talep yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Talep</th>
                <th className="px-4 py-3 text-left">Müşteri</th>
                <th className="px-4 py-3 text-left">Departman</th>
                <th className="px-4 py-3 text-left">Öncelik</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="px-4 py-3 text-left">Son Hareket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const st = STATUS_LABEL[t.status];
                const pr = PRIORITY_LABEL[t.priority];
                const needsReply = t.status === 'open' || t.status === 'customer_reply';
                return (
                  <tr key={t.id} className={needsReply ? 'bg-amber-50/40' : undefined}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/tickets/${t.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t.subject}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {t.ticketNum}
                        {t.service && ` · ${t.service.name}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.user ? (
                        <>
                          <div className="text-slate-700">
                            {t.user.firstName} {t.user.lastName}
                          </div>
                          <div className="text-xs text-slate-400">{t.user.email}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{DEPARTMENT_LABEL[t.department]}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pr.cls}`}>
                        {pr.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {fmtRelative(t.lastReply ?? t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
