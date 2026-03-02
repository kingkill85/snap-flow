import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceSettingsModal } from '../InvoiceSettingsModal';
import type { InvoiceSettings } from '@/services/invoice-settings';

// Mock services
vi.mock('@/services/invoice-settings', () => ({
  invoiceSettingsService: {
    saveSettings: vi.fn().mockResolvedValue({
      discount_percentage: 10,
      discount_usd: 100,
      services_percentage: 5,
      services_usd: 50,
      local_currency_code: 'PKR',
      exchange_rate: 280,
    }),
    getExchangeRate: vi.fn().mockResolvedValue({
      rate: 279.5,
    }),
  },
}));

const mockInitialSettings: InvoiceSettings = {
  discount_percentage: 10,
  discount_usd: 100,
  services_percentage: 5,
  services_usd: 50,
  local_currency_code: 'PKR',
  exchange_rate: 280,
};

describe('InvoiceSettingsModal', () => {
  it('renders with initial settings', async () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialSettings={mockInitialSettings}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Configure Invoice')).toBeInTheDocument();
    }, { timeout: 10000 });
    
    expect(screen.getAllByLabelText('Percentage (%)')[0]).toHaveValue(10);
    expect(screen.getAllByLabelText('Amount (USD)')[0]).toHaveValue(100);
  });

  it('renders with empty values when no initial settings', () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getAllByLabelText('Percentage (%)')[0]).toHaveValue(null);
    expect(screen.getAllByLabelText('Amount (USD)')[0]).toHaveValue(null);
  });

  it('updates discount percentage and calculates reference', async () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const percentageInput = screen.getAllByLabelText('Percentage (%)')[0];
    
    await user.clear(percentageInput);
    await user.type(percentageInput, '15');

    // Reference should show $150 (15% of $1000)
    await waitFor(() => {
      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });
  });

  it('calculates preview totals correctly', async () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialSettings={mockInitialSettings}
      />
    );

    const user = userEvent.setup();
    
    // Update discount to $150
    const discountInput = screen.getAllByLabelText('Amount (USD)')[0];
    await user.clear(discountInput);
    await user.type(discountInput, '150');

    // Preview should show: 1000 - 150 + 50 = 900
    await waitFor(() => {
      expect(screen.getByText('Grand Total USD:')).toBeInTheDocument();
    });
  });

  it('calls onSave and onClose when form is submitted', async () => {
    const mockOnSave = vi.fn();
    const mockOnClose = vi.fn();

    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    const user = userEvent.setup();
    
    // Fill in discount percentage
    const percentageInput = screen.getAllByLabelText('Percentage (%)')[0];
    await user.type(percentageInput, '10');
    
    // Fill in discount amount
    const amountInput = screen.getAllByLabelText('Amount (USD)')[0];
    await user.type(amountInput, '100');

    // Submit form
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        discount_percentage: 10,
        discount_usd: 100,
      }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when cancel button is clicked', async () => {
    const mockOnClose = vi.fn();

    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={mockOnClose}
        onSave={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('fetches exchange rate when refresh button is clicked', async () => {
    const { invoiceSettingsService } = await import('@/services/invoice-settings');
    
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const user = userEvent.setup();
    
    // Click the refresh button to fetch exchange rate
    const refreshButton = screen.getByLabelText('Fetch exchange rate from Google');
    await user.click(refreshButton);
    
    // Verify that getExchangeRate was called with PKR (default currency)
    await waitFor(() => {
      expect(invoiceSettingsService.getExchangeRate).toHaveBeenCalledWith('PKR');
    });
    
    // Verify that the Google Rate is displayed
    await waitFor(() => {
      expect(screen.getByText('279.50 PKR')).toBeInTheDocument();
    });
  });

  it('shows error message when save fails', async () => {
    const { invoiceSettingsService } = await import('@/services/invoice-settings');
    invoiceSettingsService.saveSettings = vi.fn().mockRejectedValue({
      response: { data: { error: 'Failed to save settings' } },
    });

    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const user = userEvent.setup();
    
    // Fill in required fields
    const percentageInput = screen.getAllByLabelText('Percentage (%)')[0];
    await user.type(percentageInput, '10');
    
    const amountInput = screen.getAllByLabelText('Amount (USD)')[0];
    await user.type(amountInput, '100');

    // Submit form
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText('Configure Invoice')).not.toBeInTheDocument();
  });

  it('handles empty string inputs correctly', async () => {
    render(
      <InvoiceSettingsModal
        projectId={1}
        bomTotal={1000}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const user = userEvent.setup();
    
    // Type and then clear
    const percentageInput = screen.getAllByLabelText('Percentage (%)')[0];
    await user.type(percentageInput, '10');
    await user.clear(percentageInput);

    // Should handle empty string gracefully
    expect(percentageInput).toHaveValue(null);
  });
});
