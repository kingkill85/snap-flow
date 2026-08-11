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
  accessibleText?: string;
  productTypeId?: number;
}

export interface ZoningAnnotationDescriptor {
  areaId: number;
  lines: readonly AnnotationLine[];
  omitted: number;
  bounds: Readonly<AnnotationRect>;
  anchor: string;
  accessibleText: string;
  minimumReadableScale: number;
}

export interface AnnotationPresentation {
  bounds: Readonly<AnnotationRect>;
  clipBounds: Readonly<AnnotationRect>;
  effectiveScale: number;
  fontSize: number;
  lineHeight: number;
  lines: readonly AnnotationLinePresentation[];
}

export interface AnnotationLinePresentation {
  text: string;
  bounds: Readonly<AnnotationRect>;
  textX: number;
  centerY: number;
  radius: number;
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

const FLOORPLAN_LABEL_STYLE = Object.freeze({
  fontFamily: 'Arial, sans-serif',
  fontWeight: 600,
  foreground: '#ffffff',
  background: 'rgba(0,0,0,0.55)',
  radius: 4,
});

export const AREA_NAME_LABEL_STYLE = Object.freeze({
  ...FLOORPLAN_LABEL_STYLE,
  fontSize: 12,
  maxWidth: 160,
  paddingX: 6,
  paddingY: 3,
  edgeGap: 4,
});

export const ZONING_ANNOTATION_STYLE = Object.freeze({
  ...FLOORPLAN_LABEL_STYLE,
  fontSize: AREA_NAME_LABEL_STYLE.fontSize,
  lineHeight: 19,
  maxWidth: 150,
  maxRows: 6,
  paddingX: AREA_NAME_LABEL_STYLE.paddingX,
  paddingY: AREA_NAME_LABEL_STYLE.paddingY,
  collisionPadding: 8,
  canonicalMinScale: 0.25,
});

const ZONING_ANNOTATION_LAYOUT_SCALES = Object.freeze([0.25, 0.5, 0.75, 1]);

interface LayoutInput {
  areas: readonly Area[];
  productBounds: readonly AnnotationRect[];
  imageBounds: AnnotationRect;
}

interface PositiveAnnotationRow {
  fullText: string;
  accessibleText: string;
  productTypeId: number;
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

const containsRect = (outer: AnnotationRect, inner: AnnotationRect) =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const intersectionRect = (left: AnnotationRect, right: AnnotationRect): AnnotationRect | null => {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return rightEdge > x && bottomEdge > y
    ? { x, y, width: rightEdge - x, height: bottomEdge - y }
    : null;
};

const pointOnSegment = (
  point: Readonly<{ x: number; y: number }>,
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
) => {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 1e-7) return false;
  return point.x >= Math.min(start.x, end.x) - 1e-7 && point.x <= Math.max(start.x, end.x) + 1e-7 &&
    point.y >= Math.min(start.y, end.y) - 1e-7 && point.y <= Math.max(start.y, end.y) + 1e-7;
};

const pointInPolygon = (
  point: Readonly<{ x: number; y: number }>,
  vertices: readonly Readonly<{ x: number; y: number }>[],
) => {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const currentVertex = vertices[index];
    const previousVertex = vertices[previous];
    if (pointOnSegment(point, previousVertex, currentVertex)) return true;
    if (
      (currentVertex.y > point.y) !== (previousVertex.y > point.y) &&
      point.x < (previousVertex.x - currentVertex.x) * (point.y - currentVertex.y) /
        (previousVertex.y - currentVertex.y) + currentVertex.x
    ) inside = !inside;
  }
  return inside;
};

const orientation = (
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
  third: Readonly<{ x: number; y: number }>,
) => (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);

const properlyIntersects = (
  firstStart: Readonly<{ x: number; y: number }>,
  firstEnd: Readonly<{ x: number; y: number }>,
  secondStart: Readonly<{ x: number; y: number }>,
  secondEnd: Readonly<{ x: number; y: number }>,
) => {
  const firstSide = orientation(firstStart, firstEnd, secondStart);
  const secondSide = orientation(firstStart, firstEnd, secondEnd);
  const thirdSide = orientation(secondStart, secondEnd, firstStart);
  const fourthSide = orientation(secondStart, secondEnd, firstEnd);
  return firstSide * secondSide < -1e-7 && thirdSide * fourthSide < -1e-7;
};

