import { useRef, useCallback, useEffect } from 'react';
import type { Area } from '@/services/area';
import type { ZoningAnnotationDescriptor } from './zoning-annotation';
import { getAnnotationPresentation, getAreaNameLabelGeometry, ZONING_ANNOTATION_STYLE } from './zoning-annotation';

export interface AreaPolygonProps {
  area: Area;
  isSelected: boolean;
  scale: number;
  onSelect: (id: number) => void;
  onMove: (id: number, dx: number, dy: number) => void;
  onVertexMove: (id: number, vertexIndex: number, x: number, y: number) => void;
  onVerticesReplace: (id: number, vertices: { index: number; x: number; y: number }[]) => void;
  onVertexAdd: (id: number, afterIndex: number, x: number, y: number) => void;
  onVertexDelete: (id: number, vertexIndex: number) => void;
  onVerticesCommit: (id: number) => void;
  zoningAnnotation?: ZoningAnnotationDescriptor;
  showZoningAnnotation?: boolean;
}

interface DragState {
  type: 'polygon' | 'vertex';
  startClientX: number;
  startClientY: number;
  vertexIndex?: number;
  mode?: string; // unused, modifier keys checked live on each move
  svgEl: SVGSVGElement;
  pointerId: number;
  target: Element;
}

/** Convert client position to SVG user-space coordinates */
function clientToSvg(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const inv = ctm.inverse();
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(inv);
  return { x: transformed.x, y: transformed.y };
}


