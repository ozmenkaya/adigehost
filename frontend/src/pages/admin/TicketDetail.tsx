import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import {
  DEPARTMENT_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  fmtDateTime,
  type Ticket,
  type TicketDepartment,
  type TicketPriority,
  type TicketStatus,
} from '../../utils/ticket';

export default function AdminTicketDetail() {
  const { id = '' } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/admin/tickets/${id}`);
      setTicket(r.data.data);
      setError('');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const reply = async (close: boolean) => {
    if (message.trim().length < 2) {
      setError('Yanıt boş olamaz.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await api.post(`/admin/tickets/${id}/replies`, { message, close });
      setMessage('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const patch = async (changes: Partial<Pick<Ticket, 'status' | 'priority' | 'department'>>) => {
    setSavingMeta(true);
    setError('');
    try {
      await api.put(`/admin/tickets/${id}`, changes);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSavingMeta(false);
    }
  };

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;

  if (!ticket) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || 'Talep bulunamadı.'}
        </div>
        <Link to="/admin/tickets" className="text-sm text-brand-600">
          ← Destek taleplerine dön
        </Link>
      </div>
    );
  }

  const st = STATUS_LABEL[ticket.status];

  return (
    <div className="space-y-5">
      <Link to="/admin/tickets" className="text-sm text-brand-600 hover:text-brand-700">
        ← Destek Talepleri
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* Yazışma */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{ticket.subject}</h1>
                <p className="mt-1 text-xs text-slate-400">
                  {ticket.ticketNum} · Açılış: {fmtDateTime(ticket.createdAt)}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>
                {st.label}
              </span>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="space-y-3">
            {(ticket.replies ?? []).map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 ${
                  r.isAdmin ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {r.author
                      ? `${r.author.firstName} ${r.author.lastName}`
                      : r.isAdmin
                        ? 'Destek'
                        : 'Müşteri'}
                    {r.isAdmin && (
                      <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        DESTEK
                      </span>
                    )}
                    {r.isAiSuggestion && (
                      <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                        AI TASLAK
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">{fmtDateTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {r.message}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Müşteriye yanıtınızı yazın…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => reply(false)}
                disabled={sending}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {sending ? 'Gönderiliyor…' : 'Yanıtla'}
              </button>
              <button
                onClick={() => reply(true)}
                disabled={sending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Yanıtla ve Kapat
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Yanıt müşteriye e-posta ile de iletilir.
            </p>
          </div>
        </div>

        {/* Yan panel — müşteri ve talep bilgileri */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Müşteri</h2>
            {ticket.user ? (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Ad Soyad</dt>
                  <dd className="text-slate-700">
                    <Link to="/admin/clients" className="hover:text-brand-700">
                      {ticket.user.firstName} {ticket.user.lastName}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">E-posta</dt>
                  <dd className="break-all text-slate-700">{ticket.user.email}</dd>
                </div>
                {ticket.user.phone && (
                  <div>
                    <dt className="text-xs text-slate-400">Telefon</dt>
                    <dd className="text-slate-700">{ticket.user.phone}</dd>
                  </div>
                )}
                {ticket.user.company && (
                  <div>
                    <dt className="text-xs text-slate-400">Firma</dt>
                    <dd className="text-slate-700">{ticket.user.company}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-slate-400">Müşteri kaydı bulunamadı.</p>
            )}
          </div>

          {ticket.service && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">İlgili Hizmet</h2>
              <Link
                to={`/admin/services`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {ticket.service.name}
              </Link>
              <p className="mt-0.5 text-xs uppercase text-slate-400">{ticket.service.type}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Talep Ayarları</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Durum</label>
                <select
                  value={ticket.status}
                  disabled={savingMeta}
                  onChange={(e) => patch({ status: e.target.value as TicketStatus })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Öncelik</label>
                <select
                  value={ticket.priority}
                  disabled={savingMeta}
                  onChange={(e) => patch({ priority: e.target.value as TicketPriority })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Departman</label>
                <select
                  value={ticket.department}
                  disabled={savingMeta}
                  onChange={(e) => patch({ department: e.target.value as TicketDepartment })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {(Object.keys(DEPARTMENT_LABEL) as TicketDepartment[]).map((d) => (
                    <option key={d} value={d}>
                      {DEPARTMENT_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Durum değişikliği müşteriye e-posta göndermez; bildirim yalnızca yanıt yazınca gider.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
