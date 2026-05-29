import { useAuthStore } from '../../store/authStore';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-brand-700">AdigeHost Panel</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={() => logout()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Çıkış
          </button>
        </div>
      </header>

      <main className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold">Hoş geldiniz 👋</h2>
          <p className="mt-2 text-slate-600">
            Bu, AdigeHost panelinin iskelet kontrol panelidir. Servisler, faturalar, domainler ve
            destek modülleri kodlama fazında eklenecek.
          </p>
        </div>
      </main>
    </div>
  );
}
