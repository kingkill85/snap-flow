import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, X, RefreshCw } from 'lucide-react';
import { invoiceSettingsService, type InvoiceSettings } from '@/services/invoice-settings';

interface InvoiceSettingsModalProps {
  projectId: number;
  bomTotal: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: InvoiceSettings) => void;
  initialSettings?: InvoiceSettings;
}

export function InvoiceSettingsModal({
  projectId,
  bomTotal,
  isOpen,
  onClose,
  onSave,
  initialSettings,
}: InvoiceSettingsModalProps) {
  const [formData, setFormData] = useState<InvoiceSettings>({
    discount_percentage: 0,
    discount_usd: 0,
    services_percentage: 0,
    services_usd: 0,
    local_currency_code: 'PKR',
    exchange_rate: 0,
  });
  const [googleRate, setGoogleRate] = useState<number>(0);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialSettings) {
        setFormData(initialSettings);
      } else {
        setFormData({
          discount_percentage: 0,
          discount_usd: 0,
          services_percentage: 0,
          services_usd: 0,
          local_currency_code: 'PKR',
          exchange_rate: 0,
        });
      }
      setError('');
    }
  }, [initialSettings, isOpen]);

  // Calculate reference values
  const discountReference = useMemo(() => {
    return bomTotal * (formData.discount_percentage / 100);
  }, [bomTotal, formData.discount_percentage]);

  const servicesReference = useMemo(() => {
    return bomTotal * (formData.services_percentage / 100);
  }, [bomTotal, formData.services_percentage]);

  // Calculate totals
  const totalAfterDiscount = useMemo(() => {
    return Math.max(0, bomTotal - formData.discount_usd);
  }, [bomTotal, formData.discount_usd]);

  const grandTotalUsd = useMemo(() => {
    return totalAfterDiscount + formData.services_usd;
  }, [totalAfterDiscount, formData.services_usd]);

  const grandTotalLocal = useMemo(() => {
    return grandTotalUsd * formData.exchange_rate;
  }, [grandTotalUsd, formData.exchange_rate]);

  const handleFetchGoogleRate = async () => {
    setIsFetchingRate(true);
    try {
      const response = await invoiceSettingsService.getExchangeRate(formData.local_currency_code);
      setGoogleRate(response.rate);
    } catch (err) {
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
      const savedSettings = await invoiceSettingsService.saveSettings(projectId, {
        discount_percentage: formData.discount_percentage,
        discount_usd: formData.discount_usd,
        services_percentage: formData.services_percentage,
        services_usd: formData.services_usd,
        local_currency_code: formData.local_currency_code,
        exchange_rate: formData.exchange_rate,
      });
      onSave(savedSettings);
      onClose();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
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
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* BOM Total Display */}
          <div className="bg-muted/50 p-3 rounded-md">
            <Label className="text-muted-foreground">BOM Total (All Floors)</Label>
            <div className="text-lg font-semibold">${formatCurrency(bomTotal)} USD</div>
          </div>

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
                  value={formData.discount_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) || 0 })
                  }
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
                  value={formData.discount_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_usd: parseFloat(e.target.value) || 0 })
                  }
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
                  value={formData.services_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, services_percentage: parseFloat(e.target.value) || 0 })
                  }
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
                  value={formData.services_usd}
                  onChange={(e) =>
                    setFormData({ ...formData, services_usd: parseFloat(e.target.value) || 0 })
                  }
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
                  value={formData.exchange_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) || 0 })
                  }
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
                <span className="text-muted-foreground">BOM Total:</span>
                <span>${formatCurrency(bomTotal)} USD</span>
              </div>
              {formData.discount_usd > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Discount ({formData.discount_percentage}%):
                  </span>
                  <span className="text-destructive">-${formatCurrency(formData.discount_usd)} USD</span>
                </div>
              )}
              {formData.services_usd > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Services ({formData.services_percentage}%):
                  </span>
                  <span className="text-green-600">+${formatCurrency(formData.services_usd)} USD</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Grand Total USD:</span>
                <span>${formatCurrency(grandTotalUsd)} USD</span>
              </div>
              {formData.exchange_rate > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Grand Total {formData.local_currency_code}:</span>
                  <span>
                    {formatCurrency(grandTotalLocal, 0)} {formData.local_currency_code}
                  </span>
                </div>
              )}
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
