import { useState, useEffect } from 'react';
import { Button, Spinner, Alert, Card, Badge } from 'flowbite-react';
import { HiChevronDown, HiChevronRight, HiRefresh } from 'react-icons/hi';
import type { FloorplanBom, ChangeReport } from '../../services/bom';
import { bomService } from '../../services/bom';

interface BomPanelProps {
  floorplanId: number;
  placementsVersion?: number; // Increment to trigger refresh
  className?: string;
}

export function BomPanel({ floorplanId, placementsVersion = 0, className = '' }: BomPanelProps) {
  const [bom, setBom] = useState<FloorplanBom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);

  // Initial load
  useEffect(() => {
    fetchBom(true);
  }, [floorplanId]);
  
  // Refresh when placements change
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
      <div className={`flex-shrink-0 bg-white flex flex-col h-full ${className}`}>
        <div className="flex-1 flex justify-center items-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex-shrink-0 bg-white flex flex-col h-full ${className}`}>
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
      <div className={`flex-shrink-0 bg-white flex flex-col h-full ${className}`}>
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
    <div className={`flex-shrink-0 bg-white flex flex-col h-full ${className}`}>
      {/* BOM Info Bar */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{bom.groups.length} item groups</span>
          <Button
            color="light"
            size="xs"
            onClick={handleUpdateFromCatalog}
            disabled={true}
            title="Update from catalog (coming soon)"
          >
            {isUpdating ? (
              <Spinner size="sm" />
            ) : (
              <HiRefresh className="h-4 w-4" />
            )}
          </Button>
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
                    {update.name}: ${update.oldPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${update.newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <span>Before: ${changeReport.totalBefore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>After: ${changeReport.totalAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                      alt={group.mainEntry.item_name}
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
                    {group.mainEntry.item_name}
                    {group.mainEntry.style_name && (
                      <span className="text-gray-500"> - {group.mainEntry.style_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {group.mainEntry.model_number || 'No model #'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color="blue" size="xs">
                      x{group.quantity}
                    </Badge>
                    <span className="text-xs text-gray-600">
                      ${group.mainEntry.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                    </span>
                  </div>
                </div>
                
                {/* Price & Delete */}
                <div className="text-right">
                  <p className="font-semibold text-sm">
                    ${(group.mainEntry.unit_price * group.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              
              {/* Collapsed Summary - Show only when collapsed and has children */}
              {hasChildren && !isExpanded && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500 ml-6">
                    + {group.children.length} Add-On{group.children.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">
                    ${group.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              
              {/* Children (Addons) */}
              {isExpanded && hasChildren && (
                <div className="mt-3 pl-6 border-l-2 border-gray-200 space-y-3">
                  {group.children.map((child) => (
                    <div key={child.id} className="flex items-center gap-3 py-1">
                      {/* Picture - same size as parent */}
                      <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        {child.picture_path ? (
                          <img
                            src={`/uploads/${child.picture_path}`}
                            alt={child.item_name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                            No img
                          </div>
                        )}
                      </div>
                      {/* Info - slightly smaller than parent */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">
                          {child.item_name}
                          {child.style_name && (
                            <span className="text-gray-500"> - {child.style_name}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {child.model_number || 'No model #'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge color="blue" size="xs">
                            x{group.quantity}
                          </Badge>
                          <span className="text-[11px] text-gray-600">
                            ${child.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                          </span>
                        </div>
                      </div>
                      {/* Price */}
                      <div className="text-right">
                        <p className="font-semibold text-xs">
                          ${(child.unit_price * group.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Group Total */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                    <span className="text-xs font-medium text-gray-600">Group Total:</span>
                    <span className="font-semibold text-sm">${group.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Floorplan Total */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-600">Floorplan Total:</span>
          <span className="text-sm font-bold text-gray-900">
            ${bom.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
