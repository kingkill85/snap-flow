import { useState, useEffect } from 'react';
import { Button, Spinner, Alert } from 'flowbite-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { HiDocumentDownload, HiReceiptTax } from 'react-icons/hi';
import type { Item } from '../../services/item';
import { itemService } from '../../services/item';
import type { Category } from '../../services/category';
import { categoryService } from '../../services/category';
import type { Placement } from '../../services/placement';

interface DraggableProductCardProps {
  item: Item;
}

function DraggableProductCard({ item }: DraggableProductCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: {
      item,
      type: 'item',
    },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  // Use preview image from first variant
  const imageUrl = item.preview_image ? `/uploads/${item.preview_image}` : null;
  
  // Get price from first variant
  const price = item.variants?.[0]?.price || 0;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...style,
        visibility: isDragging ? 'hidden' : 'visible',
      }}
      className="cursor-grab hover:shadow-md transition-shadow bg-white border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Product Image */}
      <div className="aspect-square bg-gray-100 relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            No Image
          </div>
        )}
      </div>
      
      {/* Product Info */}
      <div className="p-2">
        <p className="text-sm font-medium text-gray-900 truncate" title={item.name}>
          {item.name}
        </p>
        <p className="text-sm font-semibold text-gray-700 mt-1">
          ${price.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

interface ProductPanelProps {
  className?: string;
  placements?: Placement[];
}

export function ProductPanel({ className = '', placements = [] }: ProductPanelProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [categoriesData, itemsResult] = await Promise.all([
          categoryService.getAll(),
          itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }),
        ]);
        setCategories(categoriesData);
        setItems(itemsResult.items);
        setError('');
      } catch (err: any) {
        setError(err.message || 'Failed to load products');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate total from placements
  const calculateTotal = (): number => {
    return placements.reduce((total, placement) => {
      const item = items.find(i => i.id === placement.item_id);
      if (item) {
        const variant = item.variants?.find(v => v.id === placement.item_variant_id);
        const price = variant?.price || 0;
        return total + price;
      }
      return total;
    }, 0);
  };

  const total = calculateTotal();

  if (isLoading) {
    return (
      <div className={`w-[350px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
        <div className="flex-1 flex justify-center items-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-[350px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col ${className}`}>
        <div className="p-4">
          <Alert color="failure">{error}</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-[350px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col h-full ${className}`}>
      {/* Scrollable Product Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {categories.map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          if (categoryItems.length === 0) return null;

          return (
            <div key={category.id} className="mb-6">
              {/* Category Header - ALL CAPS */}
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">
                {category.name}
              </h3>
              
              {/* 2-Column Product Grid */}
              <div className="grid grid-cols-2 gap-3">
                {categoryItems.map((item) => (
                  <DraggableProductCard
                    key={item.id}
                    item={item}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed Totals Section */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        {/* Total */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium text-gray-600">TOTAL:</span>
          <span className="text-xl font-bold text-gray-900">
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
