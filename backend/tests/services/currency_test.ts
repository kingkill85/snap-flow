import { assertEquals, assertRejects } from '@std/assert';
import { currencyService } from '../../src/services/currency.ts';

Deno.test('Currency Service - getExchangeRate', async () => {
  // Clear cache before test
  currencyService.clearCache();
  
  // Test fetching PKR rate
  const result = await currencyService.getExchangeRate('PKR');
  
  // Verify structure
  assertEquals(typeof result.rate, 'number');
  assertEquals(result.rate > 0, true);
  assertEquals(result.fromCache, false);
  
  // Test caching - second call should be from cache
  const cachedResult = await currencyService.getExchangeRate('PKR');
  assertEquals(cachedResult.fromCache, true);
  assertEquals(cachedResult.rate, result.rate);
});

Deno.test('Currency Service - getUSDtoPKRRate', async () => {
  currencyService.clearCache();
  
  const result = await currencyService.getUSDtoPKRRate();
  
  assertEquals(typeof result.rate, 'number');
  assertEquals(result.rate > 200, true); // PKR should be > 200
  assertEquals(result.fromCache, false);
});

Deno.test('Currency Service - cache functionality', async () => {
  currencyService.clearCache();
  
  // First call - not from cache
  const result1 = await currencyService.getExchangeRate('EUR');
  assertEquals(result1.fromCache, false);
  
  // Second call - should be from cache
  const result2 = await currencyService.getExchangeRate('EUR');
  assertEquals(result2.fromCache, true);
  
  // Verify cache status
  const cacheStatus = currencyService.getCacheStatus();
  assertEquals(cacheStatus.size >= 1, true);
});

Deno.test('Currency Service - handles invalid currency code', async () => {
  currencyService.clearCache();
  
  await assertRejects(
    async () => await currencyService.getExchangeRate('INVALID'),
    Error,
    'Currency code INVALID not found'
  );
});
