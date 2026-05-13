/**
 * Invoice Calculation Service
 * Calculates invoice totals based on BOM total and invoice settings
 */

interface InvoiceCalculationResult {
  bomTotal: number;
  discountAmount: number;
  discountPercentage: number;
  servicesAmount: number;
  servicesPercentage: number;
  totalAfterDiscount: number;
  grandTotalUsd: number;
  grandTotalLocal: number;
  localCurrencyCode: string;
  exchangeRate: number;
}

interface InvoiceSettings {
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  exchange_rate: number;
  local_currency_code: string;
}

class InvoiceCalculationService {
  /**
   * Calculate invoice totals
   * @param bomTotal - Total from Bill of Materials (all floorplans)
   * @param settings - Invoice configuration settings
   * @returns Calculated invoice breakdown
   */
  calculate(bomTotal: number, settings: InvoiceSettings): InvoiceCalculationResult {
    // Allow negative values
    const discountAmount = settings.discount_usd;
    const servicesAmount = settings.services_usd;
    const exchangeRate = settings.exchange_rate;

    // Calculate totals
    const totalAfterDiscount = bomTotal - discountAmount;
    const grandTotalUsd = totalAfterDiscount + servicesAmount;
    const grandTotalLocal = grandTotalUsd * exchangeRate;

    return {
      bomTotal,
      discountAmount,
      discountPercentage: settings.discount_percentage,
      servicesAmount,
      servicesPercentage: settings.services_percentage,
      totalAfterDiscount,
      grandTotalUsd,
      grandTotalLocal,
      localCurrencyCode: settings.local_currency_code,
      exchangeRate,
    };
  }

  /**
   * Calculate discount reference amount (for the popup calculator)
   * @param bomTotal - Total from Bill of Materials
   * @param percentage - Discount percentage
   * @returns Reference discount amount
   */
  calculateDiscountReference(bomTotal: number, percentage: number): number {
    return bomTotal * (percentage / 100);
  }

  /**
   * Calculate services reference amount (for the popup calculator)
   * @param bomTotal - Total from Bill of Materials
   * @param percentage - Services percentage
   * @returns Reference services amount
   */
  calculateServicesReference(bomTotal: number, percentage: number): number {
    return bomTotal * (percentage / 100);
  }

  /**
   * Format currency amount with proper decimal places
   * @param amount - The amount to format
   * @param currencyCode - Currency code (e.g., 'USD', 'PKR')
   * @returns Formatted string
   */
  formatAmount(amount: number, currencyCode: string): string {
    // PKR typically doesn't use decimal places, others do
    const decimals = currencyCode === 'PKR' ? 0 : 2;
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
}

export const invoiceCalculationService = new InvoiceCalculationService();
