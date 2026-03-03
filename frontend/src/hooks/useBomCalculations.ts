import { useMemo, useCallback } from 'react';
import type { Floorplan } from '@/services/floorplan';
import type { FloorplanBom, BomGroup } from '@/services/bom';

export interface AggregatedItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface FloorplanTotal {
  floorplan: Floorplan;
  total: number;
  items: AggregatedItem[];
}

/**
 * Hook to calculate BOM totals and aggregate items
 */
export function useBomCalculations(
  floorplans: Floorplan[],
  floorplanBoms: Map<number, FloorplanBom>
) {
  // Aggregate items from BOM groups, combining duplicate entries
  const aggregateItems = useCallback((groups: BomGroup[]): AggregatedItem[] => {
    const itemTotals = new Map<string, { quantity: number; unitPrice: number; total: number }>();

    groups.forEach((group) => {
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
        });
      }

      // Aggregate addon entries
      group.children.forEach((child) => {
        const childName = `${child.item_name}${child.style_name ? ` (${child.style_name})` : ''}`;
        const childTotal = child.unit_price * group.quantity;
        const existingChild = itemTotals.get(childName);

        if (existingChild) {
          existingChild.quantity += group.quantity;
          existingChild.total += childTotal;
        } else {
          itemTotals.set(childName, {
            quantity: group.quantity,
            unitPrice: child.unit_price,
            total: childTotal,
          });
        }
      });
    });

    return Array.from(itemTotals.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));
  }, []);

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
