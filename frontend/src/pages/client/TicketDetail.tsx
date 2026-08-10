import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import {
  DEPARTMENT_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  fmtDateTime,
  type Ticket,
} from '../../utils/ticket';

export default function TicketDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/tickets/${id}`);
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

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await api.post(`/tickets/${id}/replies`, { message });
      setMessage('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    setClosing(true);
    try {
      await api.post(`/tickets/${id}/close`);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;

  if (!ticket) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || 'Talep bulunamadı.'}
        </div>
        <button onClick={() => navigate('/app/tickets')} className="text-sm text-brand-600">
          ← Taleplerime dön
        </button>
      </div>
    );
  }

  const st = STATUS_LABEL[ticket.status];
  const pr = PRIORITY_LABEL[ticket.priority];
  const isClosed = ticket.status === 'closed';

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/app/tickets" className="text-sm text-brand-600 hover:text-brand-700">
        ← Taleplerim
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{ticket.subject}</h1>
            <p className="mt-1 text-xs text-slate-400">
              {ticket.ticketNum} · {DEPARTMENT_LABEL[ticket.department]} ·{' '}
              {fmtDateTime(ticket.createdAt)}
              {ticket.service && ` · ${ticket.service.name}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${pr.cls}`}>
              {pr.label}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>
              {st.label}
            </span>
          </div>
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
                {r.isAdmin
                  ? 'AdigeHost Destek'
                  : r.author
                    ? `${r.author.firstName} ${r.author.lastName}`
                    : 'Siz'}
              </span>
              <span className="text-xs text-slate-400">{fmtDateTime(r.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.message}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {isClosed && (
          <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            Bu talep kapatıldı. Yeni bir mesaj yazarsanız talep yeniden açılır.
          </p>
        )}
        <form onSubmit={sendReply} className="space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={2}
            maxLength={10000}
            rows={5}
            placeholder="Yanıtınızı yazın…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {sending ? 'Gönderiliyor…' : isClosed ? 'Yanıtla ve Yeniden Aç' : 'Yanıtla'}
            </button>
            {!isClosed && (
              <button
                type="button"
                onClick={closeTicket}
                disabled={closing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {closing ? 'Kapatılıyor…' : 'Talebi Kapat'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