export function AreaPolygon({
  area,
  isSelected,
  scale,
  onSelect,
  onMove,
  onVertexMove,
  onVerticesReplace,
  onVertexAdd,
  onVertexDelete,
  onVerticesCommit,
  zoningAnnotation,
  showZoningAnnotation = true,
}: AreaPolygonProps) {
  const dragStateRef = useRef<DragState | null>(null);
  const prevSvgPosRef = useRef<{ x: number; y: number } | null>(null);

  const color = area.color || '#6366f1';
  const opacity = area.opacity ?? 0.15;

  const sortedVertices = [...area.vertices].sort(
    (a, b) => a.vertex_index - b.vertex_index,
  );

  const pointsStr = sortedVertices.map((v) => `${v.x},${v.y}`).join(' ');

  // Scale-invariant sizes (matching item placement handles: w-4 h-4 = 16px, border-2)
  const handleRadius = 6 / scale;  // Inner radius — with 2px stroke gives ~16px total visual diameter
  const handleStroke = 2 / scale;
  const edgeHitWidth = 12 / scale;
  const nameGeometry = getAreaNameLabelGeometry(area, scale);
  const annotationPresentation = zoningAnnotation ? getAnnotationPresentation(zoningAnnotation, scale) : null;
  const exportPresentation = zoningAnnotation ? getAnnotationPresentation(zoningAnnotation, 1) : null;


  // -----------------------------------------------------------------------
  // Pointer event handlers (not mouse — pointer events let us use
  // setPointerCapture which locks all events to the element, preventing
  // dnd-kit's PointerSensor from intercepting them)
  // -----------------------------------------------------------------------

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      e.preventDefault();
      e.stopPropagation();

      const currentSvgPos = clientToSvg(state.svgEl, e.clientX, e.clientY);

      if (state.type === 'polygon') {
        const prev = prevSvgPosRef.current;
        if (prev) {
          const dx = currentSvgPos.x - prev.x;
          const dy = currentSvgPos.y - prev.y;
          onMove(area.id, dx, dy);
        }
        prevSvgPosRef.current = currentSvgPos;
      } else if (state.type === 'vertex' && state.vertexIndex !== undefined) {
        // Check modifier keys live on each move event
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const mode = (ctrl && shift) ? 'snap'
          : ctrl ? 'free'
          : shift ? 'stretch'
          : 'proportional';

        if (mode === 'snap') {
          // Ctrl+Shift: magnetize — snap angles to both neighbors on 5-degree grid,
          // then find the intersection of the two snapped rays
          const dragIdx = state.vertexIndex;
          const verts = sortedVertices;
          const P = verts[(dragIdx - 1 + verts.length) % verts.length];
          const N = verts[(dragIdx + 1) % verts.length];

          // Snapped angle from prev vertex toward cursor
          const angleP = Math.atan2(currentSvgPos.y - P.y, currentSvgPos.x - P.x);
          const snapP = Math.round(angleP * (180 / Math.PI) / 5) * 5 * (Math.PI / 180);
          // Direction vector for ray from P
          const dPx = Math.cos(snapP), dPy = Math.sin(snapP);

          // Snapped angle from next vertex toward cursor
          const angleN = Math.atan2(currentSvgPos.y - N.y, currentSvgPos.x - N.x);
          const snapN = Math.round(angleN * (180 / Math.PI) / 5) * 5 * (Math.PI / 180);
          // Direction vector for ray from N
          const dNx = Math.cos(snapN), dNy = Math.sin(snapN);

          // Find intersection of ray P + t*dP and ray N + s*dN
          const denom = dPx * dNy - dPy * dNx;
          if (Math.abs(denom) > 0.001) {
            // Rays intersect
            const t = ((N.x - P.x) * dNy - (N.y - P.y) * dNx) / denom;
            const snapX = P.x + t * dPx;
            const snapY = P.y + t * dPy;
            onVertexMove(area.id, state.vertexIndex, snapX, snapY);
          } else {
            // Rays are parallel — just snap to the prev vertex angle
            const dist = Math.hypot(currentSvgPos.x - P.x, currentSvgPos.y - P.y);
            onVertexMove(area.id, state.vertexIndex, P.x + dPx * dist, P.y + dPy * dist);
          }
        } else if (mode === 'free') {
          // Ctrl: free vertex move
          onVertexMove(area.id, state.vertexIndex, currentSvgPos.x, currentSvgPos.y);
        } else if (mode === 'stretch') {
          // Shift: stretch — opposite vertex stays fixed, adjacent vertices adjust
          const dragIdx = state.vertexIndex;
          const verts = sortedVertices;
          const oppositeIdx = verts.length === 4
            ? (dragIdx + 2) % 4
            : (() => { let best = 0, maxD = 0; for (let i = 0; i < verts.length; i++) { if (i === dragIdx) continue; const d = Math.hypot(verts[i].x - verts[dragIdx].x, verts[i].y - verts[dragIdx].y); if (d > maxD) { maxD = d; best = i; } } return best; })();
          const anchor = verts[oppositeIdx];

          // Move dragged vertex freely, scale adjacent vertices along each axis independently
          const orig = verts[dragIdx];
          const dxOrig = orig.x - anchor.x;
          const dyOrig = orig.y - anchor.y;
          const dxNew = currentSvgPos.x - anchor.x;
          const dyNew = currentSvgPos.y - anchor.y;
          const scaleX = Math.abs(dxOrig) > 1 ? dxNew / dxOrig : 1;
          const scaleY = Math.abs(dyOrig) > 1 ? dyNew / dyOrig : 1;

          const updates = verts
            .filter((_, i) => i !== oppositeIdx)
            .map((v) => ({
              index: v.vertex_index,
              x: anchor.x + (v.x - anchor.x) * scaleX,
              y: anchor.y + (v.y - anchor.y) * scaleY,
            }));

          onVerticesReplace(area.id, updates);
        } else {
          // Proportional scale: anchor at the furthest vertex, scale all vertices
          const dragIdx = state.vertexIndex;
          const verts = sortedVertices;

          // Find anchor — vertex furthest from the dragged one
          const dragged = verts[dragIdx];
          let anchorIdx = 0;
          let maxDist = 0;
          for (let i = 0; i < verts.length; i++) {
            if (i === dragIdx) continue;
            const d = Math.hypot(verts[i].x - dragged.x, verts[i].y - dragged.y);
            if (d > maxDist) { maxDist = d; anchorIdx = i; }
          }
          const anchor = verts[anchorIdx];

          // Original distance from anchor to dragged vertex
          const origDist = Math.hypot(dragged.x - anchor.x, dragged.y - anchor.y);
          if (origDist < 1) {
            prevSvgPosRef.current = currentSvgPos;
            return;
          }

          // New distance from anchor to mouse
          const newDist = Math.hypot(currentSvgPos.x - anchor.x, currentSvgPos.y - anchor.y);
          const scaleFactor = newDist / origDist;

          // Scale all vertices relative to anchor
          const updates = verts
            .filter((_, i) => i !== anchorIdx)
            .map((v) => ({
              index: v.vertex_index,
              x: anchor.x + (v.x - anchor.x) * scaleFactor,
              y: anchor.y + (v.y - anchor.y) * scaleFactor,
            }));

          onVerticesReplace(area.id, updates);
        }
        prevSvgPosRef.current = currentSvgPos;
      }
    },
    [area.id, onMove, onVertexMove, onVerticesReplace, sortedVertices],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (state) {
        (state.target as Element).releasePointerCapture(state.pointerId);
        onVerticesCommit(area.id);
      }
      dragStateRef.current = null;
      prevSvgPosRef.current = null;
      e.currentTarget?.removeEventListener('pointermove', handlePointerMove as EventListener);
      e.currentTarget?.removeEventListener('pointerup', handlePointerUp as EventListener);
    },
    [area.id, onVerticesCommit, handlePointerMove],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = dragStateRef.current;
      if (state) {
        try { (state.target as Element).releasePointerCapture(state.pointerId); } catch { /* ok */ }
      }
    };
  }, []);

  const startVertexDrag = useCallback(
    (e: React.PointerEvent<SVGElement>, vertexIndex: number) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      const svgEl = target.ownerSVGElement;
      if (!svgEl) return;

      target.setPointerCapture(e.pointerId);

      const startSvg = clientToSvg(svgEl, e.clientX, e.clientY);
      prevSvgPosRef.current = startSvg;
      const mode = (e.ctrlKey || e.metaKey) ? 'free' as const
        : e.shiftKey ? 'stretch' as const
        : 'proportional' as const;

      dragStateRef.current = {
        type: 'vertex',
        startClientX: e.clientX,
        startClientY: e.clientY,
        vertexIndex,
        mode,
        svgEl,
        pointerId: e.pointerId,
        target,
      };

      target.addEventListener('pointermove', handlePointerMove as EventListener);
      target.addEventListener('pointerup', handlePointerUp as EventListener);
    },
    [handlePointerMove, handlePointerUp],
  );

  // Simple drag tracking — did the user drag or click?
  const didDragRef = useRef(false);

  const handlePolygonMouseDown = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      if (isSelected) return;

      const svgEl = (e.target as SVGElement).ownerSVGElement;
      if (!svgEl) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let prevPos = clientToSvg(svgEl, startX, startY);
      didDragRef.current = false;

      const handleMove = (me: MouseEvent) => {
        if (!didDragRef.current && Math.hypot(me.clientX - startX, me.clientY - startY) > 4) {
          didDragRef.current = true;
        }
        if (didDragRef.current) {
          const cur = clientToSvg(svgEl, me.clientX, me.clientY);
          onMove(area.id, cur.x - prevPos.x, cur.y - prevPos.y);
          prevPos = cur;
        }
      };

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        if (didDragRef.current) {
          onVerticesCommit(area.id);
        }
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [area.id, isSelected, onMove, onVerticesCommit],
  );

  const handlePolygonClick = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>) => {
      e.stopPropagation();
      if (!didDragRef.current) {
        onSelect(area.id);
      }
      didDragRef.current = false;
    },
    [area.id, onSelect],
  );

  const handleEdgeMouseDown = useCallback(
    (e: React.MouseEvent<SVGLineElement>, afterIndex: number) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const svgEl = (e.currentTarget as SVGElement).ownerSVGElement;
      if (!svgEl) return;

      const pos = clientToSvg(svgEl, e.clientX, e.clientY);
      // Insert the new vertex
      onVertexAdd(area.id, afterIndex, pos.x, pos.y);
      didDragRef.current = true;

      // Immediately start dragging the new vertex (index = afterIndex + 1)
      const newVertexIndex = afterIndex + 1;

      dragStateRef.current = {
        type: 'vertex',
        startClientX: e.clientX,
        startClientY: e.clientY,
        vertexIndex: newVertexIndex,
        mode: 'free',
        svgEl,
        pointerId: 0,
        target: e.currentTarget,
      };

      const handleMove = (me: MouseEvent) => {
        const cur = clientToSvg(svgEl, me.clientX, me.clientY);
        onVertexMove(area.id, newVertexIndex, cur.x, cur.y);
      };

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        dragStateRef.current = null;
        onVerticesCommit(area.id);
        // Suppress the next click so it doesn't hit the canvas and deselect
        const suppressClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
        window.addEventListener('click', suppressClick, { capture: true, once: true });
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [area.id, onVertexAdd, onVertexMove, onVerticesCommit],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <g
      data-area-id={area.id}
      style={{ cursor: 'move' }}
      onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
    >
      {/* Polygon fill + border — subtle when unselected, prominent when selected */}
      <polygon
        points={pointsStr}
        fill={color}
        fillOpacity={opacity}
        stroke={isSelected ? color : 'transparent'}
        strokeWidth={2 / scale}
        strokeOpacity={1}
        onMouseDown={handlePolygonMouseDown}
        onClick={handlePolygonClick}
        style={{ cursor: 'move' }}
      />

      {/* Name label — on the longest edge, offset inward, with dark pill background */}
      {nameGeometry && (
          <g style={{ pointerEvents: 'none' }}>
            <defs>
              <clipPath id={`area-name-clip-${area.id}`}>
                <path d={`M ${nameGeometry.clipBounds.x} ${nameGeometry.clipBounds.y} h ${nameGeometry.clipBounds.width} v ${nameGeometry.clipBounds.height} h -${nameGeometry.clipBounds.width} Z`} />
              </clipPath>
            </defs>
            <rect
              data-testid="area-name-label-bounds"
              x={nameGeometry.bounds.x}
              y={nameGeometry.bounds.y}
              width={nameGeometry.bounds.width}
              height={nameGeometry.bounds.height}
              rx={nameGeometry.radius}
              fill={nameGeometry.background}
            />
            <g
              data-testid="area-name-text-clip"
              clipPath={`url(#area-name-clip-${area.id})`}
            >
              <text
                data-testid="area-name-text"
                x={nameGeometry.center.x}
                y={nameGeometry.center.y + nameGeometry.fontSize * 0.35}
                fontFamily={nameGeometry.fontFamily}
                fontSize={nameGeometry.fontSize}
                fontWeight={nameGeometry.fontWeight}
                fill={nameGeometry.foreground}
                textAnchor="middle"
                style={{ userSelect: 'none' }}
              >
                <title>{nameGeometry.fullText}</title>
                {nameGeometry.displayText}
              </text>
            </g>
          </g>
      )}

      {showZoningAnnotation && zoningAnnotation && annotationPresentation && exportPresentation ? (
        <g
          data-testid="area-zoning-annotation"
          data-anchor={zoningAnnotation.anchor}
          data-bounds={`${annotationPresentation.bounds.x},${annotationPresentation.bounds.y},${annotationPresentation.bounds.width},${annotationPresentation.bounds.height}`}
          data-export-bounds={`${exportPresentation.bounds.x},${exportPresentation.bounds.y},${exportPresentation.bounds.width},${exportPresentation.bounds.height}`}
          data-omitted={zoningAnnotation.omitted}
          data-minimum-readable-scale={zoningAnnotation.minimumReadableScale}
          data-presentation-scale={annotationPresentation.effectiveScale}
          data-line-height={annotationPresentation.lineHeight}
          aria-label={`Zoning annotation: ${zoningAnnotation.accessibleText}`}
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <clipPath id={`zoning-annotation-clip-${area.id}`}>
              <path data-testid="area-zoning-clip-boundary" d={`M ${annotationPresentation.clipBounds.x} ${annotationPresentation.clipBounds.y} h ${annotationPresentation.clipBounds.width} v ${annotationPresentation.clipBounds.height} h -${annotationPresentation.clipBounds.width} Z`} />
            </clipPath>
          </defs>
          <g clipPath={`url(#zoning-annotation-clip-${area.id})`} data-testid="area-zoning-text-clip">
            {annotationPresentation.lines.map((presentedLine, index) => {
              const sourceLine = zoningAnnotation.lines[index];
              return (
                <g key={`${index}-${presentedLine.text}`}>
                  <rect
                    data-testid="area-zoning-row-background"
                    x={presentedLine.bounds.x}
                    y={presentedLine.bounds.y}
                    width={presentedLine.bounds.width}
                    height={presentedLine.bounds.height}
                    rx={presentedLine.radius}
                    fill={ZONING_ANNOTATION_STYLE.background}
                  />
                  <text
                    x={presentedLine.textX}
                    y={presentedLine.centerY}
                    fontFamily={ZONING_ANNOTATION_STYLE.fontFamily}
                    fontSize={annotationPresentation.fontSize}
                    fontWeight={ZONING_ANNOTATION_STYLE.fontWeight}
                    fill={ZONING_ANNOTATION_STYLE.foreground}
                    dominantBaseline="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {sourceLine && <title>{sourceLine.accessibleText ?? sourceLine.fullText}</title>}
                    {presentedLine.text}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      ) : null}

      {/* Selection-only elements */}
      {isSelected && (
        <>
          {/* Invisible edge lines for Ctrl+click vertex insertion */}
          {sortedVertices.map((v, i) => {
            const next = sortedVertices[(i + 1) % sortedVertices.length];
            return (
              <line
                key={`edge-${v.vertex_index}`}
                x1={v.x}
                y1={v.y}
                x2={next.x}
                y2={next.y}
                stroke="transparent"
                strokeWidth={edgeHitWidth}
                style={{ cursor: 'crosshair' }}
                onMouseDown={(e) => handleEdgeMouseDown(e, v.vertex_index)}
              />
            );
          })}

          {/* Vertex handles — filled purple circles matching item resize handles */}
          {sortedVertices.map((v) => {
            // Pick resize cursor based on vertex position relative to centroid
            const cx = sortedVertices.reduce((s, v) => s + v.x, 0) / sortedVertices.length;
            const cy = sortedVertices.reduce((s, v) => s + v.y, 0) / sortedVertices.length;
            const isLeft = v.x < cx;
            const isTop = v.y < cy;
            const cursor = isTop
              ? (isLeft ? 'nw-resize' : 'ne-resize')
              : (isLeft ? 'sw-resize' : 'se-resize');
            return (
              <circle
                key={`handle-${v.vertex_index}`}
                cx={v.x}
                cy={v.y}
                r={handleRadius}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--background))"
                strokeWidth={handleStroke}
                style={{ cursor, touchAction: 'none', filter: `drop-shadow(0 ${1/scale}px ${3/scale}px rgba(0,0,0,0.25))` }}
                onPointerDown={(e) => startVertexDrag(e, v.vertex_index)}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                  if (!e.ctrlKey && !e.metaKey) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (sortedVertices.length > 3) {
                    onVertexDelete(area.id, v.vertex_index);
                  }
                }}
              />
            );
          })}

          {/* Edit + Delete buttons rendered as HTML overlay in ConfiguratorCanvas */}
        </>
      )}
    </g>
  );
}
