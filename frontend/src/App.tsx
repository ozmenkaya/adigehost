import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/shared/Layout';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
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
import Sync from './pages/admin/Sync';
import AdminTickets from './pages/admin/Tickets';
import AdminTicketDetail from './pages/admin/TicketDetail';
// Client
import ClientDashboard from './pages/client/Dashboard';
import ClientServices from './pages/client/Services';
import OrderHosting from './pages/client/OrderHosting';
import OrderVPS from './pages/client/OrderVPS';
import SshKeys from './pages/client/SshKeys';
import ServiceDetail from './pages/client/ServiceDetail';
import ClientInvoices from './pages/client/Invoices';
import Domains from './pages/client/Domains';
import Profile from './pages/client/Profile';
import Cards from './pages/client/Cards';
import DomainTransfer from './pages/client/DomainTransfer';
import Tickets from './pages/client/Tickets';
import TicketDetail from './pages/client/TicketDetail';
// Shop (public)
import Sales from './pages/shop/Sales';
import Checkout from './pages/shop/Checkout';
import Legal from './pages/shop/Legal';
import PaymentResult from './pages/shop/PaymentResult';
import VPSConfigurator from './pages/shop/VPSConfigurator';
import ServicePage from './pages/shop/ServiceDetail';
import WebsitePackages from './pages/shop/WebsitePackages';

function ProtectedRoute({ role, children }: { role?: 'admin'; children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/** Anasayfa daima satış sayfasıdır — login gerektirmez. */
function RootRedirect() {
  return <Sales />;
}

export default function App() {
  return (
    <Routes>
      {/* Public shop */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/vps" element={<VPSConfigurator />} />
      <Route path="/web-sitesi" element={<WebsitePackages />} />
      {/* Eski/alternatif adresler web sitesi paketlerine düşsün */}
      <Route path="/hizmet/web-sitesi" element={<Navigate to="/web-sitesi" replace />} />
      <Route path="/hizmet/:slug" element={<ServicePage />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/legal/:slug" element={<Legal />} />
      <Route path="/sss" element={<Navigate to="/legal/sss" replace />} />
      <Route path="/payment-result" element={<PaymentResult />} />

      {/* Giriş ve kayıt tek ekranda yürür; /register geriye dönük uyumluluk için korunur. */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

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
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="tickets/:id" element={<AdminTicketDetail />} />
        <Route path="servers" element={<Servers />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<Logs />} />
        <Route path="sync" element={<Sync />} />
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
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="invoices" element={<ClientInvoices />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="order/hosting" element={<OrderHosting />} />
        <Route path="order/vps" element={<OrderVPS />} />
        <Route path="ssh-keys" element={<SshKeys />} />
        <Route path="domains" element={<Domains />} />
        <Route path="domains/transfer" element={<DomainTransfer />} />
        <Route path="profile" element={<Profile />} />
        <Route path="cards" element={<Cards />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
