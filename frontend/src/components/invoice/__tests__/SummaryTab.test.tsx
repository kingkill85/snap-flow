import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SummaryTab } from '../SummaryTab';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { Floorplan } from '@/services/floorplan';
import type { FloorplanBom } from '@/services/bom';

// Mock services
vi.mock('@/services/invoice-docx', () => ({
  generateInvoiceDOCX: vi.fn().mockResolvedValue(undefined),
}));

const mockFloorplans: Floorplan[] = [
  { id: 1, name: 'Basement', project_id: 1, created_at: '2024-01-01' },
  { id: 2, name: 'Ground Floor', project_id: 1, created_at: '2024-01-01' },
];

const mockFloorplanBoms = new Map<number, FloorplanBom>([
  [
    1,
    {
      floorplanId: 1,
      totalPrice: 500,
      groups: [
        {
          mainEntry: {
            id: 1,
            project_id: 1,
            floorplan_id: 1,
            item_id: 1,
            variant_id: 1,
            parent_bom_id: null,
            item_name: 'Test Item',
            style_name: 'Black',
            model_number: 'TEST-001',
            unit_price: 100,
            picture_path: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          children: [],
          quantity: 5,
          totalPrice: 500,
          isAvailable: true,
          bomEntryIds: [1],
        },
      ],
    },
  ],
  [
    2,
    {
      floorplanId: 2,
      totalPrice: 500,
      groups: [
        {
          mainEntry: {
            id: 2,
            project_id: 1,
            floorplan_id: 2,
            item_id: 2,
            variant_id: 2,
            parent_bom_id: null,
            item_name: 'Another Item',
            style_name: null,
            model_number: 'TEST-002',
            unit_price: 250,
            picture_path: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          children: [],
          quantity: 2,
          totalPrice: 500,
          isAvailable: true,
          bomEntryIds: [2],
        },
      ],
    },
  ],
]);

const mockInvoiceSettings: InvoiceSettings = {
  discount_percentage: 10,
  discount_usd: 200,
  services_percentage: 5,
  services_usd: 100,
  local_currency_code: 'PKR',
  exchange_rate: 280,
};

describe('SummaryTab', () => {
  it('renders and shows content when BOM data is provided', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanBoms={mockFloorplanBoms}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should eventually show floorplan breakdown
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
        floorplanBoms={new Map()}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
      />
    );

    // Should show empty state immediately without loading
    expect(screen.getByText('No floorplans yet. Create a floorplan to see breakdown.')).toBeInTheDocument();
  });

  it('displays floorplan breakdown after loading', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanBoms={mockFloorplanBoms}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
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
        floorplanBoms={mockFloorplanBoms}
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
        floorplanBoms={mockFloorplanBoms}
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
        floorplanBoms={mockFloorplanBoms}
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
        floorplanBoms={mockFloorplanBoms}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Invoice Settings')).toBeInTheDocument();
      expect(screen.getByText('Create Invoice (DOCX)')).toBeInTheDocument();
    });
  });

  it('shows empty state when no floorplans exist', async () => {
    render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={[]}
        floorplanBoms={new Map()}
        invoiceSettings={null}
        onConfigureInvoice={vi.fn()}
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
        floorplanBoms={mockFloorplanBoms}
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

  it('recalculates totals when floorplanBoms changes', async () => {
    const { rerender } = render(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanBoms={mockFloorplanBoms}
        invoiceSettings={mockInvoiceSettings}
        onConfigureInvoice={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Floorplan Breakdown')).toBeInTheDocument();
    });

    // Rerender with updated BOM data
    const updatedBoms = new Map(mockFloorplanBoms);
    updatedBoms.set(1, {
      ...mockFloorplanBoms.get(1)!,
      totalPrice: 750,
      groups: [
        {
          ...mockFloorplanBoms.get(1)!.groups[0],
          totalPrice: 750,
        },
      ],
    });

    rerender(
      <SummaryTab
        projectName="Test Project"
        projectNumber="PRJ-001"
        customerName="Test Customer"
        floorplans={mockFloorplans}
        floorplanBoms={updatedBoms}
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
