import { useState, useEffect } from 'react';
import { Spinner, Alert } from 'flowbite-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
      {/* Product Image - compact for 3-column layout */}
      <div className="h-12 bg-gray-100 relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-contain p-0.5"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
            No Image
          </div>
        )}
      </div>
      
      {/* Product Info - no price */}
      <div className="px-1 py-0.5">
        <p className="text-[10px] font-medium text-gray-900 truncate leading-tight" title={item.name}>
          {item.name}
        </p>
      </div>
    </div>
  );
}

interface ProductPanelProps {
  className?: string;
  placements?: Placement[];
}

export function ProductPanel({ className = '', placements: _placements = [] }: ProductPanelProps) {
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

  if (isLoading) {
    return (
      <div className={`flex-shrink-0 bg-white flex flex-col ${className}`}>
        <div className="flex-1 flex justify-center items-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex-shrink-0 bg-white flex flex-col ${className}`}>
        <div className="p-4">
          <Alert color="failure">{error}</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-shrink-0 bg-white flex flex-col h-full ${className}`}>
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
              
              {/* 3-Column Product Grid */}
              <div className="grid grid-cols-3 gap-2">
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
    </div>
  );
}
