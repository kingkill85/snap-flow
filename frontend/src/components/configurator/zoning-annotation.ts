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
  clipBounds: Readonly<AnnotationRect>;
  effectiveScale: number;
  fontSize: number;
  lineHeight: number;
  outlineWidth: number;
  textX: number;
  firstBaselineY: number;
}

export interface AreaNameLabelGeometry {
  fullText: string;
  displayText: string;
  bounds: Readonly<AnnotationRect>;
  clipBounds: Readonly<AnnotationRect>;
  center: Readonly<{ x: number; y: number }>;
  fontSize: number;
  radius: number;
  fontFamily: string;
  fontWeight: number;
  foreground: string;
  background: string;
}

export const ZONING_ANNOTATION_STYLE = Object.freeze({
  fontFamily: 'Arial, sans-serif',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 14,
  maxWidth: 150,
  maxRows: 6,
  padding: 4,
  collisionPadding: 5,
  foreground: '#ffffff',
  outline: '#111827',
  outlineWidth: 3,
  canonicalMinScale: 0.25,
});

export const AREA_NAME_LABEL_STYLE = Object.freeze({
  fontFamily: ZONING_ANNOTATION_STYLE.fontFamily,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: 160,
  paddingX: 6,
  paddingY: 3,
  edgeGap: 4,
  radius: 4,
  foreground: '#ffffff',
  background: 'rgba(0,0,0,0.55)',
});

interface LayoutInput {
  areas: readonly Area[];
  productBounds: readonly AnnotationRect[];
  imageBounds: AnnotationRect;
}

