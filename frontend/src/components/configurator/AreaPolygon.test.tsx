import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaPolygon } from './AreaPolygon';
import type { Area } from '@/services/area';

const props = { isSelected: false, scale: 2, onSelect: vi.fn(), onMove: vi.fn(), onVertexMove: vi.fn(), onVerticesReplace: vi.fn(), onVertexAdd: vi.fn(), onVertexDelete: vi.fn(), onVerticesCommit: vi.fn() };
const base: Area = { id: 1, floorplan_id: 1, x: 0, y: 0, width: 200, height: 100, name: 'Room', color: '#0000ff', opacity: .2, revision: 1, device_count: 0, created_at: '', updated_at: '', vertices: [
  { id: 1, placement_id: 1, vertex_index: 0, x: 0, y: 0 }, { id: 2, placement_id: 1, vertex_index: 1, x: 200, y: 0 }, { id: 3, placement_id: 1, vertex_index: 2, x: 200, y: 100 }, { id: 4, placement_id: 1, vertex_index: 3, x: 0, y: 100 },
], zoning_groups: [] };

describe('AreaPolygon zoning summary', () => {
  it('omits empty groups and zero values', () => { const { container } = render(<svg><AreaPolygon {...props} area={base} /></svg>); expect(container.querySelector('[data-testid="area-zoning-summary"]')).toBeNull(); });
  it('groups positive rows, exposes full text, bounds overflow and passes pointer events through', () => {
    const parameters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Very long zoning parameter name ${index}`, sort_order: index, value: index === 0 ? 0 : index }));
    const area = { ...base, zoning_groups: [{ item_type: { id: 1, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 1 }, parameters }] };
    const { container } = render(<svg><AreaPolygon {...props} area={area} /></svg>);
    const summary = screen.getByLabelText('Zoning summary'); expect(summary).toHaveStyle({ pointerEvents: 'none' });
    expect(container.textContent).not.toContain('name 0'); expect(container.textContent).toContain('+3 more'); expect(container.querySelector('title')?.textContent).toContain('Lighting');
  });
  it('allocates rows across groups, truncates combined labels and keeps viewport-stable geometry', () => {
    const longType = 'Extremely long Product Type name that must never escape the summary bounds';
    const area = { ...base, width: 80, height: 60, vertices: base.vertices.map((vertex) => ({ ...vertex, x: vertex.x * .4, y: vertex.y * .6 })), zoning_groups: [
      { item_type: { id: 1, name: longType, abbreviation: 'ONE', color: '#f00', sort_order: 1 }, parameters: Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `Relay ${index}`, sort_order: index, value: 1 })) },
      { item_type: { id: 2, name: 'HVAC', abbreviation: 'HVC', color: '#0f0', sort_order: 2 }, parameters: [{ id: 20, name: 'Fan zones', sort_order: 1, value: 2 }] },
    ] };
    const { container, rerender } = render(<svg><AreaPolygon {...props} area={area} /></svg>);
    expect(container.textContent).toContain('HVAC — Fan zones: 2');
    expect(container.textContent).toContain('+6 more');
    expect(container.querySelector('title')?.textContent).toContain(longType);
    expect(Array.from(container.querySelectorAll('text')).map((node) => node.childNodes[node.childNodes.length - 1]?.textContent).join('')).not.toContain(`${longType} — Relay 0`);
    const bounds = container.querySelector('[data-testid="area-zoning-summary-bounds"]')!;
    expect(Number(bounds.getAttribute('x'))).toBeGreaterThanOrEqual(2);
    expect(Number(bounds.getAttribute('width'))).toBeLessThanOrEqual(75);
    const bottom = Number(bounds.getAttribute('y')) + Number(bounds.getAttribute('height'));
    for (const text of container.querySelectorAll('[data-testid="area-zoning-summary"] > text')) expect(Number(text.getAttribute('y'))).toBeLessThanOrEqual(bottom);
    const zoomArea = { ...area, width: 400, height: 300, vertices: base.vertices.map((vertex) => ({ ...vertex, x: vertex.x * 2, y: vertex.y * 3 })) };
    rerender(<svg><AreaPolygon {...props} scale={2} area={zoomArea} /></svg>);
    const widthAtTwo = Number(container.querySelector('[data-testid="area-zoning-summary-bounds"]')?.getAttribute('width'));
    rerender(<svg><AreaPolygon {...props} scale={1} area={zoomArea} /></svg>);
    expect(Number(container.querySelector('[data-testid="area-zoning-summary-bounds"]')?.getAttribute('width'))).toBe(widthAtTwo);
  });
});
