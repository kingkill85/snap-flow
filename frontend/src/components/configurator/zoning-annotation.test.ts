import { describe, expect, it } from 'vitest';
import type { Area } from '@/services/area';
import {
  getAnnotationPresentation,
  getAreaNameLabelGeometry,
  getPlacementCollisionBounds,
  layoutZoningAnnotations,
  ZONING_ANNOTATION_STYLE,
  type AnnotationRect,
} from './zoning-annotation';

const overlaps = (left: AnnotationRect, right: AnnotationRect) =>
  left.x < right.x + right.width && left.x + left.width > right.x &&
  left.y < right.y + right.height && left.y + left.height > right.y;

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
    const roomyArea = { ...area(1), width: 500, height: 300, vertices: [
      { id: 10, placement_id: 1, vertex_index: 0, x: 0, y: 0 }, { id: 11, placement_id: 1, vertex_index: 1, x: 500, y: 0 },
      { id: 12, placement_id: 1, vertex_index: 2, x: 500, y: 300 }, { id: 13, placement_id: 1, vertex_index: 3, x: 0, y: 300 },
    ] };
    const [descriptor] = layoutZoningAnnotations({ areas: [roomyArea], productBounds: [product], imageBounds: { x: 0, y: 0, width: 600, height: 400 } });
    expect(descriptor).toBeDefined();
    expect(descriptor.bounds.x + descriptor.bounds.width <= product.x || descriptor.bounds.x >= product.x + product.width || descriptor.bounds.y + descriptor.bounds.height <= product.y || descriptor.bounds.y >= product.y + product.height).toBe(true);
  });

  it('keeps canonical anchor, omission and collision independent of presentation scale', () => {
    const largeArea = { ...area(1), width: 600, height: 400, vertices: [
      { id: 10, placement_id: 1, vertex_index: 0, x: 0, y: 0 },
      { id: 11, placement_id: 1, vertex_index: 1, x: 600, y: 0 },
      { id: 12, placement_id: 1, vertex_index: 2, x: 600, y: 400 },
      { id: 13, placement_id: 1, vertex_index: 3, x: 0, y: 400 },
    ] };
    const product = { x: 150, y: 105, width: 60, height: 80 };
    const descriptor = layoutZoningAnnotations({ areas: [largeArea], productBounds: [product], imageBounds: { x: 0, y: 0, width: 700, height: 500 } })[0];
    const presentations = [0.5, 1, 1.5].map((scale) => getAnnotationPresentation(descriptor, scale));
    expect(descriptor.anchor).not.toBe('below-name');
    expect(descriptor.omitted).toBeGreaterThan(0);
    expect(presentations.every((presentation) => !overlaps(presentation.bounds, product))).toBe(true);
    expect(presentations.map(() => descriptor.anchor)).toEqual([descriptor.anchor, descriptor.anchor, descriptor.anchor]);
    expect(presentations.map(() => descriptor.omitted)).toEqual([descriptor.omitted, descriptor.omitted, descriptor.omitted]);
    expect(presentations[0].bounds.width * 0.5).toBeCloseTo(presentations[1].bounds.width);
    expect(presentations[2].bounds.width * 1.5).toBeCloseTo(presentations[1].bounds.width);
  });

  it('keeps accepted annotations outside rendered Area-name geometry when zoomed out or in', () => {
    const livingRoom = { ...area(1), name: 'Living Room' };
    const descriptor = layoutZoningAnnotations({ areas: [livingRoom], productBounds: [], imageBounds: { x: 0, y: 0, width: 300, height: 200 } })[0];
    for (const scale of [0.5, 1, 1.5]) {
      const annotation = getAnnotationPresentation(descriptor, scale).bounds;
      const name = getAreaNameLabelGeometry(livingRoom, scale)!.bounds;
      expect(overlaps(annotation, name)).toBe(false);
    }
  });

  it('uses a conservative center-rotated AABB for non-square product placements', () => {
    const placement = { x: 80, y: 35, width: 120, height: 20, rotation: 45 };
    const rotated = getPlacementCollisionBounds(placement);
    const unrotated = getPlacementCollisionBounds({ ...placement, rotation: 0 });
    expect(rotated.height).toBeGreaterThan(unrotated.height);
    expect(rotated.width).toBeLessThan(unrotated.width);
    const rotatedArea = { ...area(1), width: 500, height: 300, vertices: [
      { id: 10, placement_id: 1, vertex_index: 0, x: 0, y: 0 }, { id: 11, placement_id: 1, vertex_index: 1, x: 500, y: 0 },
      { id: 12, placement_id: 1, vertex_index: 2, x: 500, y: 300 }, { id: 13, placement_id: 1, vertex_index: 3, x: 0, y: 300 },
    ] };
    const descriptor = layoutZoningAnnotations({ areas: [rotatedArea], productBounds: [rotated], imageBounds: { x: 0, y: 0, width: 600, height: 400 } })[0];
    expect(descriptor).toBeDefined();
    expect(overlaps(descriptor.bounds, rotated)).toBe(false);
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
