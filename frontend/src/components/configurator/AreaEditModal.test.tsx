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
    expect(screen.getByRole('group', { name: 'Lighting' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fan zones'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, expect.objectContaining({ revision: 4, applicable_parameter_ids: [8, 9], zoning_values: [{ parameter_id: 8, value: 2 }, { parameter_id: 9, value: 1 }] })));
  });

  it('uses compact application controls and Cancel does not save drafts', () => {
    const onSave = vi.fn(); const onClose = vi.fn(); render(<AreaEditModal area={area} onSave={onSave} onClose={onClose} />);
    const input = screen.getByLabelText('Fan zones');
    expect(input).toHaveAttribute('type', 'text'); expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).not.toHaveAttribute('min'); expect(input).not.toHaveAttribute('max'); expect(input).not.toHaveAttribute('step');
    const decrement = screen.getByRole('button', { name: 'Decrease Fan zones' });
    const increment = screen.getByRole('button', { name: 'Increase Fan zones' });
    expect(decrement).toBeDisabled(); expect(increment).toBeEnabled();
    fireEvent.click(increment); expect(input).toHaveValue('1');
    fireEvent.click(decrement); expect(input).toHaveValue('0');
    expect(input.getAttribute('aria-describedby')).toContain('zoning-9-help');
    fireEvent.change(screen.getByLabelText('Relay zones'), { target: { value: '3' } }); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalled();
  });

  it('supports direct entry, Arrow keys, blank-as-zero, and disabled integer boundaries', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AreaEditModal area={area} onSave={onSave} onClose={vi.fn()} />);
    const input = screen.getByLabelText('Fan zones');
    fireEvent.change(input, { target: { value: '41' } }); expect(input).toHaveValue('41');
    fireEvent.keyDown(input, { key: 'ArrowUp' }); expect(input).toHaveValue('42');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(input).toHaveValue('41');
    fireEvent.change(input, { target: { value: '9999' } });
    expect(screen.getByRole('button', { name: 'Increase Fan zones' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'ArrowUp' }); expect(input).toHaveValue('9999');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(''); expect(screen.getByRole('button', { name: 'Decrease Fan zones' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, expect.objectContaining({
      zoning_values: [{ parameter_id: 8, value: 2 }, { parameter_id: 9, value: 0 }],
    })));
  });

  it.each(['1.5', '-1', 'abc', 'NaN', 'Infinity', '10000'])(
    'retains invalid draft %s and blocks the Area mutation',
    async (draft) => {
      const onSave = vi.fn(); render(<AreaEditModal area={area} onSave={onSave} onClose={vi.fn()} />);
      const input = screen.getByLabelText('Fan zones');
      fireEvent.change(input, { target: { value: draft } });
      expect(input).toHaveValue(draft); expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('Enter a whole number from 0 to 9999.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
      await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    },
  );

  it('keeps drafts and offers an explicit reload after a 409 conflict', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined); const conflict = { response: { status: 409, data: { error: 'Configuration changed; reload required' } } };
    render(<AreaEditModal area={area} onSave={vi.fn().mockRejectedValue(conflict)} onReload={onReload} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Relay zones'), { target: { value: '7' } }); fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('reload required'); expect(screen.getByLabelText('Relay zones')).toHaveValue('7');
    fireEvent.click(screen.getByRole('button', { name: 'Reload Area' })); await waitFor(() => expect(onReload).toHaveBeenCalledWith(1));
  });

  it('keeps ordered groups discoverable in responsive layout and Escape discards drafts', () => {
    const onSave = vi.fn(); const onClose = vi.fn(); render(<AreaEditModal area={area} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('group', { name: 'Lighting' }).compareDocumentPosition(screen.getByRole('group', { name: 'HVAC' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(document.querySelector('[class*="md:grid-cols-2"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Relay zones'), { target: { value: '9999' } });
    expect(screen.getByLabelText('Relay zones')).toHaveValue('9999');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('preserves drafts and exposes server validation errors', async () => {
    render(<AreaEditModal area={area} onSave={vi.fn().mockRejectedValue({ response: { status: 400, data: { error: 'Values must be integers' } } })} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Relay zones'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Values must be integers');
    expect(screen.getByLabelText('Relay zones')).toHaveValue('8');
  });
});
