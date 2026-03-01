import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings } from 'lucide-react';
import type { InvoiceSettings } from '@/services/invoice-settings';

interface InvoiceSummaryProps {
  bomTotal: number;
  settings: InvoiceSettings | null;
  onConfigure: () => void;
}

export function InvoiceSummary({ bomTotal, settings, onConfigure }: InvoiceSummaryProps) {
  const formatCurrency = (amount: number, decimals = 2) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Calculate totals
  const discountAmount = settings?.discount_usd || 0;
  const servicesAmount = settings?.services_usd || 0;
  const totalAfterDiscount = Math.max(0, bomTotal - discountAmount);
  const grandTotalUsd = totalAfterDiscount + servicesAmount;
  const exchangeRate = settings?.exchange_rate || 0;
  const grandTotalLocal = grandTotalUsd * exchangeRate;
  const localCurrencyCode = settings?.local_currency_code || 'PKR';

  const hasInvoiceSettings = settings && (
    settings.discount_usd > 0 ||
    settings.services_usd > 0 ||
    settings.exchange_rate > 0
  );

  return (
    <div className="space-y-3">
      {/* BOM Total */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Project Total:</span>
        <span className="text-xl font-bold">${formatCurrency(bomTotal)}</span>
      </div>

      {/* Configure Button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onConfigure}
      >
        <Settings className="mr-2 h-4 w-4" />
        {hasInvoiceSettings ? 'Edit Invoice Settings' : 'Configure Invoice'}
      </Button>

      {/* Invoice Details (only shown if configured) */}
      {hasInvoiceSettings && bomTotal > 0 && (
        <div className="pt-2 space-y-2 text-sm">
          {discountAmount > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Discount ({settings?.discount_percentage}%):</span>
              <span>-${formatCurrency(discountAmount)}</span>
            </div>
          )}
          
          {servicesAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Services ({settings?.services_percentage}%):</span>
              <span>+${formatCurrency(servicesAmount)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between font-semibold">
            <span>Grand Total USD:</span>
            <span>${formatCurrency(grandTotalUsd)}</span>
          </div>

          {exchangeRate > 0 && (
            <div className="flex justify-between font-semibold">
              <span>Grand Total {localCurrencyCode}:</span>
              <span>
                {formatCurrency(grandTotalLocal, 0)} {localCurrencyCode}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Show notice when BOM is $0 but settings exist */}
      {hasInvoiceSettings && bomTotal === 0 && (
        <div className="pt-2 text-sm text-muted-foreground text-center">
          Invoice settings configured. Add items to see totals.
        </div>
      )}
    </div>
  );
}
