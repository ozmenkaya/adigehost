import { Router } from 'express';
import { Product } from '../models';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Müşteriye açık ürün/paket listesi (yalnızca satılabilir = isActive).
 * authenticate ile korunur (routes/index.ts).
 */
export const productsRouter = Router();

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = (req.query.type as string) || 'hosting';
    const products = await Product.findAll({
      where: { isActive: true, type },
      attributes: [
        'id',
        'name',
        'type',
        'priceMonthly',
        'priceAnnually',
        'setupFee',
        'specs',
        'description',
      ],
      order: [
        ['sortOrder', 'ASC'],
        ['priceMonthly', 'ASC'],
      ],
    });
    res.json({ success: true, data: products });
  }),
);
