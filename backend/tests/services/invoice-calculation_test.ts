import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { invoiceCalculationService } from '../../src/services/invoice-calculation.ts';

Deno.test('Invoice Calculation Service - calculate with no discount or services', () => {
  const bomTotal = 1000;
  const settings = {
    discount_percentage: 0,
    discount_usd: 0,
    services_percentage: 0,
    services_usd: 0,
    exchange_rate: 280,
    local_currency_code: 'PKR',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  assertEquals(result.bomTotal, 1000);
  assertEquals(result.discountAmount, 0);
  assertEquals(result.servicesAmount, 0);
  assertEquals(result.totalAfterDiscount, 1000);
  assertEquals(result.grandTotalUsd, 1000);
  assertEquals(result.grandTotalLocal, 280000);
  assertEquals(result.localCurrencyCode, 'PKR');
  assertEquals(result.exchangeRate, 280);
});

Deno.test('Invoice Calculation Service - calculate with discount only', () => {
  const bomTotal = 1000;
  const settings = {
    discount_percentage: 10,
    discount_usd: 100,
    services_percentage: 0,
    services_usd: 0,
    exchange_rate: 280,
    local_currency_code: 'PKR',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  assertEquals(result.bomTotal, 1000);
  assertEquals(result.discountAmount, 100);
  assertEquals(result.totalAfterDiscount, 900);
  assertEquals(result.grandTotalUsd, 900);
  assertEquals(result.grandTotalLocal, 252000);
});

Deno.test('Invoice Calculation Service - calculate with services only', () => {
  const bomTotal = 1000;
  const settings = {
    discount_percentage: 0,
    discount_usd: 0,
    services_percentage: 10,
    services_usd: 100,
    exchange_rate: 280,
    local_currency_code: 'PKR',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  assertEquals(result.bomTotal, 1000);
  assertEquals(result.discountAmount, 0);
  assertEquals(result.servicesAmount, 100);
  assertEquals(result.totalAfterDiscount, 1000);
  assertEquals(result.grandTotalUsd, 1100);
  assertEquals(result.grandTotalLocal, 308000);
});

Deno.test('Invoice Calculation Service - calculate with both discount and services', () => {
  const bomTotal = 1000;
  const settings = {
    discount_percentage: 10,
    discount_usd: 100,
    services_percentage: 10,
    services_usd: 100,
    exchange_rate: 280,
    local_currency_code: 'PKR',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  assertEquals(result.bomTotal, 1000);
  assertEquals(result.discountAmount, 100);
  assertEquals(result.servicesAmount, 100);
  assertEquals(result.totalAfterDiscount, 900);
  assertEquals(result.grandTotalUsd, 1000);
  assertEquals(result.grandTotalLocal, 280000);
});

Deno.test('Invoice Calculation Service - handles negative totals', () => {
  const bomTotal = 100;
  const settings = {
    discount_percentage: 50,
    discount_usd: 200,
    services_percentage: 0,
    services_usd: 0,
    exchange_rate: 1,
    local_currency_code: 'USD',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  // Should allow negative values
  assertEquals(result.totalAfterDiscount, -100);
  assertEquals(result.grandTotalUsd, -100);
});

Deno.test('Invoice Calculation Service - calculate discount reference', () => {
  const bomTotal = 1000;
  const percentage = 15;
  
  const reference = invoiceCalculationService.calculateDiscountReference(bomTotal, percentage);
  
  assertEquals(reference, 150);
});

Deno.test('Invoice Calculation Service - calculate services reference', () => {
  const bomTotal = 1000;
  const percentage = 10;
  
  const reference = invoiceCalculationService.calculateServicesReference(bomTotal, percentage);
  
  assertEquals(reference, 100);
});

Deno.test('Invoice Calculation Service - format USD amount', () => {
  const amount = 1234.56;
  const formatted = invoiceCalculationService.formatAmount(amount, 'USD');
  
  assertEquals(formatted, '1,234.56');
});

Deno.test('Invoice Calculation Service - format PKR amount', () => {
  const amount = 1234.56;
  const formatted = invoiceCalculationService.formatAmount(amount, 'PKR');
  
  // PKR should have 0 decimals
  assertEquals(formatted, '1,235');
});

Deno.test('Invoice Calculation Service - handles zero exchange rate', () => {
  const bomTotal = 1000;
  const settings = {
    discount_percentage: 0,
    discount_usd: 0,
    services_percentage: 0,
    services_usd: 0,
    exchange_rate: 0,
    local_currency_code: 'PKR',
  };
  
  const result = invoiceCalculationService.calculate(bomTotal, settings);
  
  assertEquals(result.grandTotalLocal, 0);
});
