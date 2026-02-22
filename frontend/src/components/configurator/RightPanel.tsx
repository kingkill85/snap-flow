import { useState, useEffect } from 'react';
import { Button } from 'flowbite-react';
import { HiDocumentDownload, HiReceiptTax } from 'react-icons/hi';
import { ProductPanel } from './ProductPanel';
import { BomPanel } from './BomPanel';
import type { Placement } from '../../services/placement';
import { bomService } from '../../services/bom';

interface RightPanelProps {
  projectId: number;
  placements: Placement[];
  floorplanId?: number;
  placementsVersion?: number;
}

export function RightPanel({ projectId, placements, floorplanId, placementsVersion = 0 }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'products' | 'bom'>('products');
  const [projectTotal, setProjectTotal] = useState<number>(0);
  const [isLoadingTotal, setIsLoadingTotal] = useState(false);

  // Fetch project total (across all floorplans)
  useEffect(() => {
    const fetchProjectTotal = async () => {
      try {
        setIsLoadingTotal(true);
        const data = await bomService.getProjectTotal(projectId);
        setProjectTotal(data.totalPrice);
      } catch (err) {
        console.error('Failed to load project total:', err);
      } finally {
        setIsLoadingTotal(false);
      }
    };

    fetchProjectTotal();
  }, [projectId, placementsVersion]);

  return (
    <div className="w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
      {/* Tab Header - Matches floorplan tab style */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
            activeTab === 'products'
              ? 'bg-white shadow-sm border border-gray-200 text-gray-900'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
        >
          <span className="font-medium text-sm">Products</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bom')}
          className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
            activeTab === 'bom'
              ? 'bg-white shadow-sm border border-gray-200 text-gray-900'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
        >
          <span className="font-medium text-sm">Bill of Materials</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'products' ? (
          <div className="h-full overflow-y-auto">
            <ProductPanel placements={placements} className="w-full border-l-0" />
          </div>
        ) : activeTab === 'bom' && floorplanId ? (
          <div className="h-full overflow-y-auto">
            <BomPanel floorplanId={floorplanId} placementsVersion={placementsVersion} className="w-full border-l-0" />
          </div>
        ) : activeTab === 'bom' && !floorplanId ? (
          <div className="h-full flex items-center justify-center text-gray-500 p-4 text-center">
            <p>No floorplan selected.</p>
          </div>
        ) : null}
      </div>

      {/* Fixed Totals Section - Shows for all tabs */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 flex-shrink-0">
        {/* Project Total */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium text-gray-600">Project Total:</span>
          <span className="text-xl font-bold text-gray-900">
            {isLoadingTotal ? (
              <span className="text-gray-400">...</span>
            ) : (
              `$${projectTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button
            color="light"
            size="sm"
            className="w-full"
            disabled
          >
            <HiDocumentDownload className="mr-2 h-4 w-4" />
            Generate Presentation (PDF)
          </Button>
          <Button
            color="light"
            size="sm"
            className="w-full"
            disabled
          >
            <HiReceiptTax className="mr-2 h-4 w-4" />
            Create Invoice (PDF)
          </Button>
        </div>
      </div>
    </div>
  );
}
