import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportFloorplanImage } from '../floorplan-export';
import type { Floorplan } from '../floorplan';
import type { Placement } from '../placement';
import type { Item } from '../item';
import { itemService } from '../item';

// Mock the item service
vi.mock('../item', () => ({
  itemService: {
    getImageUrl: vi.fn((path: string) => `/uploads/${path}`),
  },
}));

describe('exportFloorplanImage', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockCtx: CanvasRenderingContext2D;
  let mockLink: HTMLAnchorElement;
  let createdElements: HTMLElement[] = [];

  beforeEach(() => {
    // Mock canvas and context
    mockCtx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    } as unknown as HTMLCanvasElement;

    // Mock Image constructor
    global.Image = class MockImage {
      crossOrigin: string = '';
      src: string = '';
      naturalWidth: number = 1000;
      naturalHeight: number = 800;
      
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
      
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    } as unknown as typeof Image;

    // Mock document.createElement
    createdElements = [];
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas;
      }
      if (tagName === 'a') {
        mockLink = {
          href: '',
          download: '',
          click: vi.fn(),
        } as unknown as HTMLAnchorElement;
        return mockLink;
      }
      const el = document.createElement(tagName);
      createdElements.push(el);
      return el;
    });

    // Mock document.body.appendChild and removeChild
    vi.spyOn(document.body, 'appendChild').mockImplementation((child) => child);
    vi.spyOn(document.body, 'removeChild').mockImplementation((child) => child);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFloorplan: Floorplan = {
    id: 1,
    project_id: 1,
    name: 'Test Floorplan',
    image_path: 'floorplans/test.jpg',
    sort_order: 0,
  };

  const mockPlacement: Placement = {
    id: 1,
    bom_id: 1,
    floorplan_id: 1,
    item_id: 1,
    item_variant_id: 1,
    item_variant_image_path: 'items/test.png',
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    rotation: 0,
    created_at: '2024-01-01',
  };

  const mockItem: Item = {
    id: 1,
    name: 'Test Item',
    category_id: 1,
    category_name: 'Test Category',
    is_active: true,
    created_at: '2024-01-01',
    variants: [
      {
        id: 1,
        item_id: 1,
        name: 'Default',
        price: 100,
        image_path: 'items/test.png',
        is_active: true,
        created_at: '2024-01-01',
      },
    ],
  };

  it('should create canvas with floorplan dimensions', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem]);

    expect(mockCanvas.width).toBe(1000);
    expect(mockCanvas.height).toBe(800);
  });

  it('should draw floorplan image on canvas', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem]);

    expect(mockCtx.drawImage).toHaveBeenCalledWith(
      expect.any(Object),
      0,
      0,
      1000,
      800
    );
  });

  it('should draw placement with correct position and rotation', async () => {
    const placementWithRotation: Placement = {
      ...mockPlacement,
      rotation: 45,
    };

    await exportFloorplanImage(mockFloorplan, [placementWithRotation], [mockItem]);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.translate).toHaveBeenCalledWith(125, 125); // x + width/2, y + height/2
    expect(mockCtx.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('should draw placement border with rounded corners', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem]);

    expect(mockCtx.strokeStyle).toBe('#8C00AA');
    expect(mockCtx.lineWidth).toBe(2);
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('should use item preview image when no variant image exists', async () => {
    const itemWithPreview: Item = {
      ...mockItem,
      preview_image: 'items/preview.png',
      variants: [
        {
          ...mockItem.variants![0],
          image_path: undefined as unknown as string,
        },
      ],
    };

    const placementWithoutImagePath: Placement = {
      ...mockPlacement,
      item_variant_image_path: undefined,
    };

    await exportFloorplanImage(mockFloorplan, [placementWithoutImagePath], [itemWithPreview]);

    expect(itemService.getImageUrl).toHaveBeenCalledWith('items/preview.png');
  });

  it('should draw placeholder for placements without images', async () => {
    const itemWithoutImages: Item = {
      ...mockItem,
      preview_image: undefined,
      variants: [],
    };

    const placementWithoutImage: Placement = {
      ...mockPlacement,
      item_variant_image_path: undefined,
    };

    await exportFloorplanImage(mockFloorplan, [placementWithoutImage], [itemWithoutImages]);

    expect(mockCtx.fillStyle).toBe('#f3f4f6');
    expect(mockCtx.fill).toHaveBeenCalled();
  });

  it('should handle multiple placements', async () => {
    const placements: Placement[] = [
      mockPlacement,
      {
        ...mockPlacement,
        id: 2,
        x: 200,
        y: 200,
      },
    ];

    await exportFloorplanImage(mockFloorplan, placements, [mockItem]);

    // Should draw both placements (2 floorplan draws + 2 placement draws)
    const drawImageCalls = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCtx.drawImage as any).mock.calls;
    expect(drawImageCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('should export as PNG and trigger download', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem]);

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png', 0.92);
    expect(mockLink.download).toBe('Test_Floorplan_floorplan.png');
    expect(mockLink.href).toBe('data:image/png;base64,test');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('should sanitize floorplan name in filename', async () => {
    const floorplanWithSpecialChars: Floorplan = {
      ...mockFloorplan,
      name: 'Floor Plan @ Home!',
    };

    await exportFloorplanImage(floorplanWithSpecialChars, [mockPlacement], [mockItem]);

    expect(mockLink.download).toBe('Floor_Plan___Home__floorplan.png');
  });

  it('should apply background color when specified', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem], {
      backgroundColor: '#ffffff',
    });

    expect(mockCtx.fillStyle).toBe('#ffffff');
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 800);
  });

  it('should continue drawing other placements when one fails', async () => {
    // Track which images are created and make the 3rd one fail (2nd placement)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    let imageIndex = 0;
    global.Image = class MockImage {
      crossOrigin: string = '';
      src: string = '';
      naturalWidth: number = 1000;
      naturalHeight: number = 800;
      
      constructor() {
        const currentIndex = ++imageIndex;
        setTimeout(() => {
          // Image loads: 1=floorplan, 2=placement1, 3=placement2 (should fail)
          if (currentIndex === 3) {
            if (this.onerror) this.onerror();
          } else {
            if (this.onload) this.onload();
          }
        }, 0);
      }
      
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    } as unknown as typeof Image;

    const failingPlacement: Placement = {
      ...mockPlacement,
      id: 2,
      x: 200,
      y: 200,
      item_variant_image_path: 'invalid/image.png',
    };

    await exportFloorplanImage(mockFloorplan, [mockPlacement, failingPlacement], [mockItem]);

    // Should have warned about the failing placement
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warningCall = consoleWarnSpy.mock.calls.find(call => 
      typeof call[0] === 'string' && call[0].includes('Failed to draw placement')
    );
    expect(warningCall).toBeDefined();
    expect(warningCall![0]).toContain('Failed to draw placement');

    consoleWarnSpy.mockRestore();
  });

  it('should use custom quality when specified', async () => {
    await exportFloorplanImage(mockFloorplan, [mockPlacement], [mockItem], {
      quality: 1.0,
    });

    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png', 1.0);
  });

  describe('Layer Visibility Filtering', () => {
    it('should filter placements by visible categories', async () => {
      const mockItemCategory1: Item = {
        ...mockItem,
        id: 1,
        category_id: 1,
      };

      const mockItemCategory2: Item = {
        ...mockItem,
        id: 2,
        category_id: 2,
      };

      const placementCategory1: Placement = {
        ...mockPlacement,
        id: 1,
        item_id: 1,
      };

      const placementCategory2: Placement = {
        ...mockPlacement,
        id: 2,
        item_id: 2,
        x: 200,
        y: 200,
      };

      const visibleCategoryIds = new Set([1]); // Only category 1 visible

      await exportFloorplanImage(
        mockFloorplan,
        [placementCategory1, placementCategory2],
        [mockItemCategory1, mockItemCategory2],
        {},
        visibleCategoryIds
      );

      // Should only draw one placement (category 1)
      const drawImageCalls = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCtx.drawImage as any).mock.calls;
      // 1 floorplan + 1 placement from visible category
      expect(drawImageCalls.length).toBe(2);
    });

    it('should include all placements when visibleCategoryIds is not provided', async () => {
      const placement1: Placement = {
        ...mockPlacement,
        id: 1,
      };

      const placement2: Placement = {
        ...mockPlacement,
        id: 2,
        x: 200,
        y: 200,
      };

      await exportFloorplanImage(mockFloorplan, [placement1, placement2], [mockItem]);

      // Should draw both placements
      const drawImageCalls = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCtx.drawImage as any).mock.calls;
      expect(drawImageCalls.length).toBeGreaterThanOrEqual(3); // floorplan + 2 placements
    });

    it('should include placements with unknown items when filtering', async () => {
      const placementWithUnknownItem: Placement = {
        ...mockPlacement,
        id: 1,
        item_id: 999, // Unknown item ID
      };

      const visibleCategoryIds = new Set([1, 2]);

      await exportFloorplanImage(
        mockFloorplan,
        [placementWithUnknownItem],
        [mockItem], // mockItem has id 1, not 999
        {},
        visibleCategoryIds
      );

      // Should draw the placement even though item is not found (shown by default)
      const drawImageCalls = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCtx.drawImage as any).mock.calls;
      expect(drawImageCalls.length).toBeGreaterThanOrEqual(2); // floorplan + placement
    });

    it('should exclude placements from hidden categories', async () => {
      const items: Item[] = [
        { ...mockItem, id: 1, category_id: 1 },
        { ...mockItem, id: 2, category_id: 2 },
        { ...mockItem, id: 3, category_id: 3 },
      ];

      const placements: Placement[] = [
        { ...mockPlacement, id: 1, item_id: 1 },
        { ...mockPlacement, id: 2, item_id: 2 },
        { ...mockPlacement, id: 3, item_id: 3 },
      ];

      const visibleCategoryIds = new Set([1, 3]); // Hide category 2

      await exportFloorplanImage(
        mockFloorplan,
        placements,
        items,
        {},
        visibleCategoryIds
      );

      // Should draw floorplan + 2 placements (categories 1 and 3)
      const drawImageCalls = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCtx.drawImage as any).mock.calls;
      expect(drawImageCalls.length).toBe(3);
    });
  });
});
