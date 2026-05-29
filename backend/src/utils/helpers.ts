/** Ortak yardımcı fonksiyonlar. */

/** TRY para biçimlendirme. */
export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
}

/**
 * KDV dahil/hariç hesaplama. Para işlemlerinde kuruş yuvarlaması yapılır.
 * @param subtotal KDV hariç tutar
 * @param vatRate yüzde (örn. 20)
 */
export function calculateTotals(subtotal: number, vatRate: number) {
  const tax = round2((subtotal * vatRate) / 100);
  const total = round2(subtotal + tax);
  return { subtotal: round2(subtotal), tax, total };
}

/** İki ondalığa yuvarlar (kuruş hassasiyeti). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Sıralı fatura numarası üretir (VUK: boşluksuz ve sıralı).
 * @param prefix örn "ARS"
 * @param sequence DB'den alınan son sıra + 1
 */
export function formatInvoiceNumber(
  prefix: string,
  sequence: number,
  year = new Date().getUTCFullYear(),
): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
}

/** Basit slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
