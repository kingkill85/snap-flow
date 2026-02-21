import { useState, useEffect } from 'react';
import { Button, Spinner, Alert, Card, Badge } from 'flowbite-react';
import { HiChevronDown, HiChevronRight, HiRefresh } from 'react-icons/hi';
import type { FloorplanBom, ChangeReport } from '../../services/bom';
import { bomService } from '../../services/bom';

interface BomPanelProps {
  floorplanId: number;
  className?: string;
}

export function BomPanel({ floorplanId, className = '' }: BomPanelProps) {
  const [bom, setBom] = useState<FloorplanBom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);

  useEffect(() => {
    fetchBom(true); // Show loading on initial fetch
    
    // Auto-refresh every 2 seconds to sync with canvas changes
    const interval = setInterval(() => fetchBom(false), 2000);
    
    return () => clearInterval(interval);
  }, [floorplanId]);

  const fetchBom = async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true);
      const data = await bomService.getBomForFloorplan(floorplanId);
      setBom(data);
      // Auto-expand all groups initially (only on first load)
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
      await fetchBom(true); // Refresh BOM after update
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update from catalog');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
        <div className="flex-1 flex justify-center items-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
        <div className="p-4">
          <Alert color="failure">{error}</Alert>
          <Button color="light" size="sm" onClick={() => fetchBom(true)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!bom || bom.groups.length === 0) {
    return (
      <div className={`w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Bill of Materials</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-gray-500 text-center">
          <div>
            <p>No items in BOM yet.</p>
            <p className="text-sm mt-1">Drag items from the product panel to the canvas to add them.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Bill of Materials</h2>
          <Button
            color="light"
            size="xs"
            onClick={handleUpdateFromCatalog}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Spinner size="sm" className="mr-1" />
            ) : (
              <HiRefresh className="mr-1" />
            )}
            Update
          </Button>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">{bom.groups.length} item groups</span>
          <span className="font-semibold text-lg">
            Total: ${bom.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Change Report Modal */}
      {changeReport && (
        <div className="p-4 bg-yellow-50 border-b border-yellow-200">
          <h3 className="font-semibold text-sm mb-2">Update Report</h3>
          {changeReport.updated.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-600 mb-1">Price changes:</p>
              <ul className="text-xs space-y-1">
                {changeReport.updated.map(update => (
                  <li key={update.entryId}>
                    {update.name}: ${update.oldPrice.toFixed(2)} → ${update.newPrice.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {changeReport.invalid.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-red-600 mb-1">Invalid references:</p>
              <ul className="text-xs space-y-1">
                {changeReport.invalid.map(inv => (
                  <li key={inv.entryId} className="text-red-600">
                    {inv.name}: {inv.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-between text-xs mt-2 pt-2 border-t border-yellow-200">
            <span>Before: ${changeReport.totalBefore.toFixed(2)}</span>
            <span>After: ${changeReport.totalAfter.toFixed(2)}</span>
          </div>
          <Button color="light" size="xs" onClick={() => setChangeReport(null)} className="mt-2">
            Close Report
          </Button>
        </div>
      )}

      {/* BOM Groups List - filter out entries with 0 quantity */}
      <div className="flex-1 overflow-y-auto p-2">
        {bom.groups.filter(group => group.quantity > 0).map((group) => {
          const isExpanded = expandedGroups.has(group.mainEntry.id);
          const hasChildren = group.children.length > 0;
          
          return (
            <Card key={group.mainEntry.id} className="mb-2">
              {/* Main Item Row */}
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => hasChildren && toggleGroup(group.mainEntry.id)}
              >
                {hasChildren && (
                  <span className="text-gray-500">
                    {isExpanded ? <HiChevronDown /> : <HiChevronRight />}
                  </span>
                )}
                
                {/* Picture */}
                <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                  {group.mainEntry.picture_path ? (
                    <img
                      src={`/uploads/${group.mainEntry.picture_path}`}
                      alt={group.mainEntry.name_snapshot}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                      No img
                    </div>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {group.mainEntry.name_snapshot}
                  </p>
                  <p className="text-xs text-gray-500">
                    {group.mainEntry.model_number_snapshot || 'No model #'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color="blue" size="xs">
                      x{group.quantity}
                    </Badge>
                    <span className="text-xs text-gray-600">
                      ${group.mainEntry.price_snapshot.toFixed(2)} each
                    </span>
                  </div>
                </div>
                
                {/* Price & Delete */}
                <div className="text-right">
                  <p className="font-semibold text-sm">
                    ${(group.mainEntry.price_snapshot * group.quantity).toFixed(2)}
                  </p>
                </div>
              </div>
              
              {/* Children (Addons) */}
              {isExpanded && hasChildren && (
                <div className="mt-3 pl-6 border-l-2 border-gray-200 space-y-2">
                  {group.children.map((child) => (
                    <div key={child.id} className="flex items-center gap-2 py-1">
                      <div className="w-8 h-8 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        {child.picture_path ? (
                          <img
                            src={`/uploads/${child.picture_path}`}
                            alt={child.name_snapshot}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                            -
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{child.name_snapshot}</p>
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-gray-500">x{group.quantity}</span>
                        <span className="ml-2">${(child.price_snapshot * group.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                  
                  {/* Group Total */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                    <span className="text-xs font-medium text-gray-600">Group Total:</span>
                    <span className="font-semibold text-sm">${group.totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
