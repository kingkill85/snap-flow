/** Ray casting algorithm for point-in-polygon */
export function pointInPolygon(px: number, py: number, vertices: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Shoelace formula for polygon area */
export function polygonArea(vertices: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    area += (vertices[j].x + vertices[i].x) * (vertices[j].y - vertices[i].y);
  }
  return Math.abs(area / 2);
}

/** Find the containing area for a point. Smallest area wins for overlapping areas. */
export function findContainingArea(
  px: number, py: number,
  areas: { id: number; vertices: { x: number; y: number }[] }[]
): number | null {
  let bestId: number | null = null;
  let bestArea = Infinity;
  for (const area of areas) {
    if (pointInPolygon(px, py, area.vertices)) {
      const a = polygonArea(area.vertices);
      if (a < bestArea) {
        bestArea = a;
        bestId = area.id;
      }
    }
  }
  return bestId;
}
