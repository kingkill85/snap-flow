/**
 * Currency Service
 * Fetches exchange rates from external API
 */

interface ExchangeRateResponse {
  result: string;
  provider: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  rates: Record<string, number>;
}

interface CachedRate {
  rate: number;
  timestamp: number;
  currencyCode: string;
}

class CurrencyService {
  private readonly API_URL = 'https://open.er-api.com/v6/latest/USD';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cache: Map<string, CachedRate> = new Map();

  /**
   * Get exchange rate from USD to target currency
   * Uses caching to avoid hitting API limits
   */
  async getExchangeRate(currencyCode: string): Promise<{ rate: number; fromCache: boolean }> {
    const upperCode = currencyCode.toUpperCase();
    
    // Check cache first
    const cached = this.cache.get(upperCode);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return { rate: cached.rate, fromCache: true };
    }

    // Fetch from API
    try {
      const response = await fetch(this.API_URL);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ExchangeRateResponse = await response.json();

      if (data.result !== 'success') {
        throw new Error('API returned unsuccessful result');
      }

      const rate = data.rates[upperCode];
      
      if (rate === undefined) {
        throw new Error(`Currency code ${currencyCode} not found in exchange rates`);
      }

      // Cache all rates from this request
      Object.entries(data.rates).forEach(([code, rateValue]) => {
        this.cache.set(code, {
          rate: rateValue,
          timestamp: Date.now(),
          currencyCode: code,
        });
      });

      return { rate, fromCache: false };
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
      
      // Return cached value even if expired as fallback
      if (cached) {
        console.warn(`Using expired cached rate for ${upperCode}`);
        return { rate: cached.rate, fromCache: true };
      }
      
      throw error;
    }
  }

  /**
   * Get USD to PKR rate specifically (default for this app)
   */
  getUSDtoPKRRate(): Promise<{ rate: number; fromCache: boolean }> {
    return this.getExchangeRate('PKR');
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): { size: number; entries: Array<{ currency: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([currency, data]) => ({
      currency,
      age: Math.round((now - data.timestamp) / 1000), // age in seconds
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

export const currencyService = new CurrencyService();
