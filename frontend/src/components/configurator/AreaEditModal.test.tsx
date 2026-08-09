import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaEditModal } from './AreaEditModal';
import type { Area } from '@/services/area';

const area: Area = { id: 1, floorplan_id: 2, x: 0, y: 0, width: 100, height: 100, name: 'Living', color: '#3b82f6', opacity: .2,
  revision: 4, vertices: [], device_count: 0, created_at: '', updated_at: '', zoning_groups: [
    { item_type: { id: 2, name: 'Lighting', abbreviation: 'LGT', color: '#ff0000', sort_order: 1 }, parameters: [{ id: 8, name: 'Relay zones', sort_order: 1, value: 2 }] },
    { item_type: { id: 3, name: 'HVAC', abbreviation: 'HVC', color: '#00ff00', sort_order: 2 }, parameters: [{ id: 9, name: 'Fan zones', sort_order: 1, value: 0 }] },
  ] };

describe('AreaEditModal zoning parameters', () => {
  it('renders ordered discoverable sections and submits the complete applicable set', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined); render(<AreaEditModal area={area} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Zoning Parameters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lighting/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Fan zones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, expect.objectContaining({ revision: 4, applicable_parameter_ids: [8, 9], zoning_values: [{ parameter_id: 8, value: 2 }, { parameter_id: 9, value: 1 }] })));
  });

  it('bounds decrement at zero and Cancel does not save drafts', () => {
    const onSave = vi.fn(); const onClose = vi.fn(); render(<AreaEditModal area={area} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Decrease Fan zones' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase Relay zones' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalled();
  });

  it('keeps drafts and offers an explicit reload after a 409 conflict', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined); const conflict = { response: { status: 409, data: { error: 'Configuration changed; reload required' } } };
    render(<AreaEditModal area={area} onSave={vi.fn().mockRejectedValue(conflict)} onReload={onReload} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Relay zones'), { target: { value: '7' } }); fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('reload required'); expect(screen.getByLabelText('Relay zones')).toHaveValue(7);
    fireEvent.click(screen.getByRole('button', { name: 'Reload Area' })); await waitFor(() => expect(onReload).toHaveBeenCalledWith(1));
  });
});
