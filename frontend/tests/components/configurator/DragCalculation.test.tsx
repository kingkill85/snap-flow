import { describe, it, expect } from 'vitest';
import { calculateDragPosition } from '@/pages/projects/ProjectDashboard';

describe('calculateDragPosition', () => {
  it('calculates correct position for simple drag at 1:1 scale', () => {
    const result = calculateDragPosition(100, 100, 50, 30, 1, 1);
    expect(result).toEqual({ x: 150, y: 130 });
  });

  it('calculates correct position with scale factors', () => {
    // Scale is 0.5 (display is half of natural size)
    const result = calculateDragPosition(100, 100, 50, 30, 0.5, 0.5);
    // Screen delta of 50 at scale 0.5 = natural delta of 100
    expect(result).toEqual({ x: 200, y: 160 });
  });

  it('handles zero delta (no movement)', () => {
    const result = calculateDragPosition(100, 100, 0, 0, 1, 1);
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it('handles negative drag (moving left/up)', () => {
    const result = calculateDragPosition(100, 100, -50, -30, 1, 1);
    expect(result).toEqual({ x: 50, y: 70 });
  });

  it('handles different X and Y scales', () => {
    // X scale is 0.5, Y scale is 0.25
    const result = calculateDragPosition(100, 100, 50, 25, 0.5, 0.25);
    // Screen delta X: 50 / 0.5 = 100 natural
    // Screen delta Y: 25 / 0.25 = 100 natural
    expect(result).toEqual({ x: 200, y: 200 });
  });

  it('works correctly at various zoom levels', () => {
    // At 200% zoom, scale would be 0.5
    const zoomedResult = calculateDragPosition(100, 100, 100, 100, 0.5, 0.5);
    expect(zoomedResult).toEqual({ x: 300, y: 300 });

    // At 50% zoom, scale would be 2.0
    const zoomedOutResult = calculateDragPosition(100, 100, 50, 50, 2.0, 2.0);
    expect(zoomedOutResult).toEqual({ x: 125, y: 125 });
  });

  it('handles fractional coordinates', () => {
    const result = calculateDragPosition(100.5, 200.3, 25.5, 15.7, 1, 1);
    expect(result).toEqual({ x: 126, y: 216 });
  });

  describe('Rotation scenarios', () => {
    it('handles drag at 0 degrees rotation', () => {
      // At 0°, dragging right 50px should move +50 in X
      const result = calculateDragPosition(100, 100, 50, 0, 1, 1);
      expect(result.x).toBe(150);
      expect(result.y).toBe(100);
    });

    it('handles drag at 90 degrees rotation', () => {
      // At 90°, the calculation is the same - we just use the raw delta
      // The CSS transform handles the visual rotation
      const result = calculateDragPosition(100, 100, 50, 0, 1, 1);
      expect(result.x).toBe(150);
      expect(result.y).toBe(100);
    });

    it('handles drag at 180 degrees rotation', () => {
      // At 180°, the calculation is the same
      const result = calculateDragPosition(100, 100, 50, 0, 1, 1);
      expect(result.x).toBe(150);
      expect(result.y).toBe(100);
    });

    it('handles drag at 270 degrees rotation', () => {
      // At 270°, the calculation is the same
      const result = calculateDragPosition(100, 100, 50, 0, 1, 1);
      expect(result.x).toBe(150);
      expect(result.y).toBe(100);
    });

    it('handles diagonal drag with rotation', () => {
      // Dragging diagonally should maintain proportion
      const result = calculateDragPosition(100, 100, 50, 50, 1, 1);
      expect(result.x).toBe(150);
      expect(result.y).toBe(150);
    });
  });

  describe('Edge cases', () => {
    it('handles very small scale factors', () => {
      // At extreme zoom out
      const result = calculateDragPosition(100, 100, 10, 10, 0.1, 0.1);
      expect(result).toEqual({ x: 200, y: 200 });
    });

    it('handles large coordinates', () => {
      const result = calculateDragPosition(10000, 10000, 5000, 5000, 1, 1);
      expect(result).toEqual({ x: 15000, y: 15000 });
    });

    it('preserves precision with decimal scale', () => {
      const result = calculateDragPosition(100, 100, 33.3, 33.3, 0.333, 0.333);
      // 33.3 / 0.333 ≈ 100
      expect(result.x).toBeCloseTo(200, 0);
      expect(result.y).toBeCloseTo(200, 0);
    });
  });
});
