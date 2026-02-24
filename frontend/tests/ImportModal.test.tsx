import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ImportModal } from '@/components/items/ImportModal';

vi.mock('@/services/item', () => ({
  itemService: {
    syncCatalog: vi.fn(),
  },
}));

describe('ImportModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when closed', () => {
    render(
      <ImportModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
  });

  it('renders without crashing when open', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
  });
});
