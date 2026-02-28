import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { currencyService } from '../services/currency.ts';

const currencyRoutes = new Hono();

// GET /currency/exchange-rate/:code - Get exchange rate for currency
currencyRoutes.get('/exchange-rate/:code', authMiddleware, async (c) => {
  const currencyCode = c.req.param('code');

  try {
    const { rate, fromCache } = await currencyService.getExchangeRate(currencyCode);

    return c.json({
      data: {
        rate,
        fromCache,
        currencyCode: currencyCode.toUpperCase(),
      },
    });
  } catch (error) {
    console.error('Get exchange rate error:', error);
    return c.json({ error: 'Failed to fetch exchange rate' }, 500);
  }
});

export default currencyRoutes;
