import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
});
