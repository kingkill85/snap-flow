import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaPolygon } from './AreaPolygon';
import type { Area } from '@/services/area';
import { layoutZoningAnnotations, ZONING_ANNOTATION_STYLE } from './zoning-annotation';

const props = { isSelected: false, scale: 2, onSelect: vi.fn(), onMove: vi.fn(), onVertexMove: vi.fn(), onVerticesReplace: vi.fn(), onVertexAdd: vi.fn(), onVertexDelete: vi.fn(), onVerticesCommit: vi.fn() };
const base: Area = { id: 1, floorplan_id: 1, x: 0, y: 0, width: 600, height: 400, name: 'Room', color: '#0000ff', opacity: .2, revision: 1, device_count: 0, created_at: '', updated_at: '', vertices: [
  { id: 1, placement_id: 1, vertex_index: 0, x: 0, y: 0 }, { id: 2, placement_id: 1, vertex_index: 1, x: 600, y: 0 }, { id: 3, placement_id: 1, vertex_index: 2, x: 600, y: 400 }, { id: 4, placement_id: 1, vertex_index: 3, x: 0, y: 400 },
], zoning_groups: [] };

describe('AreaPolygon zoning annotation', () => {
  it('omits annotations when the shared model has no positive rows', () => { const { container } = render(<svg><AreaPolygon {...props} area={base} /></svg>); expect(container.querySelector('[data-testid="area-zoning-annotation"]')).toBeNull(); });
  it('renders the shared descriptor directly with full text, dual contrast and pointer pass-through', () => {
    const parameters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Very long zoning parameter name ${index}`, sort_order: index, value: index === 0 ? 0 : index }));
    const area = { ...base, zoning_groups: [{ item_type: { id: 1, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 1 }, parameters }] };
    const annotation = layoutZoningAnnotations({ areas: [area], productBounds: [], imageBounds: { x: 0, y: 0, width: 500, height: 300 } })[0];
    const { container } = render(<svg><AreaPolygon {...props} area={area} zoningAnnotation={annotation} /></svg>);
    const rendered = screen.getByLabelText(/Zoning annotation/);
    expect(rendered).toHaveStyle({ pointerEvents: 'none' });
    expect(container.querySelector('[data-testid="area-zoning-annotation"] rect')).toBeNull();
    expect(container.textContent).not.toContain('name 0: 0');
    expect(container.textContent).toContain(`+${annotation.omitted} more`);
    expect(container.querySelector('title')?.textContent).toContain('Lighting');
    const text = container.querySelector('[data-testid="area-zoning-annotation"] text')!;
    expect(text).toHaveAttribute('fill', ZONING_ANNOTATION_STYLE.foreground);
    expect(text).toHaveAttribute('stroke', ZONING_ANNOTATION_STYLE.outline);
  });
});
