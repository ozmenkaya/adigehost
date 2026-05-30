import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/shared/Layout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
// Admin
import AdminDashboard from './pages/admin/Dashboard';
import Clients from './pages/admin/Clients';
import AdminServices from './pages/admin/Services';
import Products from './pages/admin/Products';
import Invoices from './pages/admin/Invoices';
import Servers from './pages/admin/Servers';
import Integrations from './pages/admin/Integrations';
import Settings from './pages/admin/Settings';
import Logs from './pages/admin/Logs';
// Client
import ClientDashboard from './pages/client/Dashboard';
import ClientServices from './pages/client/Services';
import OrderHosting from './pages/client/OrderHosting';
import HostingDetail from './pages/client/HostingDetail';
import Domains from './pages/client/Domains';
import Profile from './pages/client/Profile';

function ProtectedRoute({ role, children }: { role?: 'admin'; children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/** Kök yönlendirme: role göre admin/müşteri paneline. */
function RootRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/app'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Admin paneli */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="products" element={<Products />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="servers" element={<Servers />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<Logs />} />
      </Route>

      {/* Müşteri paneli */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ClientDashboard />} />
        <Route path="services" element={<ClientServices />} />
        <Route path="services/:id" element={<HostingDetail />} />
        <Route path="order/hosting" element={<OrderHosting />} />
        <Route path="domains" element={<Domains />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
