import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '@/services/item';
import { itemService } from '@/services/item';
import type { Category } from '@/services/category';
import { categoryService } from '@/services/category';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      className="cursor-grab hover:shadow-md transition-shadow bg-background border border-border rounded-lg overflow-hidden"
    >
      <div className="h-12 bg-muted relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-contain p-0.5"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            No Image
          </div>
        )}
      </div>
      
      <div className="px-1 py-0.5">
        <p className="text-[10px] font-medium text-foreground truncate leading-tight" title={item.name}>
          {item.name}
        </p>
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
        setCategories(categoriesData.filter(c => c.is_active !== false));
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
      <div className={`h-full flex justify-center items-center ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-full p-4 ${className}`}>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-1 overflow-y-auto p-4">
        {categories.map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          if (categoryItems.length === 0) return null;

          return (
            <div key={category.id} className="mb-6">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">
                {category.name}
              </h3>
              
              <div className="grid grid-cols-3 gap-2">
                {categoryItems.map((item) => (
                  <DraggableItem
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
