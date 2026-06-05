import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface SavedCard {
  id: string;
  cardAlias: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  isDefault: boolean;
  createdAt: string;
}

function brandLogo(brand: string | null): string {
  const b = (brand ?? '').toLowerCase();
  if (b.includes('visa')) return 'VISA';
  if (b.includes('master')) return 'MasterCard';
  if (b.includes('troy')) return 'Troy';
  if (b.includes('amex') || b.includes('american')) return 'Amex';
  return '';
}

export default function Cards() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .get('/users/me/cards')
      .then((r) => setCards(r.data.data ?? []))
      .catch((e) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  const flash = (m: string, err = false) => {
    if (err) setError(m);
    else setMsg(m);
    setTimeout(() => {
      setMsg('');
      setError('');
    }, 3500);
  };

  const makeDefault = async (id: string) => {
    try {
      await api.put(`/users/me/cards/${id}/default`);
      flash('Varsayılan kart güncellendi');
      load();
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const remove = async (id: string, last4: string | null) => {
    if (!confirm(`**** **** **** ${last4 ?? '????'} kartını silmek istediğinize emin misiniz?`))
      return;
    try {
      await api.delete(`/users/me/cards/${id}`);
      flash('Kart silindi');
      load();
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kayıtlı Kartlarım</h1>
        <p className="text-sm text-slate-500 mt-1">
          Otomatik yenileme tahsilatları varsayılan kartınızdan yapılır.
        </p>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-5xl mb-3"></div>
          <p className="text-slate-500 mb-2">Henüz kayıtlı kart yok.</p>
          <p className="text-xs text-slate-400">
            Bir kart ile ödeme yaptığınızda iyzico tarafında saklama izni verebilirsiniz. Sonraki
            tahsilatlar saklı kartla otomatik yapılır.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl border p-5 ${
                c.isDefault ? 'border-brand-300 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                    <span>{brandLogo(c.cardBrand)}</span>
                    <span className="font-mono">**** **** **** {c.cardLast4 ?? '????'}</span>
                    {c.isDefault && (
                      <span className="rounded-full bg-brand-600 text-white px-2 py-0.5 text-xs font-semibold">
                        Varsayılan
                      </span>
                    )}
                  </div>
                  {c.cardAlias && (
                    <div className="text-xs text-slate-500 mt-0.5">{c.cardAlias}</div>
                  )}
                  <div className="text-xs text-slate-400 mt-0.5">
                    Eklendi: {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!c.isDefault && (
                    <button
                      onClick={() => makeDefault(c.id)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                    >
                      Varsayılan Yap
                    </button>
                  )}
                  <button
                    onClick={() => remove(c.id, c.cardLast4)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">Kart Güvenliği</p>
        <p className="text-xs text-blue-800 leading-relaxed">
          Kart numarası ve CVV bilgileri<strong>asla sunucumuzda saklanmaz</strong>. Yalnızca iyzico
          tarafında PCI-DSS uyumlu olarak saklanır ve bizim sunucumuzda AES-256-GCM şifreli bir
          token tutulur.
        </p>
      </div>
    </div>
  );
}
