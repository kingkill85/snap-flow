import { describe, it, expect } from 'vitest';
import { pointInPolygon, polygonArea, findContainingArea } from '../src/utils/point-in-polygon';

// Helper: rectangle vertices (clockwise)
function rectVertices(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

describe('pointInPolygon', () => {
  const rect = rectVertices(0, 0, 100, 100);

  it('returns true for a point inside a rectangle', () => {
    expect(pointInPolygon(50, 50, rect)).toBe(true);
  });

  it('returns false for a point outside a rectangle', () => {
    expect(pointInPolygon(150, 150, rect)).toBe(false);
  });

  it('returns true for a point inside an L-shaped polygon', () => {
    // L-shape: full 100x100 square minus top-right 50x50 quadrant
    const lShape = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Point in the bottom-left portion of the L
    expect(pointInPolygon(25, 75, lShape)).toBe(true);
  });

  it('returns false for a point in the notch of an L-shaped polygon', () => {
    // Same L-shape as above — the notch is the top-right quadrant (x>50, y<50)
    const lShape = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Point inside the notch (cut-out top-right area)
    expect(pointInPolygon(75, 25, lShape)).toBe(false);
  });
});

describe('polygonArea', () => {
  it('computes the area of a 100x100 rectangle as 10000', () => {
    expect(polygonArea(rectVertices(0, 0, 100, 100))).toBe(10000);
  });

  it('computes the area of a 200x150 rectangle as 30000', () => {
    expect(polygonArea(rectVertices(0, 0, 200, 150))).toBe(30000);
  });
});

describe('findContainingArea', () => {
  it('returns the area id when the point is inside one of two non-overlapping areas', () => {
    const areas = [
      { id: 1, vertices: rectVertices(0, 0, 100, 100) },
      { id: 2, vertices: rectVertices(200, 200, 100, 100) },
    ];
    expect(findContainingArea(50, 50, areas)).toBe(1);
    expect(findContainingArea(250, 250, areas)).toBe(2);
  });

  it('returns null when the point is outside all areas', () => {
    const areas = [
      { id: 1, vertices: rectVertices(0, 0, 100, 100) },
      { id: 2, vertices: rectVertices(200, 200, 100, 100) },
    ];
    expect(findContainingArea(500, 500, areas)).toBeNull();
  });

  it('returns the smaller area id when the point is inside two overlapping areas', () => {
    // Large area: 0,0 → 200x200
    // Small area: 50,50 → 50x50 (fully inside the large one)
    const areas = [
      { id: 1, vertices: rectVertices(0, 0, 200, 200) },
      { id: 2, vertices: rectVertices(50, 50, 50, 50) },
    ];
    // Point inside the small area (and also inside the large one)
    expect(findContainingArea(75, 75, areas)).toBe(2);
  });
});
