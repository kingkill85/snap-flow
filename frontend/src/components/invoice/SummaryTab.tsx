import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings, FileDown, Receipt, Loader2 } from 'lucide-react';
import { bomService } from '@/services/bom';
import { generateInvoiceDOCX } from '@/services/invoice-docx';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { Floorplan } from '@/services/floorplan';

interface FloorplanItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface SummaryTabProps {
  projectName: string;
  projectNumber: string;
  customerName: string;
  floorplans: Floorplan[];
  invoiceSettings: InvoiceSettings | null;
  onConfigureInvoice: () => void;
  placementsVersion: number;
}

interface FloorplanTotal {
  floorplan: Floorplan;
  total: number;
  items: FloorplanItem[];
  isLoading: boolean;
}

export function SummaryTab({
  projectName,
  projectNumber,
  customerName,
  floorplans,
  invoiceSettings,
  onConfigureInvoice,
  placementsVersion,
}: SummaryTabProps) {
  const [floorplanTotals, setFloorplanTotals] = useState<FloorplanTotal[]>([]);
  const [projectTotal, setProjectTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch totals when tab becomes active or placements change
  useEffect(() => {
    const fetchTotals = async () => {
      setIsLoading(true);
      try {
        // Initialize with loading state
        setFloorplanTotals(
          floorplans.map((fp) => ({
            floorplan: fp,
            total: 0,
            items: [],
            isLoading: true,
          }))
        );

        // Fetch totals and items for all floorplans in parallel
        const totals = await Promise.all(
          floorplans.map(async (floorplan) => {
            try {
              const bom = await bomService.getBomForFloorplan(floorplan.id);
              const items: FloorplanItem[] = [];

              bom.groups.forEach((group) => {
                // Add main entry
                const mainName = `${group.mainEntry.item_name}${group.mainEntry.style_name ? ` (${group.mainEntry.style_name})` : ''}`;
                items.push({
                  name: mainName,
                  quantity: group.quantity,
                  unitPrice: group.mainEntry.unit_price,
                  total: group.mainEntry.unit_price * group.quantity,
                });

                // Add children (add-ons) as separate line items
                group.children.forEach((child) => {
                  const childName = `${child.item_name}${child.style_name ? ` (${child.style_name})` : ''}`;
                  items.push({
                    name: childName,
                    quantity: group.quantity,
                    unitPrice: child.unit_price,
                    total: child.unit_price * group.quantity,
                  });
                });
              });

              return {
                floorplan,
                total: bom.totalPrice,
                items,
                isLoading: false,
              };
            } catch (err) {
              console.error(`Failed to fetch BOM for floorplan ${floorplan.id}:`, err);
              return {
                floorplan,
                total: 0,
                items: [],
                isLoading: false,
              };
            }
          })
        );

        setFloorplanTotals(totals);

        // Calculate project total
        const total = totals.reduce((sum, item) => sum + item.total, 0);
        setProjectTotal(total);
      } catch (err) {
        console.error('Failed to fetch totals:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTotals();
  }, [floorplans, placementsVersion]);

  const formatCurrency = (amount: number, decimals = 2) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Calculate invoice totals (allow negative)
  const discountAmount = invoiceSettings?.discount_usd || 0;
  const servicesAmount = invoiceSettings?.services_usd || 0;
  const totalAfterDiscount = projectTotal - discountAmount;
  const grandTotalUsd = totalAfterDiscount + servicesAmount;
  const exchangeRate = invoiceSettings?.exchange_rate || 0;
  const grandTotalLocal = grandTotalUsd * exchangeRate;
  const localCurrencyCode = invoiceSettings?.local_currency_code || 'PKR';

  const hasInvoiceSettings = invoiceSettings && (
    invoiceSettings.discount_usd > 0 ||
    invoiceSettings.services_usd > 0 ||
    invoiceSettings.exchange_rate > 0
  );

  const handleGenerateInvoice = async () => {
    await generateInvoiceDOCX({
      projectName,
      projectNumber,
      customerName,
      floorplanTotals: floorplanTotals.map(ft => ({
        floorplan: ft.floorplan,
        total: ft.total,
        items: ft.items,
      })),
      projectTotal,
      invoiceSettings,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Floorplan Breakdown */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Floorplan Breakdown
          </h3>
          <div className="space-y-2">
            {floorplanTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No floorplans yet. Create a floorplan to see breakdown.
              </p>
            ) : (
              <>
                {floorplanTotals.map(({ floorplan, total }) => (
                  <div key={floorplan.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{floorplan.name}</span>
                    <span>${formatCurrency(total)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Project Total</span>
                  <span>${formatCurrency(projectTotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Invoice Summary */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Invoice Summary
          </h3>

          {floorplanTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add floorplans and items to see invoice summary.
            </p>
          ) : !hasInvoiceSettings ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Configure invoice settings to see breakdown.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-destructive">-${formatCurrency(discountAmount)}</span>
                </div>
              )}

              {servicesAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Services</span>
                  <span className="text-green-600">+${formatCurrency(servicesAmount)}</span>
                </div>
              )}

              <Separator />

              <div className="flex justify-between font-semibold">
                <span>Grand Total USD</span>
                <span>${formatCurrency(grandTotalUsd)}</span>
              </div>

              {exchangeRate > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Grand Total {localCurrencyCode}</span>
                  <span>
                    {formatCurrency(grandTotalLocal, 0)} {localCurrencyCode}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Buttons at Bottom */}
      <div className="border-t bg-muted/30 p-4 space-y-2">
        {!hasInvoiceSettings ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onConfigureInvoice}
          >
            <Settings className="mr-2 h-4 w-4" />
            Configure Invoice
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onConfigureInvoice}
          >
            <Settings className="mr-2 h-4 w-4" />
            Edit Invoice Settings
          </Button>
        )}

        {floorplanTotals.length > 0 && hasInvoiceSettings && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled
            >
              <FileDown className="mr-2 h-4 w-4" />
              Generate Presentation (PDF)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!hasInvoiceSettings}
              onClick={handleGenerateInvoice}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Create Invoice (DOCX)
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
