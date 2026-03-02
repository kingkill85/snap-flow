import type { Floorplan } from './floorplan';
import type { Placement } from './placement';
import type { Item } from './item';
import { itemService } from './item';

interface ExportOptions {
  quality?: number;
  backgroundColor?: string;
}

const EXPORT_CONFIG = {
  DEFAULT_QUALITY: 0.92,
  BORDER_RADIUS: 4,
  BORDER_WIDTH: 2,
  IMAGE_LOAD_TIMEOUT: 10000,
  FILENAME_SANITIZE_REGEX: /[^a-zA-Z0-9-_]/g,
} as const;

/**
 * Gets a color from CSS custom properties.
 * Falls back to provided default if CSS variable is not available.
 */
function getThemeColor(cssVar: string, defaultColor: string): string {
  if (typeof document === 'undefined') {
    return defaultColor;
  }
  const root = document.documentElement;
  const hslValue = getComputedStyle(root).getPropertyValue(cssVar).trim();
  if (!hslValue) {
    return defaultColor;
  }
  const [h, s, l] = hslValue.split(' ').map(v => parseFloat(v));
  return hslToHex(h, s, l);
}

/**
 * Gets the current theme primary color.
 */
function getPrimaryColor(): string {
  return getThemeColor('--primary', '#8C00AA');
}

/**
 * Gets the current theme secondary/muted background color for placeholders.
 */
function getPlaceholderBgColor(): string {
  return getThemeColor('--muted', '#f3f4f6');
}

/**
 * Gets the current theme border color for placeholder borders.
 */
function getPlaceholderBorderColor(): string {
  return getThemeColor('--border', '#9ca3af');
}

/**
 * Converts HSL values to hex color string.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sPercent = s / 100;
  const lPercent = l / 100;
  const c = (1 - Math.abs(2 * lPercent - 1)) * sPercent;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lPercent - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ImageLoadOptions {
  timeout?: number;
  crossOrigin?: string;
}

/**
 * Exports a floorplan with placements as a PNG image.
 *
 * @param floorplan - The floorplan to export
 * @param placements - Array of placements to draw on the floorplan
 * @param items - Array of items with variant data for placement images
 * @param options - Export configuration options
 * @param options.quality - PNG compression quality (0-1), defaults to 0.92
 * @param options.backgroundColor - Optional background color to fill before drawing floorplan
 * @param visibleCategoryIds - Optional set of category IDs to filter placements
 * @returns Promise that resolves when download is triggered
 * @throws Error if canvas context cannot be obtained or image loading fails
 */
export async function exportFloorplanImage(
  floorplan: Floorplan,
  placements: Placement[],
  items: Item[],
  options: ExportOptions = {},
  visibleCategoryIds?: Set<number>
): Promise<void> {
  const { quality = EXPORT_CONFIG.DEFAULT_QUALITY, backgroundColor } = options;

  const floorplanImage = await loadImage(`/uploads/${floorplan.image_path}`, {
    timeout: EXPORT_CONFIG.IMAGE_LOAD_TIMEOUT,
  });
  const canvasWidth = floorplanImage.naturalWidth;
  const canvasHeight = floorplanImage.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.drawImage(floorplanImage, 0, 0, canvasWidth, canvasHeight);

  // Filter placements by visible categories
  const filteredPlacements = visibleCategoryIds
    ? placements.filter(placement => {
        const item = items.find(i => i.id === placement.item_id);
        if (!item) return true;
        return visibleCategoryIds.has(item.category_id);
      })
    : placements;

  for (const placement of filteredPlacements) {
    try {
      await drawPlacement(ctx, placement, items);
    } catch (err) {
      console.warn(`Failed to draw placement ${placement.id}:`, err);
    }
  }

  const dataUrl = canvas.toDataURL('image/png', quality);

  const link = document.createElement('a');
  link.download = `${floorplan.name.replace(EXPORT_CONFIG.FILENAME_SANITIZE_REGEX, '_')}_floorplan.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function drawPlacement(
  ctx: CanvasRenderingContext2D,
  placement: Placement,
  items: Item[]
): Promise<void> {
  const item = items.find(i => i.id === placement.item_id);
  const variant = item?.variants?.find(v => v.id === placement.item_variant_id);

  const imagePath = placement.item_variant_image_path
    ?? variant?.image_path
    ?? item?.preview_image
    ?? null;

  if (!imagePath) {
    drawPlaceholder(ctx, placement);
    return;
  }

  const imageUrl = itemService.getImageUrl(imagePath);
  if (!imageUrl) {
    drawPlaceholder(ctx, placement);
    return;
  }

  try {
    const image = await loadImage(imageUrl, { timeout: EXPORT_CONFIG.IMAGE_LOAD_TIMEOUT });
    drawPlacementImage(ctx, placement, image);
  } catch {
    drawPlaceholder(ctx, placement);
  }
}

function drawPlacementImage(
  ctx: CanvasRenderingContext2D,
  placement: Placement,
  image: HTMLImageElement
): void {
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((placement.rotation * Math.PI) / 180);

  ctx.drawImage(
    image,
    -placement.width / 2,
    -placement.height / 2,
    placement.width,
    placement.height
  );

  drawRoundedRect(
    ctx,
    -placement.width / 2,
    -placement.height / 2,
    placement.width,
    placement.height,
    EXPORT_CONFIG.BORDER_RADIUS,
    { stroke: getPrimaryColor(), lineWidth: EXPORT_CONFIG.BORDER_WIDTH }
  );

  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, placement: Placement): void {
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;
  const halfWidth = placement.width / 2;
  const halfHeight = placement.height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((placement.rotation * Math.PI) / 180);

  drawRoundedRect(
    ctx,
    -halfWidth,
    -halfHeight,
    placement.width,
    placement.height,
    EXPORT_CONFIG.BORDER_RADIUS,
    {
      fill: getPlaceholderBgColor(),
      stroke: getPlaceholderBorderColor(),
      lineWidth: EXPORT_CONFIG.BORDER_WIDTH,
    }
  );

  ctx.restore();
}

interface RoundedRectOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  options?: RoundedRectOptions
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (options?.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }

  if (options?.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth ?? EXPORT_CONFIG.BORDER_WIDTH;
    ctx.stroke();
  }
}

function loadImage(src: string, options: ImageLoadOptions = {}): Promise<HTMLImageElement> {
  const { timeout = EXPORT_CONFIG.IMAGE_LOAD_TIMEOUT, crossOrigin = 'anonymous' } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = crossOrigin;

    const timeoutId = setTimeout(() => {
      reject(new Error(`Image load timeout: ${src}`));
    }, timeout);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load image: ${src}`));
    };

    img.src = src;
  });
}
