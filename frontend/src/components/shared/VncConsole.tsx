import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';
import type RFBType from '@novnc/novnc';

type Status = 'requesting' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface Props {
  serviceId: string;
  name?: string;
  onClose: () => void;
}

/**
 * Gömülü noVNC (VNC over WebSocket) konsolu.
 * Hetzner `request_console` → { wssUrl, password } alır, tarayıcıda RFB ile bağlanır.
 */
export default function VncConsole({ serviceId, name, onClose }: Props) {
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFBType | null>(null);
  const [status, setStatus] = useState<Status>('requesting');
  const [errorMsg, setErrorMsg] = useState('');

  const cleanup = useCallback(() => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch {
        /* yut */
      }
      rfbRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    cleanup();
    setErrorMsg('');
    setStatus('requesting');
    try {
      const r = await api.post(`/hetzner/${serviceId}/console`);
      const { wssUrl, password } = (r.data.data ?? {}) as { wssUrl?: string; password?: string };
      if (!wssUrl || !password) {
        setStatus('error');
        setErrorMsg('Konsol bilgisi alınamadı');
        return;
      }
      if (!screenRef.current) return;

      const { default: RFB } = await import('@novnc/novnc');
      setStatus('connecting');
      const rfb = new RFB(screenRef.current, wssUrl, { credentials: { password } });
      rfb.scaleViewport = true;
      rfb.background = '#0f172a';
      rfbRef.current = rfb;

      rfb.addEventListener('connect', () => setStatus('connected'));
      rfb.addEventListener('disconnect', (e: Event) => {
        const clean = (e as CustomEvent<{ clean: boolean }>).detail?.clean;
        setStatus('disconnected');
        if (!clean) {
          setErrorMsg(
            'Bağlantı kapandı. Konsol oturumu (token) süresi dolmuş olabilir; yeniden bağlanmayı deneyin.',
          );
        }
      });
      rfb.addEventListener('securityfailure', (e: Event) => {
        const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
        setStatus('error');
        setErrorMsg(reason || 'Konsol kimlik doğrulaması başarısız');
      });
      rfb.addEventListener('credentialsrequired', () => {
        rfb.sendCredentials({ password });
      });
    } catch (e) {
      setStatus('error');
      setErrorMsg(getApiErrorMessage(e));
    }
  }, [serviceId, cleanup]);

  useEffect(() => {
    void connect();
    return cleanup;
  }, [connect, cleanup]);

  const statusLabel: Record<Status, string> = {
    requesting: 'Konsol isteniyor…',
    connecting: 'Bağlanılıyor…',
    connected: 'Bağlı',
    disconnected: 'Bağlantı kesildi',
    error: 'Hata',
  };
  const dot =
    status === 'connected'
      ? 'bg-green-400'
      : status === 'error' || status === 'disconnected'
        ? 'bg-red-400'
        : 'bg-amber-400 animate-pulse';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 sm:p-6">
      {/* Araç çubuğu */}
      <div className="flex items-center justify-between rounded-t-xl bg-slate-800 px-4 py-2 text-white">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="font-medium">VNC Konsol{name ? ` — ${name}` : ''}</span>
          <span className="text-xs text-slate-400">{statusLabel[status]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rfbRef.current?.sendCtrlAltDel()}
            disabled={status !== 'connected'}
            className="rounded border border-slate-600 px-2.5 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
          >
            Ctrl+Alt+Del
          </button>
          <button
            onClick={() => void connect()}
            className="rounded border border-slate-600 px-2.5 py-1 text-xs hover:bg-slate-700"
          >
            Yeniden Bağlan
          </button>
          <button
            onClick={() => {
              cleanup();
              onClose();
            }}
            className="rounded bg-red-600 px-3 py-1 text-xs font-medium hover:bg-red-700"
          >
            Kapat
          </button>
        </div>
      </div>

      {/* Ekran */}
      <div className="relative flex-1 overflow-hidden rounded-b-xl bg-slate-900">
        <div ref={screenRef} className="h-full w-full" />
        {status !== 'connected' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto max-w-md rounded-lg bg-slate-800/90 px-5 py-4 text-center text-sm text-slate-200">
              <p>{statusLabel[status]}</p>
              {errorMsg && <p className="mt-2 text-xs text-red-300">{errorMsg}</p>}
              {(status === 'error' || status === 'disconnected') && (
                <button
                  onClick={() => void connect()}
                  className="mt-3 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Yeniden Bağlan
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
