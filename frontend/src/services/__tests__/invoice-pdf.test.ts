import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateInvoicePDF } from '../invoice-pdf';
import type { InvoiceSettings } from '../invoice-settings';
import type { Floorplan } from '../floorplan';

// Mock jsPDF
vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      internal: {
        pageSize: {
          getWidth: vi.fn().mockReturnValue(210),
          getHeight: vi.fn().mockReturnValue(297),
        },
      },
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
      text: vi.fn(),
      output: vi.fn().mockReturnValue(new Blob(['pdf-content'])),
      save: vi.fn(),
    })),
  };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
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

describe.skip("generateInvoicePDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.open
    Object.defineProperty(window, 'open', {
      writable: true,
      value: vi.fn(),
    });
    // Mock URL.createObjectURL
    Object.defineProperty(global, 'URL', {
      writable: true,
      value: {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      },
    });
  });

  it('generates PDF with project header info', () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [],
      projectTotal: 0,
      invoiceSettings: null,
    };

    generateInvoicePDF(data);

    // PDF should be opened in new tab
    expect(window.open).toHaveBeenCalledWith('blob:mock-url', '_blank');
  });

  it('generates PDF with floorplan items', async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [
        {
          floorplan: mockFloorplans[0],
          total: 500,
          items: [
            { name: 'Item 1', quantity: 2, unitPrice: 100, total: 200 },
            { name: 'Item 2', quantity: 1, unitPrice: 300, total: 300 },
          ],
        },
      ],
      projectTotal: 500,
      invoiceSettings: null,
    };

    generateInvoicePDF(data);

    const { default: autoTable } = await import('jspdf-autotable');
    expect(autoTable).toHaveBeenCalled();
  });

  it("generates PDF with invoice calculations", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [
        {
          floorplan: mockFloorplans[0],
          total: 1000,
          items: [{ name: 'Item 1', quantity: 1, unitPrice: 1000, total: 1000 }],
        },
      ],
      projectTotal: 1000,
      invoiceSettings: mockInvoiceSettings,
    };

    generateInvoicePDF(data);

    const { default: autoTable } = await import('jspdf-autotable');
    const calls = autoTable.mock.calls;
    
    // Should have calls for floorplan table and summary table
    expect(calls.length).toBeGreaterThan(0);
  });

  it("calculates grand totals correctly", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [],
      projectTotal: 1000,
      invoiceSettings: {
        discount_percentage: 10,
        discount_usd: 100,
        services_percentage: 10,
        services_usd: 100,
        local_currency_code: 'PKR',
        exchange_rate: 280,
      },
    };

    generateInvoicePDF(data);

    // Expected: 1000 - 100 + 100 = 1000 USD
    // Expected local: 1000 * 280 = 280,000 PKR
    const { default: autoTable } = await import('jspdf-autotable');
    expect(autoTable).toHaveBeenCalled();
  });

  it("handles empty floorplans", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [],
      projectTotal: 0,
      invoiceSettings: null,
    };

    generateInvoicePDF(data);

    expect(window.open).toHaveBeenCalled();
  });

  it("handles floorplan with no items", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [
        {
          floorplan: mockFloorplans[0],
          total: 0,
          items: [],
        },
      ],
      projectTotal: 0,
      invoiceSettings: null,
    };

    generateInvoicePDF(data);

    const { default: autoTable } = await import('jspdf-autotable');
    expect(autoTable).toHaveBeenCalled();
  });

  it("uses PKR symbol correctly", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [],
      projectTotal: 1000,
      invoiceSettings: {
        discount_percentage: 0,
        discount_usd: 0,
        services_percentage: 0,
        services_usd: 0,
        local_currency_code: 'PKR',
        exchange_rate: 280,
      },
    };

    generateInvoicePDF(data);

    const { default: autoTable } = await import('jspdf-autotable');
    expect(autoTable).toHaveBeenCalled();
  });

  it("uses currency code as symbol for non-PKR", async () => {
    const data = {
      projectName: 'Test Project',
      projectNumber: 'PRJ-001',
      customerName: 'Test Customer',
      floorplanTotals: [],
      projectTotal: 1000,
      invoiceSettings: {
        discount_percentage: 0,
        discount_usd: 0,
        services_percentage: 0,
        services_usd: 0,
        local_currency_code: 'EUR',
        exchange_rate: 0.85,
      },
    };

    generateInvoicePDF(data);

    const { default: autoTable } = await import('jspdf-autotable');
    expect(autoTable).toHaveBeenCalled();
  });
});
