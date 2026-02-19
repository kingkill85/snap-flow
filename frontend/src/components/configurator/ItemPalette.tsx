import { useState, useEffect } from 'react';
import { Card, Spinner, Alert } from 'flowbite-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../../services/item';
import { itemService } from '../../services/item';
import type { Category } from '../../services/category';
import { categoryService } from '../../services/category';

interface DraggableItemProps {
  item: Item;
}

function DraggableItem({ item }: DraggableItemProps) {
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
      style={style}
      className={`p-2 border rounded cursor-grab hover:bg-gray-50 transition-colors ${
        isDragging ? 'opacity-50 cursor-grabbing' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-10 h-10 object-cover rounded"
          />
        ) : (
          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
            No img
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          <p className="text-xs text-gray-500 truncate">{item.base_model_number || 'No model #'}</p>
        </div>
      </div>
    </div>
  );
}

interface ItemPaletteProps {
  className?: string;
}

export function ItemPalette({ className = '' }: ItemPaletteProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [categoriesData, itemsResult] = await Promise.all([
          categoryService.getAll(),
          itemService.getAll({ include_inactive: false }),
        ]);
        setCategories(categoriesData);
        // Show all active items (they all have preview_image from first variant)
        setItems(itemsResult.items);
        
        // Expand first category by default
        if (categoriesData.length > 0) {
          setExpandedCategories(new Set([categoriesData[0].id]));
        }
        
        setError('');
      } catch (err: any) {
        setError(err.message || 'Failed to load items');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Card className={`h-full ${className}`}>
        <div className="flex justify-center items-center h-32">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`h-full ${className}`}>
        <Alert color="failure">{error}</Alert>
      </Card>
    );
  }

  return (
    <Card className={`h-full ${className}`}>
      <h3 className="text-lg font-semibold mb-4">Item Palette</h3>
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {categories.map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          if (categoryItems.length === 0) return null;

          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className="border rounded">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-t transition-colors"
              >
                <span className="font-medium text-sm">{category.name}</span>
                <span className="text-gray-500 text-xs">
                  {isExpanded ? '−' : '+'}
                </span>
              </button>
              {isExpanded && (
                <div className="p-2 space-y-2">
                  {categoryItems.map((item) => (
                    <DraggableItem
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
