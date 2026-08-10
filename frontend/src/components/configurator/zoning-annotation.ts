import type { Area } from '@/services/area';
import type { Placement } from '@/services/placement';

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
}

export interface AnnotationPresentation {
  bounds: Readonly<AnnotationRect>;
  fontSize: number;
  lineHeight: number;
  outlineWidth: number;
}

export interface AreaNameLabelGeometry {
  bounds: Readonly<AnnotationRect>;
  center: Readonly<{ x: number; y: number }>;
  fontSize: number;
  radius: number;
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
  canonicalMinScale: 0.5,
});

interface LayoutInput {
  areas: readonly Area[];
  productBounds: readonly AnnotationRect[];
  imageBounds: AnnotationRect;
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

function labelAnchor(area: Area) {
  const bounds = areaBounds(area);
  if (!bounds) return null;
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
  return best;
}

export function getAreaNameLabelGeometry(area: Area, displayScale = 1): AreaNameLabelGeometry | null {
  const anchor = labelAnchor(area);
  if (!anchor) return null;
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const label = area.name || 'Area';
  const fontSize = 12 / scale;
  const padX = 6 / scale;
  const padY = 3 / scale;
  const width = label.length * fontSize * 0.6 + padX * 2;
  const height = fontSize + padY * 2;
  const inset = height / 2 + 4 / scale;
  const center = {
    x: anchor.x + anchor.inwardX * inset,
    y: anchor.y + anchor.inwardY * inset,
  };
  return Object.freeze({
    bounds: Object.freeze({ x: center.x - width / 2, y: center.y - height / 2, width, height }),
    center: Object.freeze(center),
    fontSize,
    radius: 4 / scale,
  });
}

const unionRects = (rectangles: readonly AnnotationRect[]): AnnotationRect => {
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x));
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y));
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width));
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export function getCanonicalAreaNameLabelBounds(area: Area): AnnotationRect | null {
  const geometries = [ZONING_ANNOTATION_STYLE.canonicalMinScale, 1, 1.5]
    .map((scale) => getAreaNameLabelGeometry(area, scale))
    .filter((geometry): geometry is AreaNameLabelGeometry => geometry !== null);
  return geometries.length ? unionRects(geometries.map((geometry) => geometry.bounds)) : null;
}

export function getPlacementCollisionBounds(
  placement: Pick<Placement, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): AnnotationRect {
  const radians = (placement.rotation || 0) * Math.PI / 180;
  const width = Math.abs(placement.width * Math.cos(radians)) + Math.abs(placement.height * Math.sin(radians));
  const height = Math.abs(placement.width * Math.sin(radians)) + Math.abs(placement.height * Math.cos(radians));
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;
  return Object.freeze({ x: centerX - width / 2, y: centerY - height / 2, width, height });
}

export function getAnnotationPresentation(
  annotation: ZoningAnnotationDescriptor,
  displayScale = 1,
): AnnotationPresentation {
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const desiredWidth = ZONING_ANNOTATION_STYLE.maxWidth / scale;
  const desiredHeight = (annotation.lines.length + (annotation.omitted > 0 ? 1 : 0)) *
    ZONING_ANNOTATION_STYLE.lineHeight / scale;
  const width = Math.min(annotation.bounds.width, desiredWidth);
  const height = Math.min(annotation.bounds.height, desiredHeight);
  return Object.freeze({
    bounds: Object.freeze({
      x: annotation.bounds.x + (annotation.bounds.width - width) / 2,
      y: annotation.bounds.y + (annotation.bounds.height - height) / 2,
      width,
      height,
    }),
    fontSize: ZONING_ANNOTATION_STYLE.fontSize / scale,
    lineHeight: ZONING_ANNOTATION_STYLE.lineHeight / scale,
    outlineWidth: ZONING_ANNOTATION_STYLE.outlineWidth / scale,
  });
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
}: LayoutInput): readonly ZoningAnnotationDescriptor[] {
  const canonicalScale = ZONING_ANNOTATION_STYLE.canonicalMinScale;
  const scaled = (value: number) => value / canonicalScale;
  const orderedAreas = [...areas].sort((a, b) => a.id - b.id);
  const nameBounds = orderedAreas.map(getCanonicalAreaNameLabelBounds).filter(
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
        const lines = displayedLines(rows, visibleCount, width * canonicalScale);
        descriptor = Object.freeze({
          areaId: area.id,
          lines: Object.freeze(lines),
          omitted,
          bounds: Object.freeze(candidateBounds),
          anchor: candidate.name,
          accessibleText: [...rows.slice(0, visibleCount), ...(omitted ? [`+${omitted} more`] : [])].join('; '),
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
