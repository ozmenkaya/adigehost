import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartItemType = 'hosting' | 'domain';

export interface CartItem {
  id: string; // productId veya domain adı
  type: CartItemType;
  name: string; // Görüntülenecek ad
  price: number; // KDV dahil TL
  priceExVat: number; // KDV hariç
  vatRate: number;
  billingCycle?: 'monthly' | 'annually';
  domain?: string; // domain siparişleri için
  period?: number; // domain için yıl
  productId?: string; // hosting için ürün ID
  meta?: Record<string, unknown>;
}

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: () => number;
  totalExVat: () => number;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        set((s) => {
          const exists = s.items.find((i) => i.id === item.id);
          if (exists) return s; // zaten sepette
          return { items: [...s.items, item] };
        });
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((s, i) => s + i.price, 0),
      totalExVat: () => get().items.reduce((s, i) => s + i.priceExVat, 0),
      count: () => get().items.length,
    }),
    { name: 'adige-cart' },
  ),
);
