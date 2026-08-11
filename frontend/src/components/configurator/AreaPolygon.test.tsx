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
  it('paints the Area name through the shared bounded descriptor and exposes the full name', () => {
    const fullName = 'W'.repeat(20);
    const { container } = render(<svg><AreaPolygon {...props} scale={0.25} area={{ ...base, name: fullName }} /></svg>);
    const clipped = container.querySelector('[data-testid="area-name-text-clip"]');
    expect(clipped).toHaveAttribute('clip-path', 'url(#area-name-clip-1)');
    expect(container.querySelector('#area-name-clip-1 path')).not.toBeNull();
    const text = container.querySelector('[data-testid="area-name-text"]')!;
    const directlyPainted = [...text.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('');
    expect(directlyPainted).toContain('…');
    expect(directlyPainted).not.toBe(fullName);
    expect(text.querySelector('title')).toHaveTextContent(fullName);
  });
  it('renders the shared descriptor directly with full text, dual contrast and pointer pass-through', () => {
    const parameters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Very long zoning parameter name ${index}`, sort_order: index, value: index === 0 ? 0 : index }));
    const area = { ...base, zoning_groups: [{ item_type: { id: 1, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 1 }, parameters }] };
    const annotation = layoutZoningAnnotations({ areas: [area], productBounds: [], imageBounds: { x: 0, y: 0, width: 500, height: 300 } })[0];
    const { container } = render(<svg><AreaPolygon {...props} area={area} zoningAnnotation={annotation} /></svg>);
    const rendered = screen.getByLabelText(/Zoning annotation/);
    expect(rendered).toHaveStyle({ pointerEvents: 'none' });
    expect(container.querySelector('[data-testid="area-zoning-annotation"] rect')).toBeNull();
    expect(container.querySelector('[data-testid="area-zoning-text-clip"]')).toHaveAttribute('clip-path', 'url(#zoning-annotation-clip-1)');
    expect(container.querySelector('#zoning-annotation-clip-1 path')).not.toBeNull();
    expect(container.textContent).not.toContain('name 0: 0');
    expect(container.textContent).toContain(`+${annotation.omitted} more`);
    expect(container.querySelector('[data-testid="area-zoning-annotation"] title')?.textContent).toContain('Lighting');
    const text = container.querySelector('[data-testid="area-zoning-annotation"] text')!;
    expect(text).toHaveAttribute('fill', ZONING_ANNOTATION_STYLE.foreground);
    expect(text).toHaveAttribute('stroke', ZONING_ANNOTATION_STYLE.outline);
    expect(text).toHaveAttribute('stroke-width', String(ZONING_ANNOTATION_STYLE.outlineWidth / props.scale));
    expect(text).toHaveAttribute('paint-order', 'stroke fill');
    const paintedRows = [...container.querySelectorAll('[data-testid="area-zoning-annotation"] text')]
      .map((row) => [...row.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(''));
    expect(paintedRows.some((row) => /T.*Very.*: ?1/.test(row))).toBe(true);
  });
  it('directly paints distinct stable identifiers after colliding abbreviation truncation', () => {
    const collidingArea: Area = {
      ...base,
      zoning_groups: ['ABCDEFGHIJ', 'ABCDEFGHIK'].map((abbreviation, index) => ({
        item_type: {
          id: 80 + index,
          name: `${'W'.repeat(84)}${index ? 'Beta' : 'Alpha'}`,
          abbreviation,
          color: '#f00',
          sort_order: index,
        },
        parameters: [{ id: 80 + index, name: 'Zones', sort_order: 0, value: 4 }],
      })),
    };
    const annotation = layoutZoningAnnotations({
      areas: [collidingArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1000, height: 800 },
    })[0];
    const { container } = render(<svg><AreaPolygon {...props} area={collidingArea} zoningAnnotation={annotation} /></svg>);
    const directlyPainted = [...container.querySelectorAll('[data-testid="area-zoning-annotation"] text')]
      .map((row) => [...row.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(''));
    expect(directlyPainted).toEqual(annotation.lines.map((line) => line.displayText));
    expect(directlyPainted).toEqual([
      expect.stringMatching(/^#28(?: .+)?·?Z.*:\s*4$/u),
      expect.stringMatching(/^#29(?: .+)?·?Z.*:\s*4$/u),
    ]);
    expect(new Set(directlyPainted).size).toBe(2);
    const fullText = [...container.querySelectorAll('[data-testid="area-zoning-annotation"] title')]
      .map((title) => title.textContent ?? '')
      .join('; ');
    expect(fullText).toContain(`${'W'.repeat(84)}Alpha — Zones: 4`);
    expect(fullText).toContain(`${'W'.repeat(84)}Beta — Zones: 4`);
  });
  it('directly paints the shared descriptor inside production-default Area geometry', () => {
    const productionArea: Area = {
      ...base,
      width: 200,
      height: 150,
      vertices: base.vertices.map((vertex, index) => ({
        ...vertex,
        x: index === 1 || index === 2 ? 200 : 0,
        y: index >= 2 ? 150 : 0,
      })),
      zoning_groups: [{
        item_type: { id: 7, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 0 },
        parameters: [
          { id: 1, name: 'Zone 1', sort_order: 0, value: 1 },
          { id: 2, name: 'Zone 2', sort_order: 1, value: 2 },
        ],
      }],
    };
    const annotation = layoutZoningAnnotations({
      areas: [productionArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1200, height: 800 },
    })[0];
    const { container } = render(<svg><AreaPolygon {...props} scale={1} area={productionArea} zoningAnnotation={annotation} /></svg>);
    const painted = container.querySelector('[data-testid="area-zoning-annotation"]');
    expect(painted).not.toBeNull();
    expect(painted).toHaveAttribute('data-anchor', expect.stringMatching(/^bottom-/));
    expect(painted).toHaveTextContent(/Zone 1.*1/);
    expect(painted).toHaveTextContent(/Zone 2.*2/);
  });
  it.each([1, 2, 8])('never paints %i production-default row(s) below their readable collision density', (rows) => {
    const productionArea: Area = {
      ...base,
      width: 200,
      height: 150,
      vertices: base.vertices.map((vertex, index) => ({
        ...vertex,
        x: index === 1 || index === 2 ? 200 : 0,
        y: index >= 2 ? 150 : 0,
      })),
      zoning_groups: [{
        item_type: { id: 7, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 0 },
        parameters: Array.from({ length: rows }, (_, index) => ({
          id: index + 1, name: `Zone ${index + 1}`, sort_order: index, value: index + 1,
        })),
      }],
    };
    const annotation = layoutZoningAnnotations({
      areas: [productionArea],
      productBounds: [],
      imageBounds: { x: 0, y: 0, width: 1200, height: 800 },
    })[0];
    const { container, rerender } = render(
      <svg><AreaPolygon {...props} scale={0.25} area={productionArea} zoningAnnotation={annotation} /></svg>,
    );
    expect(container.querySelector('[data-testid="area-zoning-annotation"]')).toBeNull();

    const readableScale = rows === 1 ? 0.5 : 0.75;
    rerender(<svg><AreaPolygon {...props} scale={readableScale} area={productionArea} zoningAnnotation={annotation} /></svg>);
    expect(container.querySelector('[data-testid="area-zoning-annotation"]')).toHaveAttribute('data-minimum-readable-scale', String(readableScale));
    expect(container.querySelector('[data-testid="area-zoning-annotation"]')).toHaveAttribute('data-presentation-scale', String(readableScale));
    expect(container.querySelector('[data-testid="area-zoning-annotation"]')).toHaveAttribute('data-omitted', String(rows === 8 ? 7 : 0));
    const readable = container.querySelector('[data-testid="area-zoning-annotation"] text');
    expect(readable).not.toBeNull();
    expect(Number(readable!.getAttribute('font-size')) * readableScale).toBeCloseTo(10);
    expect(Number(readable!.getAttribute('stroke-width')) * readableScale).toBeCloseTo(1.5);
  });
});
