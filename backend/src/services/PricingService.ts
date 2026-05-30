import { ExchangeRateService } from './ExchangeRateService';
import { round2 } from '../utils/helpers';

/**
 * Satış fiyatı hesaplama.
 * Hetzner fiyatları EUR cinsindendir → canlı kur ile TRY'ye çevrilir ve
 * markup (kâr marjı) uygulanır.
 *
 * NOT: markup ileride settings tablosundan (ürün/plan bazlı) okunacak.
 */
const DEFAULT_MARKUP = 1.6;

export class PricingService {
  /** EUR tutarını canlı kur + markup ile TRY satış fiyatına çevirir. */
  static async eurToSalePriceTRY(eurAmount: number, markup = DEFAULT_MARKUP): Promise<number> {
    const rate = await ExchangeRateService.getEurToTry();
    return round2(eurAmount * rate * markup);
  }

  static getMarkup(): number {
    return DEFAULT_MARKUP;
  }
}