function areaContainsRect(area: Area, rectangle: AnnotationRect) {
  const vertices = [...area.vertices]
    .sort((left, right) => left.vertex_index - right.vertex_index)
    .map(({ x, y }) => ({ x, y }));
  if (vertices.length < 3) return false;
  const corners = [
    { x: rectangle.x, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
    { x: rectangle.x, y: rectangle.y + rectangle.height },
  ];
  if (!corners.every((corner) => pointInPolygon(corner, vertices))) return false;
  const rectangleEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]] as const);
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    if (rectangleEdges.some(([rectStart, rectEnd]) => properlyIntersects(rectStart, rectEnd, start, end))) {
      return false;
    }
    if (
      start.x > rectangle.x && start.x < rectangle.x + rectangle.width &&
      start.y > rectangle.y && start.y < rectangle.y + rectangle.height
    ) return false;
  }
  return true;
}

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
  const geometries = [...ZONING_ANNOTATION_LAYOUT_SCALES, 1.5, 3]
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
): AnnotationPresentation | null {
  const requestedScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const minimumReadableScale = annotation.minimumReadableScale;
  // minimumReadableScale is the smallest consumer scale whose readable glyph,
  // line, halo, and padding envelope was accepted by layout. Below it the
  // same content cannot fit that collision rectangle at the shared visual
  // size, so omit instead of shrinking or escaping the accepted geometry.
  if (requestedScale + 1e-7 < minimumReadableScale) return null;
  const scale = requestedScale;
  const desiredWidth = ZONING_ANNOTATION_STYLE.maxWidth / scale;
  const renderedRows = annotation.lines.length + (annotation.omitted > 0 ? 1 : 0);
  const desiredHeight = annotationBlockHeight(renderedRows, scale);
  const width = Math.min(annotation.bounds.width, desiredWidth);
  const height = Math.min(annotation.bounds.height, desiredHeight);
  const bounds = Object.freeze({
      x: annotation.bounds.x,
      y: annotation.bounds.y + annotation.bounds.height - height,
      width,
      height,
  });
  const allText = [
    ...annotation.lines.map((line) => line.displayText),
    ...(annotation.omitted > 0 ? [`+${annotation.omitted} more`] : []),
  ];
  const fontSize = ZONING_ANNOTATION_STYLE.fontSize / scale;
  const paddingX = ZONING_ANNOTATION_STYLE.paddingX / scale;
  const paddingY = ZONING_ANNOTATION_STYLE.paddingY / scale;
  const lineHeight = ZONING_ANNOTATION_STYLE.lineHeight / scale;
  const lines = allText.map((text, index): AnnotationLinePresentation => {
    const lineBounds = Object.freeze({
      x: bounds.x,
      y: bounds.y + index * lineHeight,
      width: Math.min(bounds.width, conservativeTextWidth(text, fontSize) + paddingX * 2),
      height: fontSize + paddingY * 2,
    });
    return Object.freeze({
      text,
      bounds: lineBounds,
      textX: lineBounds.x + paddingX,
      centerY: lineBounds.y + lineBounds.height / 2,
      radius: ZONING_ANNOTATION_STYLE.radius / scale,
    });
  });
  return Object.freeze({
    bounds,
    clipBounds: bounds,
    effectiveScale: scale,
    fontSize,
    lineHeight,
    lines: Object.freeze(lines),
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
    accessibleText: `${group.item_type.name} — ${parameter.name}: ${parameter.value} (Product Type identifier ${group.item_type.id})`,
    productTypeId: group.item_type.id,
    productTypeLabel: group.item_type.abbreviation || group.item_type.name,
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

const annotationBlockHeight = (rowCount: number, scale: number) =>
  rowCount > 0
    ? ((rowCount - 1) * ZONING_ANNOTATION_STYLE.lineHeight +
      ZONING_ANNOTATION_STYLE.fontSize + ZONING_ANNOTATION_STYLE.paddingY * 2) / scale
    : 0;

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
    ZONING_ANNOTATION_STYLE.paddingX * 2;
  const lines: AnnotationLine[] = [];

  for (const row of rows.slice(0, visibleCount)) {
    if (conservativeTextWidth(row.fullText) <= availableWidth) {
      lines.push({
        fullText: row.fullText,
        accessibleText: row.accessibleText,
        productTypeId: row.productTypeId,
        displayText: row.fullText,
      });
      continue;
    }

    const readable = `${row.productTypeLabel} · ${row.parameterName}: ${row.value}`;
    if (conservativeTextWidth(readable) <= availableWidth) {
      lines.push({
        fullText: row.fullText,
        accessibleText: row.accessibleText,
        productTypeId: row.productTypeId,
        displayText: readable,
      });
      continue;
    }

    const separator = '·';
    const suffix = `:${row.value}`;
    const compactFixedWidth = conservativeTextWidth(separator + suffix);
    const productTypeGlyphs = Array.from(row.productTypeLabel);
    const minimumProductType = productTypeGlyphs.length > 2
      ? `${productTypeGlyphs.slice(0, 2).join('')}…`
      : productTypeGlyphs.join('');
    const minimumProductTypeWidth = conservativeTextWidth(minimumProductType);
    const parameterGlyphs = Array.from(row.parameterName);
    const minimumParameter = parameterGlyphs.length > 1
      ? `${parameterGlyphs[0]}…`
      : (parameterGlyphs[0] ?? '');
    const minimumParameterWidth = conservativeTextWidth(minimumParameter);
    const productTypeBudget = Math.min(
      44,
      Math.max(minimumProductTypeWidth, availableWidth - compactFixedWidth - conservativeTextWidth(' ') - minimumParameterWidth),
    );
    const productType = ellipsizeToWidth(row.productTypeLabel, productTypeBudget);
    const parameterBudget = availableWidth -
      conservativeTextWidth(productType + separator + suffix);
    const parameter = ellipsizeToWidth(row.parameterName, parameterBudget);
    const displayText = `${productType}${separator}${parameter}${suffix}`;
    const visibleParameterGlyphs = Array.from(parameter).filter((glyph) => glyph !== '…');
    const minimumVisibleParameterGlyphs = Math.min(4, Array.from(row.parameterName).length);

    // If even the compact Product Type + parameter + value form cannot fit,
    // omit the annotation instead of painting a misleading partial value.
    if (!productType || !parameter || visibleParameterGlyphs.length < minimumVisibleParameterGlyphs ||
      conservativeTextWidth(displayText) > availableWidth) return null;
    lines.push({
      fullText: row.fullText,
      accessibleText: row.accessibleText,
      productTypeId: row.productTypeId,
      displayText,
    });
  }

  return lines;
}

export function layoutZoningAnnotations({
  areas,
  productBounds,
  imageBounds,
}: LayoutInput): readonly ZoningAnnotationDescriptor[] {
  const orderedAreas = [...areas].sort((a, b) => a.id - b.id);
  const placed: AnnotationRect[] = [];
  const descriptors: ZoningAnnotationDescriptor[] = [];

  for (const area of orderedAreas) {
    const rows = positiveRows(area);
    const bounds = areaBounds(area);
    if (!rows.length || !bounds) continue;
    const availableRegion = intersectionRect(bounds, imageBounds);
    if (!availableRegion) continue;

    let descriptor: ZoningAnnotationDescriptor | null = null;
    // Keep the viewport-stable 25% envelope when it fits. For smaller Areas,
    // deterministically contract natural-coordinate width, spacing, and rows
    // at the first larger readable density that remains inside every collision
    // boundary. Renderers use it only as a paint-or-omit threshold.
    for (const minimumReadableScale of ZONING_ANNOTATION_LAYOUT_SCALES) {
      if (descriptor) break;
      // The annotation is omitted below minimumReadableScale. At and above
      // that threshold the Area-name pill is largest in natural coordinates
      // at this scale, so this is the exact shared obstacle envelope for every
      // view in which the annotation can actually paint.
      const readableNameBounds = orderedAreas
        .map((candidateArea) => getAreaNameLabelGeometry(candidateArea, minimumReadableScale)?.bounds ?? null)
        .filter((nameBounds): nameBounds is AnnotationRect => nameBounds !== null);
      const scaled = (value: number) => value / minimumReadableScale;
      const gap = scaled(8);
      const maximumWidth = Math.min(
        scaled(ZONING_ANNOTATION_STYLE.maxWidth),
        Math.max(0, availableRegion.width - gap * 2),
      );
      if (maximumWidth <= 0) continue;
      for (
        let visibleCount = Math.min(rows.length, ZONING_ANNOTATION_STYLE.maxRows);
        visibleCount >= 1 && !descriptor;
        visibleCount--
      ) {
        const lines = displayedLines(rows, visibleCount, maximumWidth * minimumReadableScale);
        if (!lines) continue;
        const omitted = rows.length - visibleCount;
        const renderedRows = visibleCount + (omitted > 0 ? 1 : 0);
        const displayedText = [
          ...lines.map((line) => line.displayText),
          ...(omitted > 0 ? [`+${omitted} more`] : []),
        ];
        const contentWidth = Math.max(...displayedText.map((text) =>
          conservativeTextWidth(text) + ZONING_ANNOTATION_STYLE.paddingX * 2
        ));
        const width = Math.min(maximumWidth, scaled(contentWidth));
        const height = annotationBlockHeight(renderedRows, minimumReadableScale);
        const centerX = availableRegion.x + availableRegion.width / 2;
        const centerY = availableRegion.y + availableRegion.height / 2;
        const leftX = availableRegion.x + gap;
        const rightX = availableRegion.x + availableRegion.width - width - gap;
        const bottomY = availableRegion.y + availableRegion.height - height - gap;
        const lowerY = availableRegion.y + availableRegion.height * 0.72 - height / 2;
        const candidates = [
          { name: 'bottom-left', x: leftX, y: bottomY },
          { name: 'bottom-center', x: centerX - width / 2, y: bottomY },
          { name: 'bottom-right', x: rightX, y: bottomY },
          { name: 'lower-left', x: leftX, y: lowerY },
          { name: 'lower-center', x: centerX - width / 2, y: lowerY },
          { name: 'lower-right', x: rightX, y: lowerY },
          { name: 'center', x: centerX - width / 2, y: centerY - height / 2 },
          { name: 'top-center', x: centerX - width / 2, y: availableRegion.y + gap },
          { name: 'top-left', x: leftX, y: availableRegion.y + gap },
          { name: 'top-right', x: rightX, y: availableRegion.y + gap },
        ];
        for (const candidate of candidates) {
          const candidateBounds = {
            x: candidate.x,
            y: candidate.y,
            width,
            height,
          };
          if (!containsRect(imageBounds, candidateBounds) || !areaContainsRect(area, candidateBounds)) continue;
          const collisionPadding = scaled(ZONING_ANNOTATION_STYLE.collisionPadding);
          if (productBounds.some((product) => intersects(candidateBounds, product, collisionPadding))) continue;
          if (readableNameBounds.some((name) => intersects(candidateBounds, name, collisionPadding))) continue;
          if (placed.some((annotation) => intersects(candidateBounds, annotation, collisionPadding))) continue;
          descriptor = Object.freeze({
            areaId: area.id,
            lines: Object.freeze(lines),
            omitted,
            bounds: Object.freeze(candidateBounds),
            anchor: candidate.name,
            accessibleText: [
              ...rows.slice(0, visibleCount).map((row) => row.accessibleText),
              ...(omitted ? [`+${omitted} more`] : []),
            ].join('; '),
            minimumReadableScale,
          });
          break;
        }
      }
    }
    if (descriptor) {
      descriptors.push(descriptor);
      placed.push(descriptor.bounds);
    }
  }
  return Object.freeze(descriptors);
}
