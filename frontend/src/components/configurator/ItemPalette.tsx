import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Item } from '@/services/item';
import { itemService } from '@/services/item';
import type { Category } from '@/services/category';
import { categoryService } from '@/services/category';
import { itemTypeService, type ItemType } from '@/services/item-type';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/utils';

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
      style={{ borderTopWidth: 3, borderTopColor: item.type_color || 'hsl(var(--border))' }}
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
  visibleCategories?: Set<number>;
  onToggleCategory?: (categoryId: number) => void;
  onToggleAllCategories?: (visible: boolean) => void;
  categoryCounts?: Map<number, number>;
  projectItemTypeIds?: number[];
  hiddenTypeIds?: Set<number>;
  onToggleTypeVisibility?: (typeId: number) => void;
  onToggleAllTypeVisibility?: (visible: boolean) => void;
}

export const ItemPalette = forwardRef<ItemPaletteRef, ItemPaletteProps>(function ItemPalette({
  className = '',
  visibleCategories,
  onToggleCategory,
  onToggleAllCategories,
  categoryCounts,
  projectItemTypeIds,
  hiddenTypeIds,
  onToggleTypeVisibility,
  onToggleAllTypeVisibility,
}, ref) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<number | null>(null);
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
        const [categoriesData, itemsResult, typesData] = await Promise.all([
          categoryService.getAll(),
          itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }),
          itemTypeService.getAll(),
        ]);
        setCategories(categoriesData.filter(c => c.is_active !== false));
        setItems(itemsResult.items);
        setItemTypes(typesData);
        
        // Preload images and cache aspect ratios
        preloadImages(itemsResult.items);
        
        setError('');
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load products'));
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

  const visibleProjectTypes = itemTypes.filter(t => !projectItemTypeIds || projectItemTypeIds.includes(t.id));
  const allCategoriesVisible = categories.every(cat => visibleCategories?.has(cat.id) ?? true);
  const allTypesVisible = visibleProjectTypes.every(t => !hiddenTypeIds?.has(t.id));
  const allVisible = allCategoriesVisible && allTypesVisible;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {onToggleAllCategories && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Layers</span>
          <div className="flex items-center gap-1">
            {onToggleTypeVisibility && visibleProjectTypes.length > 1 && visibleProjectTypes.map(t => {
              const isVisible = !hiddenTypeIds?.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onToggleTypeVisibility(t.id)}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none transition-opacity ${isVisible ? 'opacity-100' : 'opacity-30'}`}
                  style={{ backgroundColor: t.color }}
                  title={isVisible ? `Hide ${t.name}` : `Show ${t.name}`}
                >
                  {t.abbreviation}
                </button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs ml-1"
              onClick={() => { onToggleAllCategories(!allVisible); onToggleAllTypeVisibility?.(!allVisible); }}
            >
              {allVisible ? (
                <><EyeOff className="h-3 w-3 mr-1" /> Hide All</>
              ) : (
                <><Eye className="h-3 w-3 mr-1" /> Show All</>
              )}
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {visibleProjectTypes.length > 1 && (
          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setSelectedTypeFilter(null)}
              className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold leading-none transition-opacity ${
                selectedTypeFilter === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground opacity-50'
              }`}
            >All</button>
            {visibleProjectTypes.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTypeFilter(selectedTypeFilter === t.id ? null : t.id)}
                className={`inline-flex items-center px-1.5 py-1 rounded text-[11px] font-semibold text-white leading-none transition-opacity ${
                  selectedTypeFilter !== null && selectedTypeFilter !== t.id ? 'opacity-30' : 'opacity-100'
                }`}
                style={{ backgroundColor: t.color }}
                title={t.name}
              >{t.abbreviation}</button>
            ))}
          </div>
        )}
        {categories.map((category) => {
          const categoryItems = items.filter((item) =>
            item.category_id === category.id &&
            (selectedTypeFilter === null
              ? (!projectItemTypeIds || projectItemTypeIds.includes(item.type_id))
              : item.type_id === selectedTypeFilter)
          );
          if (categoryItems.length === 0) return null;

          const isVisible = visibleCategories?.has(category.id) ?? true;
          const count = categoryCounts?.get(category.id) ?? 0;

          return (
            <div key={category.id} className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
                  {category.name}
                  <span className={`text-xs font-normal px-1.5 py-0.5 rounded ${
                    !isVisible && count > 0
                      ? 'bg-orange-500/20 text-orange-400 dark:text-orange-300 font-medium'
                      : 'text-muted-foreground bg-muted'
                  }`}>
                    {count}
                  </span>
                </h3>
                {onToggleCategory && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onToggleCategory(category.id)}
                    title={isVisible ? 'Hide layer' : 'Show layer'}
                  >
                    {isVisible ? (
                      <Eye className="h-4 w-4 text-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </Button>
                )}
              </div>

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
