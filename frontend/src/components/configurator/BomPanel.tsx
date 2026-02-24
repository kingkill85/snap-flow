import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { FloorplanBom, ChangeReport } from '@/services/bom';
import { bomService } from '@/services/bom';

interface BOMPanelProps {
  floorplanId: number;
  placementsVersion?: number;
  className?: string;
}

export function BOMPanel({ floorplanId, placementsVersion = 0, className = '' }: BOMPanelProps) {
  const [bom, setBom] = useState<FloorplanBom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);

  useEffect(() => {
    fetchBom(true);
  }, [floorplanId]);
  
  useEffect(() => {
    if (placementsVersion > 0) {
      fetchBom(false);
    }
  }, [placementsVersion]);

  const fetchBom = async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true);
      const data = await bomService.getBomForFloorplan(floorplanId);
      setBom(data);
      if (!bom) {
        setExpandedGroups(new Set(data.groups.map(g => g.mainEntry.id)));
      }
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load BOM');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const toggleGroup = (groupId: number) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleUpdateFromCatalog = async () => {
    if (!confirm('Update BOM prices from current catalog? This will show a change report.')) {
      return;
    }
    
    try {
      setIsUpdating(true);
      const report = await bomService.updateFromCatalog(floorplanId);
      setChangeReport(report);
      await fetchBom(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update from catalog');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="p-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => fetchBom(true)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!bom || bom.groups.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="p-4 border-b border-border/50">
          <h2 className="text-lg font-semibold">Bill of Materials</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground text-center">
          <div>
            <p>No items in BOM yet.</p>
            <p className="text-sm mt-1">Drag items from the product panel to the canvas to add them.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{bom.groups.length} item groups</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdateFromCatalog}
            disabled={true}
            title="Update from catalog (coming soon)"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {changeReport && (
        <div className="p-4 bg-yellow-50 border-b border-yellow-200">
          <h3 className="font-semibold text-sm mb-2">Update Report</h3>
          {changeReport.updated.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Price changes:</p>
              <ul className="text-xs space-y-1">
                {changeReport.updated.map(update => (
                  <li key={update.entryId}>
                    {update.name}: ${update.oldPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${update.newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {changeReport.invalid.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-destructive mb-1">Invalid references:</p>
              <ul className="text-xs space-y-1">
                {changeReport.invalid.map(inv => (
                  <li key={inv.entryId} className="text-destructive">
                    {inv.name}: {inv.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-between text-xs mt-2 pt-2 border-t border-yellow-200">
            <span>Before: ${changeReport.totalBefore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>After: ${changeReport.totalAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setChangeReport(null)} className="mt-2">
            Close Report
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {bom.groups.filter(group => group.quantity > 0).map((group) => {
          const isExpanded = expandedGroups.has(group.mainEntry.id);
          const hasChildren = group.children.length > 0;
          
          return (
            <Card key={group.mainEntry.id} className="mb-2 border-border/50 shadow-none">
              <div 
                className="flex items-center gap-3 cursor-pointer p-3"
                onClick={() => hasChildren && toggleGroup(group.mainEntry.id)}
              >
                {hasChildren && (
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                )}
                
                <div className="w-12 h-12 bg-muted rounded flex-shrink-0 overflow-hidden">
                  {group.mainEntry.picture_path ? (
                    <img
                      src={`/uploads/${group.mainEntry.picture_path}`}
                      alt={group.mainEntry.item_name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      No img
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {group.mainEntry.item_name}
                    {group.mainEntry.style_name && (
                      <span className="text-muted-foreground"> - {group.mainEntry.style_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {group.mainEntry.model_number || 'No model #'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      x{group.quantity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ${group.mainEntry.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-sm">
                    ${(group.mainEntry.unit_price * group.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              
              {hasChildren && !isExpanded && (
                <div className="mt-2 flex items-center justify-between px-3 pb-3">
                  <span className="text-xs text-muted-foreground ml-6">
                    + {group.children.length} Add-On{group.children.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    ${group.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {isExpanded && hasChildren && (
                <CardContent className="pt-0">
                  <div className="pl-6 border-l-2 border-border space-y-3">
                    {group.children.map((child) => (
                      <div key={child.id} className="flex items-center gap-3 py-1">
                        <div className="w-12 h-12 bg-muted rounded flex-shrink-0 overflow-hidden">
                          {child.picture_path ? (
                            <img
                              src={`/uploads/${child.picture_path}`}
                              alt={child.item_name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                              No img
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs truncate">
                            {child.item_name}
                            {child.style_name && (
                              <span className="text-muted-foreground"> - {child.style_name}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {child.model_number || 'No model #'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              x{group.quantity}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              ${child.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-xs">
                            ${(child.unit_price * group.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    <div className="flex justify-between items-center pt-2 border-t border-border mt-2">
                      <span className="text-xs font-medium text-muted-foreground">Group Total:</span>
                      <span className="font-semibold text-sm">${group.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="border-t border-border/50 p-4 bg-muted/20 flex-shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-muted-foreground">Floorplan Total:</span>
          <span className="text-sm font-bold">
            ${bom.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
