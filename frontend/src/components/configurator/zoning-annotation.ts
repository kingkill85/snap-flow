import type { Area } from '@/services/area';

export interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationLine {
  fullText: string;
  displayText: string;
}

export interface ZoningAnnotationDescriptor {
  areaId: number;
  lines: readonly AnnotationLine[];
  omitted: number;
  bounds: Readonly<AnnotationRect>;
  anchor: string;
  accessibleText: string;
  presentationScale: number;
}

export const ZONING_ANNOTATION_STYLE = Object.freeze({
  fontFamily: 'Arial, sans-serif',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 14,
  maxWidth: 150,
  maxRows: 6,
  padding: 4,
  collisionPadding: 3,
  foreground: '#ffffff',
  outline: '#111827',
  outlineWidth: 3,
  characterWidthRatio: 0.58,
});

interface LayoutInput {
  areas: readonly Area[];
  productBounds: readonly AnnotationRect[];
  imageBounds: AnnotationRect;
  displayScale?: number;
}

const intersects = (a: AnnotationRect, b: AnnotationRect, padding = 0) =>
  a.x < b.x + b.width + padding &&
  a.x + a.width + padding > b.x &&
  a.y < b.y + b.height + padding &&
  a.y + a.height + padding > b.y;

const areaBounds = (area: Area): AnnotationRect | null => {
  if (area.vertices.length < 3) return null;
  const xs = area.vertices.map((vertex) => vertex.x);
  const ys = area.vertices.map((vertex) => vertex.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export function getAreaNameLabelBounds(area: Area): AnnotationRect | null {
  const bounds = areaBounds(area);
  if (!bounds) return null;
  const label = area.name || 'Area';
  const fontSize = 12;
  const width = label.length * fontSize * 0.6 + 12;
  const height = fontSize + 6;
  const vertices = [...area.vertices].sort((a, b) => a.vertex_index - b.vertex_index);
  const centroid = vertices.reduce(
    (sum, vertex) => ({ x: sum.x + vertex.x / vertices.length, y: sum.y + vertex.y / vertices.length }),
    { x: 0, y: 0 },
  );
  let best = { length: -1, x: centroid.x, y: centroid.y, inwardX: 0, inwardY: 0 };
  vertices.forEach((a, index) => {
    const b = vertices[(index + 1) % vertices.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= best.length) return;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const normalLength = Math.hypot(nx, ny) || 1;
    const direction = (nx / normalLength) * (centroid.x - x) +
        (ny / normalLength) * (centroid.y - y) >= 0
      ? 1
      : -1;
    best = {
      length,
      x,
      y,
      inwardX: direction * nx / normalLength,
      inwardY: direction * ny / normalLength,
    };
  });
  const inset = height / 2 + 4;
  const centerX = best.x + best.inwardX * inset;
  const centerY = best.y + best.inwardY * inset;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

const positiveRows = (area: Area) => {
  const groups = area.zoning_groups
    .map((group) => ({
      ...group,
      parameters: group.parameters.filter((parameter) => parameter.value > 0),
    }))
    .filter((group) => group.parameters.length > 0);
  const queues = groups.map((group) => group.parameters.map((parameter) =>
    `${group.item_type.name} — ${parameter.name}: ${parameter.value}`
  ));
  const rows: string[] = [];
  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const row = queue.shift();
      if (row) rows.push(row);
    }
  }
  return rows;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

function displayedLines(rows: readonly string[], visibleCount: number, width: number) {
  const maxCharacters = Math.max(
    8,
    Math.floor((width - ZONING_ANNOTATION_STYLE.padding * 2) /
      (ZONING_ANNOTATION_STYLE.fontSize * ZONING_ANNOTATION_STYLE.characterWidthRatio)),
  );
  return rows.slice(0, visibleCount).map((fullText) => ({
    fullText,
    displayText: fullText.length > maxCharacters
      ? `${fullText.slice(0, maxCharacters - 1)}…`
      : fullText,
  }));
}

export function layoutZoningAnnotations({
  areas,
  productBounds,
  imageBounds,
  displayScale = 1,
}: LayoutInput): readonly ZoningAnnotationDescriptor[] {
  const presentationScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const scaled = (value: number) => value / presentationScale;
  const orderedAreas = [...areas].sort((a, b) => a.id - b.id);
  const nameBounds = orderedAreas.map(getAreaNameLabelBounds).filter(
    (bounds): bounds is AnnotationRect => bounds !== null,
  );
  const placed: AnnotationRect[] = [];
  const descriptors: ZoningAnnotationDescriptor[] = [];

  for (const area of orderedAreas) {
    const rows = positiveRows(area);
    const bounds = areaBounds(area);
    if (!rows.length || !bounds) continue;
    const width = Math.min(
      scaled(ZONING_ANNOTATION_STYLE.maxWidth),
      Math.max(scaled(56), bounds.width - scaled(ZONING_ANNOTATION_STYLE.padding * 2)),
    );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    let descriptor: ZoningAnnotationDescriptor | null = null;
    for (
      let visibleCount = Math.min(rows.length, ZONING_ANNOTATION_STYLE.maxRows);
      visibleCount >= 1 && !descriptor;
      visibleCount--
    ) {
      const omitted = rows.length - visibleCount;
      const renderedRows = visibleCount + (omitted > 0 ? 1 : 0);
      const height = renderedRows * scaled(ZONING_ANNOTATION_STYLE.lineHeight);
      const gap = scaled(8);
      const candidates = [
        { name: 'below-name', x: centerX - width / 2, y: bounds.y + bounds.height * 0.28 },
        { name: 'center', x: centerX - width / 2, y: centerY - height / 2 },
        { name: 'top-left', x: bounds.x + gap, y: bounds.y + gap },
        { name: 'top-right', x: bounds.x + bounds.width - width - gap, y: bounds.y + gap },
        { name: 'bottom-left', x: bounds.x + gap, y: bounds.y + bounds.height - height - gap },
        { name: 'bottom-right', x: bounds.x + bounds.width - width - gap, y: bounds.y + bounds.height - height - gap },
      ];
      for (const candidate of candidates) {
        const candidateBounds = {
          x: clamp(candidate.x, imageBounds.x, imageBounds.x + imageBounds.width - width),
          y: clamp(candidate.y, imageBounds.y, imageBounds.y + imageBounds.height - height),
          width,
          height,
        };
        const collisionPadding = scaled(ZONING_ANNOTATION_STYLE.collisionPadding);
        if (productBounds.some((product) => intersects(candidateBounds, product, collisionPadding))) continue;
        if (nameBounds.some((name) => intersects(candidateBounds, name, collisionPadding))) continue;
        if (placed.some((annotation) => intersects(candidateBounds, annotation, collisionPadding))) continue;
        const lines = displayedLines(rows, visibleCount, width * presentationScale);
        descriptor = Object.freeze({
          areaId: area.id,
          lines: Object.freeze(lines),
          omitted,
          bounds: Object.freeze(candidateBounds),
          anchor: candidate.name,
          accessibleText: [...rows.slice(0, visibleCount), ...(omitted ? [`+${omitted} more`] : [])].join('; '),
          presentationScale,
        });
        break;
      }
    }
    if (descriptor) {
      descriptors.push(descriptor);
      placed.push(descriptor.bounds);
    }
  }
  return Object.freeze(descriptors);
}
