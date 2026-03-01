import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SummaryTab } from '../SummaryTab';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { Floorplan } from '@/services/floorplan';

// Mock services
vi.mock('@/services/bom', () => ({
  bomService: {
    getBomForFloorplan: vi.fn().mockResolvedValue({
      totalPrice: 1000,
      groups: [
        {
          mainEntry: {
            item_name: 'Test Item',
            style_name: 'Black',
            unit_price: 100,
          },
          quantity: 5,
          totalPrice: 500,
        },
        {
          mainEntry: {
            item_name: 'Another Item',
            style_name: null,
            unit_price: 250,
          },
          quantity: 2,
          totalPrice: 500,
        },
      ],
    }),
  },
}));

vi.mock('@/services/invoice-pdf', () => ({
  generateInvoicePDF: vi.fn(),
}));

const mockFloorplans: Floorplan[] = [
  { id: 1, name: 'Basement', project_id: 1, created_at: '2024-01-01' },
  { id: 2, name: 'Ground Floor', project_id: 1, created_at: '2024-01-01' },
];

const mockInvoiceSettings: InvoiceSettings = {
  discount_percentage: 10,
  discount_usd: 200,
  services_percentage: 5,
  services_usd: 100,
  local_currency_code: 'PKR',
  exchange_rate: 280,
};

describe('SummaryTab', () => {
  it('renders loading state initially', () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('displays floorplan breakdown after loading', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('Basement')).toBeInTheDocument();
    expect(screen.getByText('Ground Floor')).toBeInTheDocument();
    expect(screen.getByText('Project Total')).toBeInTheDocument();
  });

  it('shows invoice summary when settings are configured', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Invoice Summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Discount')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Grand Total USD')).toBeInTheDocument();
    expect(screen.getByText('Grand Total PKR')).toBeInTheDocument();
  });

  it('shows configure button when no invoice settings', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Configure Invoice')).toBeInTheDocument();
    });
  });

  it('calls onConfigureInvoice when configure button is clicked', async () => {
    const mockOnConfigure = vi.fn();
    
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={null}
        onConfigureInvoice={mockOnConfigure}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      const button = screen.getByText('Configure Invoice');
      button.click();
    });

    expect(mockOnConfigure).toHaveBeenCalledTimes(1);
  });

  it('displays PDF buttons when invoice is configured', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Invoice Settings')).toBeInTheDocument();
      expect(screen.getByText('Create Invoice (PDF)')).toBeInTheDocument();
    });
  });

  it('shows empty state when no floorplans exist', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={[]}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No floorplans yet. Create a floorplan to see breakdown.')).toBeInTheDocument();
    });
  });

  it('formats currency correctly', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      // Check for formatted currency with commas
      const projectTotal = screen.getByText('Project Total').nextElementSibling;
      expect(projectTotal).toHaveTextContent(/\$[\d,]+\.\d{2}/);
    });
  });

  it('refetches data when placementsVersion changes', async () => {
    const { rerender } = render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
        placementsVersion={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });

    // Rerender with updated placementsVersion
    rerender(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
        placementsVersion={1}
      />
    );

    // Should show loading briefly then reload data
    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });
  });
});
