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

const resizedArea = (id: number, x = 0, width = 600, height = 400, groups = 2): Area => ({
  ...area(id, x, groups), x, width, height,
  vertices: [
    { id: id * 10, placement_id: id, vertex_index: 0, x, y: 0 },
    { id: id * 10 + 1, placement_id: id, vertex_index: 1, x: x + width, y: 0 },
    { id: id * 10 + 2, placement_id: id, vertex_index: 2, x: x + width, y: height },
    { id: id * 10 + 3, placement_id: id, vertex_index: 3, x, y: height },
  ],
});

const ordinaryArea = (width: number, height: number, rows: number): Area => {
  const result = resizedArea(89, 100, width, height, 1);
  result.y = 100;
  result.name = 'Production Area';
  result.vertices = [
    { id: 890, placement_id: 89, vertex_index: 0, x: 100, y: 100 },
    { id: 891, placement_id: 89, vertex_index: 1, x: 100 + width, y: 100 },
    { id: 892, placement_id: 89, vertex_index: 2, x: 100 + width, y: 100 + height },
    { id: 893, placement_id: 89, vertex_index: 3, x: 100, y: 100 + height },
  ];
  result.zoning_groups = [{
    item_type: { id: 7, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 0 },
    parameters: Array.from({ length: rows }, (_, index) => ({
      id: index + 1,
      name: `Zone ${index + 1}`,
      sort_order: index,
      value: index + 1,
    })),
  }];
  return result;
};

