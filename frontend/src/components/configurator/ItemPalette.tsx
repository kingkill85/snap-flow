import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
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
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `item-${item.id}`,
    data: {
      itemId: item.id,
      type: 'item',
      isCtrlPressed,
    },
  });

  // Track Ctrl key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setIsCtrlPressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setIsCtrlPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const imageUrl = item.preview_image ? itemService.getImageUrl(item.preview_image) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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

export interface ItemPaletteRef {
  getImageAspectRatio: (imagePath: string) => number | null;
}

interface ItemPaletteProps {
  className?: string;
}

export const ItemPalette = forwardRef<ItemPaletteRef, ItemPaletteProps>(function ItemPalette({ className = '' }, ref) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Cache for image aspect ratios (image_path -> aspect_ratio)
  const imageAspectRatios = useRef<Map<string, number>>(new Map());

  // Expose aspect ratio getter to parent
  useImperativeHandle(ref, () => ({
    getImageAspectRatio: (imagePath: string) => {
      return imageAspectRatios.current.get(imagePath) ?? null;
    },
  }));

  // Preload images and calculate aspect ratios
  const preloadImages = (itemsToLoad: Item[]) => {
    itemsToLoad.forEach(item => {
      // Check preview image
      if (item.preview_image) {
        const imageUrl = itemService.getImageUrl(item.preview_image);
        if (imageUrl) {
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              imageAspectRatios.current.set(item.preview_image!, img.naturalWidth / img.naturalHeight);
            }
          };
          img.src = imageUrl;
        }
      }
      
      // Check variant images
      item.variants?.forEach(variant => {
        if (variant.image_path) {
          const imageUrl = itemService.getImageUrl(variant.image_path);
          if (imageUrl) {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                imageAspectRatios.current.set(variant.image_path!, img.naturalWidth / img.naturalHeight);
              }
            };
            img.src = imageUrl;
          }
        }
      });
    });
  };

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
        
        // Preload images and cache aspect ratios
        preloadImages(itemsResult.items);
        
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
});
