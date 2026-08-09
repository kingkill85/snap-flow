import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import ItemTypeManagement from '@/pages/catalog/ItemTypeManagement';
import { itemTypeService } from '@/services/item-type';
import { useAuth } from '@/context/AuthContext';
import type { ItemType } from '@/services/item-type';

vi.mock('@/services/item-type', () => ({
  itemTypeService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    getZoningParameters: vi.fn(),
    createZoningParameter: vi.fn(),
    updateZoningParameter: vi.fn(),
    deleteZoningParameter: vi.fn(),
    reorderZoningParameters: vi.fn(),
    setZoningParameterActive: vi.fn(),
  },
}));

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockItemTypes: ItemType[] = [
  {
    id: 1,
    name: 'Zigbee',
    abbreviation: 'ZB',
    color: '#3b82f6',
    sort_order: 1,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'KNX',
    abbreviation: 'KNX',
    color: '#f97316',
    sort_order: 2,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('ItemTypeManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useAuth as any).mockReturnValue({ user: { role: 'admin' } });
  });

  it('renders loading state initially', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemTypeService.getAll as any).mockReturnValue(new Promise(() => {})); // never resolves
    render(<ItemTypeManagement />);
    const loader = document.querySelector('.animate-spin');
    expect(loader).toBeInTheDocument();
  });

  it('renders item types after loading', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemTypeService.getAll as any).mockResolvedValue(mockItemTypes);

    await act(async () => {
      render(<ItemTypeManagement />);
    });

    await waitFor(() => {
      expect(screen.getByText('Zigbee')).toBeInTheDocument();
      // KNX appears both as a name and as an abbreviation badge
      expect(screen.getAllByText('KNX').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Add Type button for admins', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemTypeService.getAll as any).mockResolvedValue(mockItemTypes);

    await act(async () => {
      render(<ItemTypeManagement />);
    });

    await waitFor(() => {
      expect(screen.getByText('Add Type')).toBeInTheDocument();
    });
  });

  it('hides Add Type button for non-admins', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useAuth as any).mockReturnValue({ user: { role: 'user' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemTypeService.getAll as any).mockResolvedValue(mockItemTypes);

    await act(async () => {
      render(<ItemTypeManagement />);
    });

    await waitFor(() => {
      expect(screen.getByText('Zigbee')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Type')).not.toBeInTheDocument();
  });

  it('keeps referenced delete open and directs the administrator to deactivate', async () => {
    vi.mocked(itemTypeService.getAll).mockResolvedValue(mockItemTypes);
    vi.mocked(itemTypeService.getZoningParameters).mockResolvedValue([{ id: 9, item_type_id: 1, name: 'Relay zones', sort_order: 1, is_active: true, created_at: '', updated_at: '' }]);
    vi.mocked(itemTypeService.deleteZoningParameter).mockRejectedValue({ response: { data: { error: 'Parameter is in use; deactivate it instead' } } });
    render(<ItemTypeManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Zigbee zoning parameters' }));
    const parameters = await screen.findByLabelText('Zigbee zoning parameters');
    fireEvent.click(parameters.querySelector('button.bg-destructive')!);
    const dialog = await screen.findByRole('dialog', { name: 'Delete Zoning Parameter' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/deactivate.*preserve saved Area values/i);
    expect(dialog).toBeVisible();
  });

  it('surfaces activation and reorder failures in an accessible alert', async () => {
    vi.mocked(itemTypeService.getAll).mockResolvedValue(mockItemTypes);
    vi.mocked(itemTypeService.getZoningParameters).mockResolvedValue([
      { id: 9, item_type_id: 1, name: 'Relay', sort_order: 1, is_active: true, created_at: '', updated_at: '' },
      { id: 10, item_type_id: 1, name: 'Fan', sort_order: 2, is_active: true, created_at: '', updated_at: '' },
    ]);
    vi.mocked(itemTypeService.setZoningParameterActive).mockRejectedValue(new Error('Forbidden'));
    render(<ItemTypeManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Zigbee zoning parameters' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Deactivate' }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    vi.mocked(itemTypeService.reorderZoningParameters).mockRejectedValue(new Error('Invalid order'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Fan up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid order');
  });
});
