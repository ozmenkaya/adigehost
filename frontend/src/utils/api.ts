import axios, { type AxiosError } from 'axios';

/**
 * Merkezi Axios instance.
 * - withCredentials: HttpOnly cookie (access/refresh) gönderimi için
 * - 401'de otomatik refresh denemesi (tek seferlik)
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

let isRefreshing = false;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !isRefreshing) {
      original._retry = true;
      isRefreshing = true;
      try {
        await api.post('/auth/refresh');
        isRefreshing = false;
        return api(original);
      } catch (refreshErr) {
        isRefreshing = false;
        // Refresh başarısız — login'e yönlendir
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  },
);

/** API hata mesajını okunaklı stringe çevirir. */
export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
      err.message
    );
  }
  return 'Beklenmeyen bir hata oluştu';
}
