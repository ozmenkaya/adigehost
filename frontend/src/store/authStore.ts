import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../utils/api';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'client';
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      loading: false,

      login: async (email, password) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          set({ user: data.data.user, isAuthenticated: true, loading: false });
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          set({ user: null, isAuthenticated: false });
        }
      },

      fetchMe: async () => {
        const { data } = await api.get('/users/me');
        set({ user: data.data, isAuthenticated: true });
      },
    }),
    {
      name: 'adigehost-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
