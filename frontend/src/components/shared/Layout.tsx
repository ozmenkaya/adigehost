import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Genel Bakış', icon: '📊' },
  { to: '/admin/clients', label: 'Müşteriler', icon: '👥' },
  { to: '/admin/services', label: 'Servisler', icon: '🖥️' },
  { to: '/admin/products', label: 'Ürünler', icon: '📦' },
  { to: '/admin/invoices', label: 'Faturalar', icon: '🧾' },
  { to: '/admin/servers', label: 'Sunucular', icon: '🗄️' },
  { to: '/admin/settings', label: 'Ayarlar', icon: '⚙️' },
  { to: '/admin/logs', label: 'Loglar', icon: '📜' },
];

const CLIENT_NAV: NavItem[] = [
  { to: '/app', label: 'Panel', icon: '🏠' },
  { to: '/app/services', label: 'Servislerim', icon: '🖥️' },
  { to: '/app/profile', label: 'Profil', icon: '👤' },
];

export default function Layout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const nav = user?.role === 'admin' ? ADMIN_NAV : CLIENT_NAV;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="text-xl font-bold text-brand-700">AdigeHost</span>
          {user?.role === 'admin' && (
            <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
              ADMIN
            </span>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/app'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Çıkış
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
