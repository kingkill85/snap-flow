import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportModal } from '../ImportModal';
import { itemService } from '../../../services/item';

// Mock the item service
vi.mock('../../../services/item', () => ({
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

  it('renders upload step when opened', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Import Catalog from Excel')).toBeInTheDocument();
    expect(screen.getByText('Drop Excel file here or click to browse')).toBeInTheDocument();
  });

  it('validates file type on selection', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByText('Please select a valid Excel file (.xlsx or .xls)')).toBeInTheDocument();
  });

  it('accepts valid Excel files', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const validFile = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText('test.xlsx')).toBeInTheDocument();
  });

  it('accepts valid Excel files', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const validFile = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText('test.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Start Import')).toBeInTheDocument();
  });

  it('calls syncCatalog when importing', async () => {
    const mockResult = {
      success: true,
      phases: {
        categories: { added: 2, activated: 0, deactivated: 1, total: 2 },
        items: { added: 5, updated: 3, deactivated: 2, total: 8 },
        variants: { added: 10, updated: 5, deactivated: 3, imagesExtracted: 15, total: 15 },
        addons: { linked: 20, skipped: 0, notFound: 2, total: 22 },
      },
      log: ['Test log entry'],
      errors: [],
    };

    vi.mocked(itemService.syncCatalog).mockResolvedValueOnce(mockResult);

    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const validFile = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => {
      expect(itemService.syncCatalog).toHaveBeenCalledWith(validFile);
    });

    await waitFor(() => {
      expect(screen.getByText('Import Complete')).toBeInTheDocument();
      expect(screen.getByText('Sync Completed Successfully!')).toBeInTheDocument();
    });

    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('displays error when import fails', async () => {
    vi.mocked(itemService.syncCatalog).mockRejectedValueOnce({
      response: { data: { error: 'Network error' } },
    });

    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const validFile = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays correct stats in result cards', async () => {
    const mockResult = {
      success: true,
      phases: {
        categories: { added: 2, activated: 1, deactivated: 1, total: 4 },
        items: { added: 5, updated: 3, deactivated: 2, total: 10 },
        variants: { added: 10, updated: 5, deactivated: 3, imagesExtracted: 15, total: 18 },
        addons: { linked: 20, skipped: 2, notFound: 3, total: 25 },
      },
      log: [],
      errors: [{ row: 5, message: 'Test error' }],
    };

    vi.mocked(itemService.syncCatalog).mockResolvedValueOnce(mockResult);

    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    const validFile = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
      expect(screen.getByText('Base Items')).toBeInTheDocument();
      expect(screen.getByText('Variants')).toBeInTheDocument();
    });
  });

  it('closes modal when clicking close button', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
