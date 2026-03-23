import { useMemo, useCallback } from 'react';
import type { Floorplan } from '@/services/floorplan';
import type { FloorplanBom, BomGroup, FloorplanItem, FloorplanTotal } from '@/services/bom';
import type { Item } from '@/services/item';
import type { Category } from '@/services/category';

/**
 * Hook to calculate BOM totals and aggregate items
 */
export function useBomCalculations(
  floorplans: Floorplan[],
  floorplanBoms: Map<number, FloorplanBom>,
  items: Item[],
  categories: Category[]
) {
  // Aggregate items from BOM groups, combining duplicate entries
  const aggregateItems = useCallback((groups: BomGroup[]): FloorplanItem[] => {
    const itemTotals = new Map<string, { quantity: number; unitPrice: number; total: number; categoryId: number; categorySortOrder: number; categoryName: string; isAddon: boolean; parentItemName: string | null }>();

    groups.forEach((group) => {
      // Look up category for the main entry
      const catalogItem = items.find(i => i.id === group.mainEntry.item_id);
      const category = catalogItem ? categories.find(c => c.id === catalogItem.category_id) : undefined;
      const categoryId = category?.id ?? 0;
      const categorySortOrder = category?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const categoryName = category?.name ?? 'Other';

      // Aggregate main entries
      const mainName = `${group.mainEntry.item_name}${group.mainEntry.style_name ? ` (${group.mainEntry.style_name})` : ''}`;
      const mainTotal = group.mainEntry.unit_price * group.quantity;
      const existingMain = itemTotals.get(mainName);

      if (existingMain) {
        existingMain.quantity += group.quantity;
        existingMain.total += mainTotal;
      } else {
        itemTotals.set(mainName, {
          quantity: group.quantity,
          unitPrice: group.mainEntry.unit_price,
          total: mainTotal,
          categoryId,
          categorySortOrder,
          categoryName,
          isAddon: false,
          parentItemName: null,
        });
      }

      // Aggregate addon entries
      group.children.forEach((child) => {
        const childName = `${child.item_name}${child.style_name ? ` (${child.style_name})` : ''}`;
        const addonKey = `${mainName} > ${childName}`;
        const childTotal = child.unit_price * group.quantity;
        const existingChild = itemTotals.get(addonKey);

        if (existingChild) {
          existingChild.quantity += group.quantity;
          existingChild.total += childTotal;
        } else {
          itemTotals.set(addonKey, {
            quantity: group.quantity,
            unitPrice: child.unit_price,
            total: childTotal,
            categoryId,
            categorySortOrder,
            categoryName,
            isAddon: true,
            parentItemName: mainName,
          });
        }
      });
    });

    return Array.from(itemTotals.entries()).map(([key, data]) => ({
      name: data.isAddon ? key.split(' > ').slice(1).join(' > ') : key,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      total: data.total,
      categoryId: data.categoryId,
      categorySortOrder: data.categorySortOrder,
      categoryName: data.categoryName,
      isAddon: data.isAddon,
      parentItemName: data.parentItemName,
    }));
  }, [items, categories]);

  // Calculate floorplan totals by iterating over floorplans array
  const floorplanTotals = useMemo((): FloorplanTotal[] => {
    return floorplans.map((floorplan) => {
      const bom = floorplanBoms.get(floorplan.id);

      if (!bom || bom.groups.length === 0) {
        return {
          floorplan,
          total: 0,
          items: [],
        };
      }

      return {
        floorplan,
        total: bom.totalPrice,
        items: aggregateItems(bom.groups),
      };
    });
  }, [floorplans, floorplanBoms, aggregateItems]);

  // Calculate project total - sum of floorplan totals
  const projectTotal = useMemo(() => {
    return floorplanTotals.reduce((sum, ft) => sum + ft.total, 0);
  }, [floorplanTotals]);

  return {
    aggregateItems,
    floorplanTotals,
    projectTotal,
  };
}
