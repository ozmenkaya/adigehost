import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/auth/Login';
import Dashboard from './pages/client/Dashboard';

/** Oturum gerektiren rotaları korur. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      {/* TODO (kodlama fazı): client & admin alt rotaları, legal sayfalar */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
