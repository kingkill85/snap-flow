import api from './api';

export interface InvoiceSettings {
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
}

export interface InvoiceCalculation {
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

export interface ExchangeRateResponse {
  rate: number;
  fromCache: boolean;
  currencyCode: string;
}

export const invoiceSettingsService = {
  async saveSettings(
    projectId: number, 
    settings: Partial<InvoiceSettings>, 
    signal?: AbortSignal
  ): Promise<InvoiceSettings> {
    const response = await api.put(`/projects/${projectId}/invoice-settings`, settings, { signal });
    return response.data.data;
  },

  async getCalculation(
    projectId: number, 
    signal?: AbortSignal
  ): Promise<InvoiceCalculation> {
    const response = await api.get(`/projects/${projectId}/invoice-calculation`, { signal });
    return response.data.data;
  },

  async getExchangeRate(
    currencyCode: string, 
    signal?: AbortSignal
  ): Promise<ExchangeRateResponse> {
    const response = await api.get(`/currency/exchange-rate/${currencyCode}`, { signal });
    return response.data.data;
  },
};
