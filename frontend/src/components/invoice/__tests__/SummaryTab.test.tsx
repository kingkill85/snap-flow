import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SummaryTab } from '../SummaryTab';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { Floorplan } from '@/services/floorplan';
import type { FloorplanTotal } from '@/services/bom';

// Mock services
vi.mock('@/services/invoice-docx', () => ({
  generateInvoiceDOCX: vi.fn().mockResolvedValue(undefined),
}));

const mockFloorplans: Floorplan[] = [
  { id: 1, name: 'Basement', project_id: 1, image_path: 'test.jpg', sort_order: 1 },
  { id: 2, name: 'Ground Floor', project_id: 1, image_path: 'test.jpg', sort_order: 2 },
];

const mockFloorplanTotals: FloorplanTotal[] = [
  {
    floorplan: mockFloorplans[0],
    total: 500,
    items: [
      {
        name: 'Test Item (Black)',
        quantity: 5,
        unitPrice: 100,
        total: 500,
      },
    ],
  },
  {
    floorplan: mockFloorplans[1],
    total: 500,
    items: [
      {
        name: 'Another Item',
        quantity: 2,
        unitPrice: 250,
        total: 500,
      },
    ],
  },
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
  it('renders and shows content when totals are provided', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should show floorplan breakdown
    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });
  });

  it('shows empty state immediately when no floorplans exist', () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={[]} // No floorplans - should show empty state immediately
        floorplanTotals={[]}
        projectTotal={0}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should show empty state immediately without loading
    expect(screen.getByText('No floorplans yet. Create a floorplan to see breakdown.')).toBeInTheDocument();
  });

  it('shows loading when floorplans exist but totals are empty', () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={[]} // Empty totals - should show loading
        projectTotal={0}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should show loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('displays floorplan breakdown', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

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
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
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
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
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
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={null}
        onConfigureInvoice={mockOnConfigure}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Configure Invoice')).toBeInTheDocument();
    });

    const button = screen.getByText('Configure Invoice');
    button.click();

    expect(mockOnConfigure).toHaveBeenCalledTimes(1);
  });

  it('displays DOCX buttons when invoice is configured', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Invoice Settings')).toBeInTheDocument();
      expect(screen.getByText('Create Invoice (DOCX)')).toBeInTheDocument();
    });
  });

  it('formats currency correctly', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    await waitFor(() => {
      // Check for formatted currency with commas
      const projectTotal = screen.getByText('Project Total').nextElementSibling;
      expect(projectTotal).toHaveTextContent(/\$[\d,]+\.\d{2}/);
    });
  });

  it('recalculates totals when floorplanTotals changes', async () => {
    const { rerender } = render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={mockFloorplanTotals}
        projectTotal={1000}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });

    // Rerender with updated totals
    const updatedTotals = [
      {
        ...mockFloorplanTotals[0],
        total: 750,
        items: [
          {
            ...mockFloorplanTotals[0].items[0],
            total: 750,
          },
        ],
      },
      mockFloorplanTotals[1],
    ];

    rerender(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanTotals={updatedTotals}
        projectTotal={1250}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should show updated data
    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });
  });
});
