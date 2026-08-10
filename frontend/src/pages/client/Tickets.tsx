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

interface ServiceOption {
  id: string;
  name: string;
}

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'open', label: 'Açık' },
  { key: 'closed', label: 'Kapalı' },
] as const;

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [department, setDepartment] = useState<TicketDepartment>('support');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [serviceId, setServiceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/tickets', { params: { status: filter } });
      setTickets(r.data.data ?? []);
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
  }, [filter]);

  // Hizmet listesi yalnızca form açıldığında gerekli.
  useEffect(() => {
    if (!formOpen || services.length > 0) return;
    void api
      .get('/services')
      .then((r) => setServices(r.data.data ?? []))
      .catch(() => setServices([]));
  }, [formOpen, services.length]);

  const resetForm = () => {
    setSubject('');
    setMessage('');
    setDepartment('support');
    setPriority('medium');
    setServiceId('');
    setFormError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/tickets', {
        subject,
        message,
        department,
        priority,
        serviceId: serviceId || null,
      });
      resetForm();
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const waiting = tickets.filter((t) => t.status === 'open' || t.status === 'customer_reply').length;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Destek Taleplerim</h1>
          <p className="text-sm text-slate-500">
            {waiting > 0
              ? `${waiting} talebiniz yanıt bekliyor.`
              : 'Yanıt bekleyen talebiniz yok.'}
          </p>
        </div>
        <button
          onClick={() => {
            setFormOpen((v) => !v);
            setFormError('');
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {formOpen ? 'Vazgeç' : 'Yeni Talep'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {formOpen && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Konu</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={5}
              maxLength={200}
              placeholder="Örn. Sitem açılmıyor"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Departman</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as TicketDepartment)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                {(Object.keys(DEPARTMENT_LABEL) as TicketDepartment[]).map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="low">Düşük</option>
                <option value="medium">Normal</option>
                <option value="high">Yüksek</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">İlgili Hizmet</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">— Seçiniz (isteğe bağlı)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mesajınız</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={10000}
              rows={6}
              placeholder="Sorunu olabildiğince ayrıntılı anlatın: hata mesajı, ne zaman başladı, hangi adreste görülüyor…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Şifrenizi veya kart bilgilerinizi buraya yazmayın — destek ekibi asla istemez.
            </p>
          </div>

          {formError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'Gönderiliyor…' : 'Talebi Gönder'}
          </button>
        </form>
      )}

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor…</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {filter === 'all' ? 'Henüz destek talebiniz yok.' : 'Bu filtrede talep yok.'}
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const st = STATUS_LABEL[t.status];
            const pr = PRIORITY_LABEL[t.priority];
            return (
              <Link
                key={t.id}
                to={`/app/tickets/${t.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{t.subject}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      {(t.priority === 'high' || t.priority === 'urgent') && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pr.cls}`}>
                          {pr.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t.ticketNum} · {DEPARTMENT_LABEL[t.department]}
                      {t.service && ` · ${t.service.name}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    Son hareket: {fmtRelative(t.lastReply ?? t.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
