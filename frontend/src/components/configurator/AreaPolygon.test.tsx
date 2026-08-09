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
    expect(container.textContent).not.toContain('name 0'); expect(container.textContent).toContain('+1 more'); expect(container.querySelector('title')?.textContent).toContain('Lighting');
  });
});