describe('zoning annotation layout', () => {
  it('is deterministic, positive-only, group ordered, bounded and dual contrast', () => {
    const input = { areas: [resizedArea(2, 650), resizedArea(1)], productBounds: [], imageBounds: { x: 0, y: 0, width: 1400, height: 600 } };
    const first = layoutZoningAnnotations(input);
    expect(layoutZoningAnnotations(input)).toEqual(first);
    expect(first.map((descriptor) => descriptor.areaId)).toEqual([1, 2]);
    expect(first[0].accessibleText).not.toContain('Long parameter 0: 0');
    expect(first[0].lines[0].fullText).toContain('Lighting');
    expect(first[0].lines[1].fullText).toContain('HVAC');
    expect(first[0].omitted).toBeGreaterThan(0);
    expect(ZONING_ANNOTATION_STYLE.foreground).not.toBe(ZONING_ANNOTATION_STYLE.outline);
    expect(ZONING_ANNOTATION_STYLE).toMatchObject({
      foreground: '#f8fafc',
      outline: 'rgba(15, 23, 42, 0.88)',
      outlineWidth: 1.5,
    });
  });

  it('prefers a contained lower-interior annotation for ordinary stored geometry', () => {
    const persistedArea = resizedArea(11, 160, 700, 500, 1);
    persistedArea.y = 160;
    persistedArea.name = 'Existing Zigbee Area';
    persistedArea.vertices = [
      { id: 110, placement_id: 11, vertex_index: 0, x: 160, y: 160 },
      { id: 111, placement_id: 11, vertex_index: 1, x: 860, y: 160 },
      { id: 112, placement_id: 11, vertex_index: 2, x: 860, y: 660 },
      { id: 113, placement_id: 11, vertex_index: 3, x: 160, y: 660 },
    ];
    persistedArea.zoning_groups = [{
      item_type: { id: 1, name: 'Zigbee', abbreviation: 'ZIG', color: '#f00', sort_order: 0 },
      parameters: [
        { id: 1, name: 'test', sort_order: 0, value: 1 },
        { id: 2, name: 'test2', sort_order: 1, value: 2 },
      ],
    }];

    const [descriptor] = layoutZoningAnnotations({
      areas: [persistedArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });

    expect(descriptor).toBeDefined();
    expect(descriptor.anchor).toMatch(/^bottom-/);
    expect(descriptor.bounds.x).toBeGreaterThanOrEqual(160);
    expect(descriptor.bounds.y).toBeGreaterThanOrEqual(160);
    expect(descriptor.bounds.x + descriptor.bounds.width).toBeLessThanOrEqual(860);
    expect(descriptor.bounds.y + descriptor.bounds.height).toBeLessThanOrEqual(660);
    expect(descriptor.bounds.y).toBeGreaterThanOrEqual(160 + 500 * 0.6);
    expect(overlaps(descriptor.bounds, getAreaNameLabelGeometry(persistedArea, 0.25)!.bounds)).toBe(false);
  });

  it.each([1, 2, 8])('contracts a production-default 200x150 Area for %i positive row(s)', (rows) => {
    const productionArea = ordinaryArea(200, 150, rows);
    const [descriptor] = layoutZoningAnnotations({
      areas: [productionArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1200, height: 800 },
    });

    expect(descriptor).toBeDefined();
    expect(descriptor.anchor).toMatch(/^bottom-/);
    expect(descriptor.bounds.x).toBeGreaterThanOrEqual(100);
    expect(descriptor.bounds.y).toBeGreaterThanOrEqual(100 + 150 * 0.6);
    expect(descriptor.bounds.x + descriptor.bounds.width).toBeLessThanOrEqual(300);
    expect(descriptor.bounds.y + descriptor.bounds.height).toBeLessThanOrEqual(250);
    expect(descriptor.lines).toHaveLength(rows === 8 ? 1 : rows);
    expect(descriptor.omitted).toBe(rows === 8 ? 7 : 0);
    expect(descriptor.minimumReadableScale).toBe(rows === 1 ? 0.5 : 0.75);
    for (const displayScale of [0.18, 0.25, 0.5, 0.859375, 1, 1.5]) {
      const presentation = getAnnotationPresentation(descriptor, displayScale);
      if (displayScale < descriptor.minimumReadableScale) {
        expect(presentation).toBeNull();
        continue;
      }
      expect(presentation).not.toBeNull();
      if (!presentation) continue;
      expect(presentation.fontSize * displayScale).toBeCloseTo(ZONING_ANNOTATION_STYLE.fontSize);
      expect(presentation.lineHeight * displayScale).toBeCloseTo(ZONING_ANNOTATION_STYLE.lineHeight);
      expect(presentation.outlineWidth * displayScale).toBeCloseTo(ZONING_ANNOTATION_STYLE.outlineWidth);
      expect(presentation.bounds.x).toBeGreaterThanOrEqual(descriptor.bounds.x);
      expect(presentation.bounds.y).toBeGreaterThanOrEqual(descriptor.bounds.y);
      expect(presentation.bounds.x + presentation.bounds.width).toBeLessThanOrEqual(
        descriptor.bounds.x + descriptor.bounds.width,
      );
      expect(presentation.bounds.y + presentation.bounds.height).toBeLessThanOrEqual(
        descriptor.bounds.y + descriptor.bounds.height,
      );
      expect(overlaps(presentation.bounds, getAreaNameLabelGeometry(productionArea, displayScale)!.bounds)).toBe(false);
    }
  });

  it('uses deterministic size boundaries instead of one literal small-Area exception', () => {
    const layout = (width: number, height: number, rows: number) => layoutZoningAnnotations({
      areas: [ordinaryArea(width, height, rows)],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1200, height: 800 },
    });

    expect(layout(120, 90, 1)).toEqual([]);
    expect(layout(120, 90, 2)).toEqual([]);
    expect(layout(150, 110, 1)).toEqual([]);
    expect(layout(150, 115, 1)).toHaveLength(1);
    expect(getAnnotationPresentation(layout(150, 115, 1)[0], 0.859375)).toBeNull();
    expect(getAnnotationPresentation(layout(150, 115, 1)[0], 1)).not.toBeNull();
    expect(layout(170, 125, 2)).toEqual([]);
    expect(layout(180, 130, 2)).toHaveLength(1);
    expect(getAnnotationPresentation(layout(180, 130, 2)[0], 0.859375)).toBeNull();
    expect(getAnnotationPresentation(layout(180, 130, 2)[0], 1)).not.toBeNull();
    expect(layout(180, 130, 2)).toEqual(layout(180, 130, 2));
  });

  it('finds a contained lower-interior candidate in an ordinary concave Area', () => {
    const concaveArea = ordinaryArea(260, 180, 2);
    concaveArea.vertices = [
      { id: 890, placement_id: 89, vertex_index: 0, x: 100, y: 100 },
      { id: 891, placement_id: 89, vertex_index: 1, x: 360, y: 100 },
      { id: 892, placement_id: 89, vertex_index: 2, x: 360, y: 280 },
      { id: 893, placement_id: 89, vertex_index: 3, x: 320, y: 280 },
      { id: 894, placement_id: 89, vertex_index: 4, x: 320, y: 250 },
      { id: 895, placement_id: 89, vertex_index: 5, x: 290, y: 250 },
      { id: 896, placement_id: 89, vertex_index: 6, x: 290, y: 280 },
      { id: 897, placement_id: 89, vertex_index: 7, x: 100, y: 280 },
    ];
    const [descriptor] = layoutZoningAnnotations({
      areas: [concaveArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1200, height: 800 },
    });

    expect(descriptor).toBeDefined();
    expect(descriptor.anchor).toMatch(/^(bottom|lower)-/);
    expect(descriptor.bounds.y + descriptor.bounds.height).toBeLessThanOrEqual(250);
  });

  it('keeps the Product Type, parameter identity, and exact value in painted text', () => {
    const persistedArea = resizedArea(1, 0, 500, 300, 2);
    persistedArea.zoning_groups = persistedArea.zoning_groups.map((group, index) => ({
      ...group,
      item_type: {
        ...group.item_type,
        name: `Issue89 Type ${index} 1780000000000`,
        abbreviation: `I${index}X`,
      },
      parameters: [{ id: index + 1, name: `Zones ${index}`, sort_order: 0, value: index === 0 ? 4 : 2 }],
    }));

    const [descriptor] = layoutZoningAnnotations({
      areas: [persistedArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });

    expect(descriptor.lines.map((line) => line.displayText)).toEqual([
      expect.stringMatching(/I0X.*Zones 0.*4/),
      expect.stringMatching(/I1X.*Zones 1.*2/),
    ]);
  });

  it('safely omits a constrained stored Area instead of placing its annotation outside', () => {
    const persistedArea = resizedArea(11, 340, 120, 90, 1);
    persistedArea.y = 220;
    persistedArea.name = 'Existing Zigbee Area';
    persistedArea.vertices = [
      { id: 110, placement_id: 11, vertex_index: 0, x: 340, y: 220 },
      { id: 111, placement_id: 11, vertex_index: 1, x: 460, y: 220 },
      { id: 112, placement_id: 11, vertex_index: 2, x: 460, y: 310 },
      { id: 113, placement_id: 11, vertex_index: 3, x: 340, y: 310 },
    ];
    persistedArea.zoning_groups = [{
      item_type: { id: 1, name: 'Zigbee', abbreviation: 'ZIG', color: '#f00', sort_order: 0 },
      parameters: [
        { id: 1, name: 'test', sort_order: 0, value: 1 },
        { id: 2, name: 'test2', sort_order: 1, value: 2 },
      ],
    }];

    const descriptors = layoutZoningAnnotations({
      areas: [persistedArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });

    expect(descriptors).toEqual([]);
  });

  it('rejects lower candidates that escape a concave Area before trying a safe interior anchor', () => {
    const concaveArea = resizedArea(12, 0, 1000, 600, 1);
    concaveArea.vertices = [
      { id: 120, placement_id: 12, vertex_index: 0, x: 0, y: 0 },
      { id: 121, placement_id: 12, vertex_index: 1, x: 1000, y: 0 },
      { id: 122, placement_id: 12, vertex_index: 2, x: 1000, y: 600 },
      { id: 123, placement_id: 12, vertex_index: 3, x: 650, y: 600 },
      { id: 124, placement_id: 12, vertex_index: 4, x: 650, y: 400 },
      { id: 125, placement_id: 12, vertex_index: 5, x: 350, y: 400 },
      { id: 126, placement_id: 12, vertex_index: 6, x: 350, y: 600 },
      { id: 127, placement_id: 12, vertex_index: 7, x: 0, y: 600 },
    ];

    const [descriptor] = layoutZoningAnnotations({
      areas: [concaveArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1000, height: 700 },
    });

    expect(descriptor).toBeDefined();
    expect(descriptor.anchor).not.toMatch(/^bottom-/);
    expect(descriptor.bounds.y + descriptor.bounds.height).toBeLessThanOrEqual(400);
  });

  it.each([
    { label: 'identical abbreviations', abbreviations: ['X', 'X'], names: ['Shared Alpha', 'Shared Beta'] },
    { label: 'distinct alphabetic abbreviations colliding after truncation', abbreviations: ['ABCDEFGHIJ', 'ABCDEFGHIK'], names: [`${'W'.repeat(84)}A`, `${'W'.repeat(84)}B`] },
    { label: 'distinct numeric suffixes colliding after truncation', abbreviations: ['ABCDEFGH1', 'ABCDEFGH2'], names: ['Common prefix Alpha', 'Common prefix Beta'] },
    { label: 'long common prefixes in a narrow budget', abbreviations: ['PREFIXAAA1', 'PREFIXAAA2'], names: ['Long common Product Type Alpha', 'Long common Product Type Beta'] },
    { label: 'Unicode and fallback glyph names', abbreviations: ['照明設備甲', '照明設備乙'], names: ['照明😀共有名甲', '照明😀共有名乙'] },
  ])('keeps final directly painted group identifiers injective for $label', ({ abbreviations, names }) => {
    for (const width of [420, 500]) {
      const persistedArea = resizedArea(1, 0, width, 300, 2);
      persistedArea.zoning_groups = persistedArea.zoning_groups.map((group, index) => ({
        ...group,
        item_type: {
          ...group.item_type,
          id: 80 + index,
          name: names[index],
          abbreviation: abbreviations[index],
        },
        parameters: [{ id: index + 1, name: 'Zones', sort_order: 0, value: 4 }],
      }));
      const input = {
        areas: [persistedArea],
        productBounds: [],
        imageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
      };

      const [descriptor] = layoutZoningAnnotations(input);
      const painted = descriptor.lines.map((line) => line.displayText);
      expect(layoutZoningAnnotations(input)).toEqual([descriptor]);
      expect(painted).toHaveLength(2);
      expect(new Set(painted).size).toBe(2);
      expect(painted).toEqual([
        expect.stringMatching(/^#28(?: .+)?·?Z.*:\s*4$/u),
        expect.stringMatching(/^#29(?: .+)?·?Z.*:\s*4$/u),
      ]);
      expect(descriptor.accessibleText).toContain(`${names[0]} — Zones: 4`);
      expect(descriptor.accessibleText).toContain(`${names[1]} — Zones: 4`);
    }
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
    const largeArea = resizedArea(1);
    const product = { x: 150, y: 105, width: 60, height: 80 };
    const descriptor = layoutZoningAnnotations({ areas: [largeArea], productBounds: [product], imageBounds: { x: 0, y: 0, width: 700, height: 500 } })[0];
    const presentations = [0.5, 1, 1.5].map((scale) => getAnnotationPresentation(descriptor, scale)!);
    expect(descriptor.anchor).not.toBe('below-name');
    expect(descriptor.omitted).toBeGreaterThan(0);
    expect(presentations.every((presentation) => !overlaps(presentation.bounds, product))).toBe(true);
    expect(presentations.map(() => descriptor.anchor)).toEqual([descriptor.anchor, descriptor.anchor, descriptor.anchor]);
    expect(presentations.map(() => descriptor.omitted)).toEqual([descriptor.omitted, descriptor.omitted, descriptor.omitted]);
    expect(presentations[0].bounds.width * 0.5).toBeCloseTo(presentations[1].bounds.width);
    expect(presentations[2].bounds.width * 1.5).toBeCloseTo(presentations[1].bounds.width);
  });

  it('keeps accepted annotations outside rendered Area-name geometry when zoomed out or in', () => {
    const livingRoom = { ...resizedArea(1), name: 'Living Room' };
    const descriptor = layoutZoningAnnotations({ areas: [livingRoom], productBounds: [], imageBounds: { x: 0, y: 0, width: 700, height: 500 } })[0];
    for (const scale of [0.18, 0.25, 0.5, 1, 1.5]) {
      const presentation = getAnnotationPresentation(descriptor, scale);
      if (!presentation) {
        expect(scale).toBeLessThan(descriptor.minimumReadableScale);
        continue;
      }
      const annotation = presentation.bounds;
      const name = getAreaNameLabelGeometry(livingRoom, scale)!.bounds;
      expect(overlaps(annotation, name)).toBe(false);
    }
  });

  it('defines one bounded Area-name paint descriptor across glyph and scale boundaries', () => {
    const names = ['Living Room', 'W'.repeat(20), '照明😀'.repeat(12)];
    for (const name of names) {
      const namedArea = { ...resizedArea(1, 0, 2000, 600, 1), name };
      for (const scale of [0.18, 0.25, 0.5, 1, 1.5, 3]) {
        const descriptor = getAreaNameLabelGeometry(namedArea, scale) as ReturnType<typeof getAreaNameLabelGeometry> & {
          fullText?: string;
          displayText?: string;
          clipBounds?: AnnotationRect;
          fontFamily?: string;
          fontWeight?: number;
        };
        expect(descriptor).not.toBeNull();
        expect(descriptor!.fullText).toBe(name);
        expect(descriptor!.displayText).toBeTruthy();
        expect(descriptor!.clipBounds).toEqual(descriptor!.bounds);
        expect(descriptor!.fontFamily).toBe(ZONING_ANNOTATION_STYLE.fontFamily);
        expect(descriptor!.fontWeight).toBe(ZONING_ANNOTATION_STYLE.fontWeight);
      }
    }

    const wideArea = { ...resizedArea(1, 0, 2000, 600, 1), name: 'W'.repeat(20) };
    const product = { x: 680, y: 120, width: 640, height: 360 };
    const [annotation] = layoutZoningAnnotations({
      areas: [wideArea],
      productBounds: [product],
      imageBounds: { x: 0, y: 0, width: 2200, height: 800 },
    });
    expect(annotation).toBeDefined();
    const nameDescriptor = getAreaNameLabelGeometry(wideArea, 0.25)!;
    expect(overlaps(getAnnotationPresentation(annotation, 0.25)!.bounds, nameDescriptor.bounds)).toBe(false);
  });

  it('encloses the exact 25% product fixture and omits fitted-below-minimum presentation', () => {
    const exactArea = resizedArea(1, 0, 600, 400, 1);
    exactArea.zoning_groups[0].parameters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Parameter ${index + 1}`, sort_order: index, value: index + 1 }));
    const product = { x: 200, y: 320, width: 200, height: 40 };
    const descriptor = layoutZoningAnnotations({ areas: [exactArea], productBounds: [product], imageBounds: { x: 0, y: 0, width: 700, height: 500 } })[0];
    expect(descriptor).toBeDefined();
    const quarter = getAnnotationPresentation(descriptor, 0.25);
    const fitted = getAnnotationPresentation(descriptor, 0.18);
    expect(overlaps(quarter.bounds, product)).toBe(false);
    expect(fitted).toBeNull();
    expect(quarter).not.toBeNull();
    if (!quarter) return;
    expect(quarter.effectiveScale).toBe(0.25);
    expect(quarter.firstBaselineY + (descriptor.lines.length + (descriptor.omitted > 0 ? 1 : 0) - 1) * quarter.lineHeight + (2 + ZONING_ANNOTATION_STYLE.outlineWidth) / quarter.effectiveScale)
      .toBeLessThanOrEqual(quarter.bounds.y + quarter.bounds.height);
  });

  it('contains max-length wide glyphs inside the canonical horizontal paint envelope', () => {
    const wideArea = resizedArea(1, 0, 600, 400, 1);
    wideArea.zoning_groups[0].item_type.name = 'W'.repeat(100);
    wideArea.zoning_groups[0].item_type.abbreviation = 'WWW';
    wideArea.zoning_groups[0].parameters = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1, name: `${'W'.repeat(100)} ${index + 1}`, sort_order: index, value: index === 0 ? 9999 : index + 1,
    }));
    const product = { x: 625, y: 120, width: 65, height: 40 };
    const descriptor = layoutZoningAnnotations({
      areas: [wideArea], productBounds: [product], imageBounds: { x: 0, y: 0, width: 700, height: 500 },
    })[0];
    const quarter = getAnnotationPresentation(descriptor, 0.25);
    const fitted = getAnnotationPresentation(descriptor, 0.18);
    expect(fitted).toBeNull();
    expect(quarter).not.toBeNull();
    if (!quarter) return;
    expect(descriptor.lines[0].fullText).toContain('W'.repeat(100));
    expect(descriptor.lines[0].displayText).toMatch(/^#1 W+…·W+…:9999$/);
    expect(quarter.clipBounds).toEqual(quarter.bounds);
    expect(quarter.clipBounds.x + quarter.clipBounds.width).toBeLessThan(product.x);
    expect(quarter.clipBounds.x + quarter.clipBounds.width).toBeLessThanOrEqual(700);
  });

  it('keeps every readable no-product line envelope inside the image and prior annotations', () => {
    const firstArea = resizedArea(1, 0, 600, 400, 1);
    firstArea.zoning_groups[0].parameters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Parameter ${index + 1}`, sort_order: index, value: index + 1 }));
    const secondArea = resizedArea(2, 300, 600, 400, 1);
    const descriptors = layoutZoningAnnotations({ areas: [firstArea, secondArea], productBounds: [], imageBounds: { x: 0, y: 0, width: 1000, height: 500 } });
    expect(descriptors.length).toBeGreaterThan(0);
    for (const descriptor of descriptors) {
      const quarter = getAnnotationPresentation(descriptor, 0.25);
      if (!quarter) expect(descriptor.minimumReadableScale).toBeGreaterThan(0.25);
      const presentation = getAnnotationPresentation(descriptor, descriptor.minimumReadableScale);
      expect(presentation).not.toBeNull();
      if (!presentation) continue;
      expect(presentation.bounds.x).toBeGreaterThanOrEqual(0);
      expect(presentation.bounds.y).toBeGreaterThanOrEqual(0);
      expect(presentation.bounds.x + presentation.bounds.width).toBeLessThanOrEqual(1000);
      expect(presentation.bounds.y + presentation.bounds.height).toBeLessThanOrEqual(500);
    }
    for (let index = 1; index < descriptors.length; index++) {
      expect(overlaps(descriptors[index - 1].bounds, descriptors[index].bounds)).toBe(false);
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
