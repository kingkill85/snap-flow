import { describe, expect, it } from 'vitest';
import type { Area } from '@/services/area';
import { layoutZoningAnnotations, ZONING_ANNOTATION_STYLE } from './zoning-annotation';

const area = (id: number, x = 0, groups = 2): Area => ({
  id, floorplan_id: 1, x, y: 0, width: 220, height: 150, name: `Area ${id}`,
  color: '#fff', opacity: 0.2, revision: 1, device_count: 0, created_at: '', updated_at: '',
  vertices: [
    { id: id * 10, placement_id: id, vertex_index: 0, x, y: 0 },
    { id: id * 10 + 1, placement_id: id, vertex_index: 1, x: x + 220, y: 0 },
    { id: id * 10 + 2, placement_id: id, vertex_index: 2, x: x + 220, y: 150 },
    { id: id * 10 + 3, placement_id: id, vertex_index: 3, x, y: 150 },
  ],
  zoning_groups: Array.from({ length: groups }, (_, group) => ({
    item_type: { id: group + 1, name: group ? 'HVAC' : 'Lighting', abbreviation: 'T', color: '#f00', sort_order: group },
    parameters: Array.from({ length: 5 }, (_, index) => ({ id: group * 10 + index, name: `Long parameter ${index}`, sort_order: index, value: index === 0 && group === 0 ? 0 : index + 1 })),
  })),
});

describe('zoning annotation layout', () => {
  it('is deterministic, positive-only, group ordered, bounded and dual contrast', () => {
    const input = { areas: [area(2, 240), area(1)], productBounds: [], imageBounds: { x: 0, y: 0, width: 500, height: 300 } };
    const first = layoutZoningAnnotations(input);
    expect(layoutZoningAnnotations(input)).toEqual(first);
    expect(first.map((descriptor) => descriptor.areaId)).toEqual([1, 2]);
    expect(first[0].accessibleText).not.toContain('Long parameter 0: 0');
    expect(first[0].lines[0].fullText).toContain('Lighting');
    expect(first[0].lines[1].fullText).toContain('HVAC');
    expect(first[0].omitted).toBeGreaterThan(0);
    expect(ZONING_ANNOTATION_STYLE.foreground).not.toBe(ZONING_ANNOTATION_STYLE.outline);
  });

  it('chooses another bounded candidate near products and never overlaps them', () => {
    const product = { x: 70, y: 35, width: 90, height: 65 };
    const [descriptor] = layoutZoningAnnotations({ areas: [area(1)], productBounds: [product], imageBounds: { x: 0, y: 0, width: 300, height: 200 } });
    expect(descriptor).toBeDefined();
    expect(descriptor.bounds.x + descriptor.bounds.width <= product.x || descriptor.bounds.x >= product.x + product.width || descriptor.bounds.y + descriptor.bounds.height <= product.y || descriptor.bounds.y >= product.y + product.height).toBe(true);
  });

  it('keeps modeled CSS dimensions stable across supported display scales', () => {
    const largeArea = { ...area(1), width: 600, height: 400, vertices: [
      { id: 10, placement_id: 1, vertex_index: 0, x: 0, y: 0 },
      { id: 11, placement_id: 1, vertex_index: 1, x: 600, y: 0 },
      { id: 12, placement_id: 1, vertex_index: 2, x: 600, y: 400 },
      { id: 13, placement_id: 1, vertex_index: 3, x: 0, y: 400 },
    ] };
    const input = { areas: [largeArea], productBounds: [], imageBounds: { x: 0, y: 0, width: 700, height: 500 } };
    const half = layoutZoningAnnotations({ ...input, displayScale: 0.5 })[0];
    const normal = layoutZoningAnnotations({ ...input, displayScale: 1 })[0];
    const oneAndHalf = layoutZoningAnnotations({ ...input, displayScale: 1.5 })[0];
    expect(half.bounds.width * 0.5).toBeCloseTo(normal.bounds.width);
    expect(oneAndHalf.bounds.width * 1.5).toBeCloseTo(normal.bounds.width);
    expect(half.bounds.height * 0.5).toBeCloseTo(normal.bounds.height);
    expect(oneAndHalf.bounds.height * 1.5).toBeCloseTo(normal.bounds.height);
  });

  it('omits empty annotations and safely omits when every candidate is blocked', () => {
    const empty = { ...area(1), zoning_groups: [] };
    expect(layoutZoningAnnotations({ areas: [empty], productBounds: [], imageBounds: { x: 0, y: 0, width: 300, height: 200 } })).toEqual([]);
    expect(layoutZoningAnnotations({ areas: [area(1)], productBounds: [{ x: 0, y: 0, width: 300, height: 200 }], imageBounds: { x: 0, y: 0, width: 300, height: 200 } })).toEqual([]);
  });

  it('handles many Areas and placements with bounded repeated output', () => {
    const areas = Array.from({ length: 80 }, (_, index) => area(index + 1, index * 230, 1));
    const products = Array.from({ length: 200 }, (_, index) => ({ x: index * 25, y: 120, width: 12, height: 12 }));
    const input = { areas, productBounds: products, imageBounds: { x: 0, y: 0, width: 19000, height: 300 } };
    expect(layoutZoningAnnotations(input)).toEqual(layoutZoningAnnotations(input));
  });
});
