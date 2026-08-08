import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfiguratorCanvas } from '@/components/configurator/ConfiguratorCanvas';
import type { Placement } from '@/services/placement';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

const floorplan = {
  id: 42,
  project_id: 7,
  name: 'Ground Floor',
  image_path: 'floorplans/ground.png',
  sort_order: 1,
  created_at: '2026-01-01',
};

const placement: Placement = {
  id: 9,
  type: 'item',
  bom_id: 12,
  area_id: null,
  floorplan_id: 42,
  item_id: 3,
  item_variant_id: 5,
  x: 1,
  y: 2,
  width: 30,
  height: 30,
  rotation: 0,
  created_at: '2026-01-01',
};

function renderCanvas(placements: Placement[], onCleanSlate?: () => void) {
  return render(
    <DndContext>
      <ConfiguratorCanvas
        floorplan={floorplan}
        placements={placements}
        items={[]}
        bom={null}
        placementAddons={{ current: new Map() }}
        onPlacementDelete={vi.fn()}
        onPlacementUpdate={vi.fn()}
        onCleanSlate={onCleanSlate}
      />
    </DndContext>,
  );
}

describe('Configurator Clean Slate control', () => {
  it('is hidden when editing is not authorized', () => {
    renderCanvas([placement]);
    expect(screen.queryByRole('button', { name: 'Clean Slate' })).not.toBeInTheDocument();
  });

  it('is disabled for an empty floorplan', () => {
    renderCanvas([], vi.fn());
    expect(screen.getByRole('button', { name: 'Clean Slate' })).toBeDisabled();
  });

  it('invokes confirmation for a populated editable floorplan', async () => {
    const onCleanSlate = vi.fn();
    renderCanvas([placement], onCleanSlate);
    await userEvent.click(screen.getByRole('button', { name: 'Clean Slate' }));
    expect(onCleanSlate).toHaveBeenCalledOnce();
  });
});