interface PositiveAnnotationRow {
  fullText: string;
  productTypeDiscriminator: string;
  productTypeLabel: string;
  parameterName: string;
  value: number;
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
  const areaRectangle = areaBounds(area);
  if (!anchor || !areaRectangle) return null;
  const requestedScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const scale = Math.max(requestedScale, ZONING_ANNOTATION_STYLE.canonicalMinScale);
  const fullText = area.name || 'Area';
  const fontSize = AREA_NAME_LABEL_STYLE.fontSize / scale;
  const padX = AREA_NAME_LABEL_STYLE.paddingX / scale;
  const padY = AREA_NAME_LABEL_STYLE.paddingY / scale;
  const maximumWidth = Math.min(
    AREA_NAME_LABEL_STYLE.maxWidth / scale,
    Math.max(1, areaRectangle.width - AREA_NAME_LABEL_STYLE.edgeGap * 2 / scale),
  );
  const width = Math.min(maximumWidth, conservativeTextWidth(fullText, fontSize) + padX * 2);
  const height = fontSize + padY * 2;
  const inset = height / 2 + AREA_NAME_LABEL_STYLE.edgeGap / scale;
  const rawCenter = {
    x: anchor.x + anchor.inwardX * inset,
    y: anchor.y + anchor.inwardY * inset,
  };
  const center = Object.freeze({
    x: clamp(rawCenter.x, areaRectangle.x + width / 2, areaRectangle.x + areaRectangle.width - width / 2),
    y: clamp(rawCenter.y, areaRectangle.y + height / 2, areaRectangle.y + areaRectangle.height - height / 2),
  });
  const bounds = Object.freeze({ x: center.x - width / 2, y: center.y - height / 2, width, height });
  const displayText = ellipsizeToWidth(fullText, Math.max(0, width - padX * 2), fontSize);
  return Object.freeze({
    fullText,
    displayText,
    bounds,
    clipBounds: bounds,
    center,
    fontSize,
    radius: AREA_NAME_LABEL_STYLE.radius / scale,
    fontFamily: AREA_NAME_LABEL_STYLE.fontFamily,
    fontWeight: AREA_NAME_LABEL_STYLE.fontWeight,
    foreground: AREA_NAME_LABEL_STYLE.foreground,
    background: AREA_NAME_LABEL_STYLE.background,
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
  const geometries = [ZONING_ANNOTATION_STYLE.canonicalMinScale, 0.5, 1, 1.5, 3]
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
  const requestedScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const scale = Math.max(requestedScale, ZONING_ANNOTATION_STYLE.canonicalMinScale);
  const desiredWidth = ZONING_ANNOTATION_STYLE.maxWidth / scale;
  const desiredHeight = (annotation.lines.length + (annotation.omitted > 0 ? 1 : 0)) *
    ZONING_ANNOTATION_STYLE.lineHeight / scale;
  const width = Math.min(annotation.bounds.width, desiredWidth);
  const height = Math.min(annotation.bounds.height, desiredHeight);
  const bounds = Object.freeze({
      x: annotation.bounds.x + (annotation.bounds.width - width) / 2,
      y: annotation.bounds.y + (annotation.bounds.height - height) / 2,
      width,
      height,
  });
  const outlineWidth = ZONING_ANNOTATION_STYLE.outlineWidth / scale;
  return Object.freeze({
    bounds,
    clipBounds: bounds,
    effectiveScale: scale,
    fontSize: ZONING_ANNOTATION_STYLE.fontSize / scale,
    lineHeight: ZONING_ANNOTATION_STYLE.lineHeight / scale,
    outlineWidth,
    textX: bounds.x + (ZONING_ANNOTATION_STYLE.padding + ZONING_ANNOTATION_STYLE.outlineWidth) / scale,
    firstBaselineY: bounds.y +
      (ZONING_ANNOTATION_STYLE.lineHeight - 2 - ZONING_ANNOTATION_STYLE.outlineWidth) / scale,
  });
}

const positiveRows = (area: Area) => {
  const groups = area.zoning_groups
    .map((group) => ({
      ...group,
      parameters: group.parameters.filter((parameter) => parameter.value > 0),
    }))
    .filter((group) => group.parameters.length > 0);
  const queues = groups.map((group) => group.parameters.map((parameter): PositiveAnnotationRow => ({
    fullText: `${group.item_type.name} — ${parameter.name}: ${parameter.value}`,
    // The stable ID-derived token is painted in full before any ellipsized
    // Product Type text. Distinct groups therefore cannot converge during
    // the final width transformation used by either SVG or canvas.
    productTypeDiscriminator: `#${group.item_type.id.toString(36)}`,
    productTypeLabel: group.item_type.abbreviation,
    parameterName: parameter.name,
    value: parameter.value,
  })));
  const rows: PositiveAnnotationRow[] = [];
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

const conservativeGlyphRatio = (glyph: string) => {
  if (/\s/u.test(glyph)) return 0.35;
  if (/[MW]/u.test(glyph)) return 1;
  if (/[mw]/u.test(glyph)) return 0.9;
  if (/[A-Z]/u.test(glyph)) return 0.76;
  if (/[0-9]/u.test(glyph)) return 0.64;
  if (/[.,:;!'|ilI\-·/]/u.test(glyph)) return 0.42;
  if ((glyph.codePointAt(0) ?? 128) <= 127) return 0.66;
  return 1;
};

const conservativeTextWidth = (value: string, fontSize: number = ZONING_ANNOTATION_STYLE.fontSize) => Array.from(value).reduce(
  (width, glyph) => width + conservativeGlyphRatio(glyph) * fontSize,
  0,
);

function ellipsizeToWidth(value: string, width: number, fontSize: number = ZONING_ANNOTATION_STYLE.fontSize) {
  if (conservativeTextWidth(value, fontSize) <= width) return value;
  const ellipsis = '…';
  const ellipsisWidth = conservativeTextWidth(ellipsis, fontSize);
  if (width < ellipsisWidth) return '';
  let result = '';
  let used = 0;
  for (const glyph of Array.from(value)) {
    const glyphWidth = conservativeTextWidth(glyph, fontSize);
    if (used + glyphWidth + ellipsisWidth > width) break;
    result += glyph;
    used += glyphWidth;
  }
  return result ? `${result}${ellipsis}` : ellipsis;
}

function displayedLines(rows: readonly PositiveAnnotationRow[], visibleCount: number, width: number) {
  const availableWidth = width -
    (ZONING_ANNOTATION_STYLE.padding + ZONING_ANNOTATION_STYLE.outlineWidth) * 2;
  const lines: AnnotationLine[] = [];

  for (const row of rows.slice(0, visibleCount)) {
    const identityPrefix = `${row.productTypeDiscriminator} `;
    const identifiedFullText = `${identityPrefix}${row.fullText}`;
    if (conservativeTextWidth(identifiedFullText) <= availableWidth) {
      lines.push({ fullText: row.fullText, displayText: identifiedFullText });
      continue;
    }

    const readable = `${identityPrefix}${row.productTypeLabel} · ${row.parameterName}: ${row.value}`;
    if (conservativeTextWidth(readable) <= availableWidth) {
      lines.push({ fullText: row.fullText, displayText: readable });
      continue;
    }

    const separator = '·';
    const suffix = `:${row.value}`;
    const compactFixedWidth = conservativeTextWidth(row.productTypeDiscriminator + separator + suffix);
    const parameterGlyphs = Array.from(row.parameterName);
    const minimumParameter = parameterGlyphs.length > 1
      ? `${parameterGlyphs[0]}…`
      : (parameterGlyphs[0] ?? '');
    const minimumParameterWidth = conservativeTextWidth(minimumParameter);
    const productTypeBudget = Math.min(
      28,
      Math.max(0, availableWidth - compactFixedWidth - conservativeTextWidth(' ') - minimumParameterWidth),
    );
    const productType = ellipsizeToWidth(row.productTypeLabel, productTypeBudget);
    const productTypeIdentifier = productType
      ? `${row.productTypeDiscriminator} ${productType}`
      : row.productTypeDiscriminator;
    const parameterBudget = availableWidth -
      conservativeTextWidth(productTypeIdentifier + separator + suffix);
    const parameter = ellipsizeToWidth(row.parameterName, parameterBudget);
    const displayText = `${productTypeIdentifier}${separator}${parameter}${suffix}`;

    // If even the compact Product Type + parameter + value form cannot fit,
    // omit the annotation instead of painting a misleading partial value.
    if (!parameter || conservativeTextWidth(displayText) > availableWidth) return null;
    lines.push({ fullText: row.fullText, displayText });
  }

  return lines;
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
    // Reserve the full canonical presentation width independently of the
    // Area's size. Small, ordinary stored Areas use adjacent candidates; if
    // the descriptor inherited their width, valid parameter identity would
    // be compacted away even when the surrounding floorplan has room.
    const width = Math.min(scaled(ZONING_ANNOTATION_STYLE.maxWidth), imageBounds.width);
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
        // Normal user-created Areas can be smaller than the canonical
        // low-zoom text envelope. Keep the same natural-coordinate model,
        // but continue through deterministic adjacent candidates instead of
        // silently dropping persisted values when every inside candidate
        // intersects the Area's own name label.
        { name: 'below-area', x: centerX - width / 2, y: bounds.y + bounds.height + gap },
        { name: 'above-area', x: centerX - width / 2, y: bounds.y - height - gap },
        { name: 'right-of-area', x: bounds.x + bounds.width + gap, y: centerY - height / 2 },
        { name: 'left-of-area', x: bounds.x - width - gap, y: centerY - height / 2 },
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
        if (!lines) continue;
        descriptor = Object.freeze({
          areaId: area.id,
          lines: Object.freeze(lines),
          omitted,
          bounds: Object.freeze(candidateBounds),
          anchor: candidate.name,
          accessibleText: [
            ...rows.slice(0, visibleCount).map((row) => row.fullText),
            ...(omitted ? [`+${omitted} more`] : []),
          ].join('; '),
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
