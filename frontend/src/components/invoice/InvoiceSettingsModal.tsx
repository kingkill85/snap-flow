import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, X, RefreshCw } from 'lucide-react';
import { invoiceSettingsService, type InvoiceSettings } from '@/services/invoice-settings';
import { extractErrorMessage } from '@/utils';

interface InvoiceSettingsModalProps {
  groupId: number;
  bomTotal: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: InvoiceSettings) => void;
  initialSettings?: InvoiceSettings;
}

// Form data with string values for better input handling
interface FormData {
  discount_percentage: string;
  discount_usd: string;
  services_percentage: string;
  services_usd: string;
  local_currency_code: string;
  exchange_rate: string;
}

export function InvoiceSettingsModal({
  groupId,
  bomTotal,
  isOpen,
  onClose,
  onSave,
  initialSettings,
}: InvoiceSettingsModalProps) {
  const [formData, setFormData] = useState<FormData>({
    discount_percentage: '',
    discount_usd: '',
    services_percentage: '',
    services_usd: '',
    local_currency_code: 'PKR',
    exchange_rate: '',
  });
  const [googleRate, setGoogleRate] = useState<number>(0);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // Helper to convert number to string for display
  const numToStr = (val: number): string => {
    return val === 0 ? '' : val.toString();
  };

  // Helper to convert string to number
  const strToNum = (val: string): number => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialSettings) {
        setFormData({
          discount_percentage: numToStr(initialSettings.discount_percentage),
          discount_usd: numToStr(initialSettings.discount_usd),
          services_percentage: numToStr(initialSettings.services_percentage),
          services_usd: numToStr(initialSettings.services_usd),
          local_currency_code: initialSettings.local_currency_code || 'PKR',
          exchange_rate: numToStr(initialSettings.exchange_rate),
        });
      } else {
        setFormData({
          discount_percentage: '',
          discount_usd: '',
          services_percentage: '',
          services_usd: '',
          local_currency_code: 'PKR',
          exchange_rate: '',
        });
      }
      setError('');
    }
  }, [initialSettings, isOpen]);

  // Calculate reference values (using numeric values)
  const discountPercentage = strToNum(formData.discount_percentage);
  const discountUsd = strToNum(formData.discount_usd);
  const servicesPercentage = strToNum(formData.services_percentage);
  const servicesUsd = strToNum(formData.services_usd);
  const exchangeRate = strToNum(formData.exchange_rate);

  const discountReference = useMemo(() => {
    return bomTotal * (discountPercentage / 100);
  }, [bomTotal, discountPercentage]);

  const servicesReference = useMemo(() => {
    return bomTotal * (servicesPercentage / 100);
  }, [bomTotal, servicesPercentage]);

  // Calculate totals (clamped to zero)
  const totalAfterDiscount = useMemo(() => {
    return Math.max(0, bomTotal - discountUsd);
  }, [bomTotal, discountUsd]);

  const grandTotalUsd = useMemo(() => {
    return Math.max(0, totalAfterDiscount + servicesUsd);
  }, [totalAfterDiscount, servicesUsd]);

  const grandTotalLocal = useMemo(() => {
    return grandTotalUsd * exchangeRate;
  }, [grandTotalUsd, exchangeRate]);

  const handleFetchGoogleRate = async () => {
    if (!formData.local_currency_code) {
      setError('Please select a currency code first');
      return;
    }
    setIsFetchingRate(true);
    try {
      const response = await invoiceSettingsService.getExchangeRate(formData.local_currency_code);
      setGoogleRate(response.rate);
    } catch (err: unknown) {
      setError('Failed to fetch exchange rate. Please try again.');
    } finally {
      setIsFetchingRate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const savedSettings = await invoiceSettingsService.saveSettings(groupId, {
        discount_percentage: discountPercentage,
        discount_usd: discountUsd,
        services_percentage: servicesPercentage,
        services_usd: servicesUsd,
        local_currency_code: formData.local_currency_code,
        exchange_rate: exchangeRate,
      });
      onSave(savedSettings);
      onClose();
    } catch (err: unknown) {
      const errorData = extractErrorMessage(err);
      setError(typeof errorData === 'string' ? errorData : 'Failed to save invoice settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, decimals = 2) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Configure Invoice</DialogTitle>
          <DialogDescription>
            Customize discount rates, markup percentages, and pricing settings for the project invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex-1 overflow-y-auto px-1 space-y-6">
          {/* Discount Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-primary">Discount</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount_percentage">Percentage (%)</Label>
                <Input
                  id="discount_percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  value={formData.discount_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_percentage: e.target.value })
                  }
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Reference</Label>
                <div className="h-10 flex items-center text-sm text-muted-foreground bg-muted/30 px-3 rounded-md">
                  ${formatCurrency(discountReference)}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount_usd">Amount (USD)</Label>
                <Input
                  id="discount_usd"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formData.discount_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_usd: e.target.value })
                  }
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Services Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-primary">
              Services (System Design, Programming & Commissioning)
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="services_percentage">Percentage (%)</Label>
                <Input
                  id="services_percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  value={formData.services_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, services_percentage: e.target.value })
                  }
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Reference</Label>
                <div className="h-10 flex items-center text-sm text-muted-foreground bg-muted/30 px-3 rounded-md">
                  ${formatCurrency(servicesReference)}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="services_usd">Amount (USD)</Label>
                <Input
                  id="services_usd"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formData.services_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, services_usd: e.target.value })
                  }
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Currency Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-primary">Currency Conversion</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Google Rate (1 USD)</Label>
                <div className="flex gap-2">
                  <div className="flex-1 h-10 flex items-center text-sm bg-muted/30 px-3 rounded-md">
                    {googleRate > 0
                      ? `${formatCurrency(googleRate, 2)} ${formData.local_currency_code}`
                      : '—'}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleFetchGoogleRate}
                    disabled={isFetchingRate}
                    aria-label="Fetch exchange rate from Google"
                  >
                    {isFetchingRate ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exchange_rate">Your Rate (1 USD)</Label>
                <Input
                  id="exchange_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formData.exchange_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, exchange_rate: e.target.value })
                  }
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Preview Section */}
          <div className="bg-muted/30 p-4 rounded-md space-y-2">
            <h4 className="text-sm font-semibold mb-3">Preview</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project Total:</span>
                <span>${formatCurrency(bomTotal)} USD</span>
              </div>
              {discountUsd > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Discount:
                  </span>
                  <span className="text-destructive">-${formatCurrency(discountUsd)} USD</span>
                </div>
              )}
              {servicesUsd > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Services:
                  </span>
                  <span className="text-green-600">+${formatCurrency(servicesUsd)} USD</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Grand Total USD:</span>
                <span>${formatCurrency(grandTotalUsd)} USD</span>
              </div>
              {exchangeRate > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Grand Total {formData.local_currency_code}:</span>
                  <span>
                    {formatCurrency(grandTotalLocal, 0)} {formData.local_currency_code}
                  </span>
                </div>
              )}
            </div>
          </div>

          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
