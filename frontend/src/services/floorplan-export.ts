import type { Floorplan } from './floorplan';
import type { Placement } from './placement';
import type { Item } from './item';
import { itemService } from './item';

interface ExportOptions {
  quality?: number;
  backgroundColor?: string;
}

export async function exportFloorplanImage(
  floorplan: Floorplan,
  placements: Placement[],
  items: Item[],
  options: ExportOptions = {},
  visibleCategoryIds?: Set<number>
): Promise<void> {
  const { quality = 0.92, backgroundColor } = options;

  const floorplanImage = await loadImage(`/uploads/${floorplan.image_path}`);
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
        if (!item) return true; // Include unknown items
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
  link.download = `${floorplan.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_floorplan.png`;
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
  const item = items.find((i) => i.id === placement.item_id);
  const variant = item?.variants?.find((v) => v.id === placement.item_variant_id);

  let imagePath: string | null = null;
  if (placement.item_variant_image_path) {
    imagePath = placement.item_variant_image_path;
  } else if (variant?.image_path) {
    imagePath = variant.image_path;
  } else if (item?.preview_image) {
    imagePath = item.preview_image;
  }

  if (!imagePath) {
    drawPlaceholder(ctx, placement);
    return;
  }

  const imageUrl = itemService.getImageUrl(imagePath);
  if (!imageUrl) {
    drawPlaceholder(ctx, placement);
    return;
  }
  const image = await loadImage(imageUrl);

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

  // Draw border with rounded corners (matching UI: border-2 border-primary rounded)
  ctx.strokeStyle = '#8C00AA'; // Primary purple color
  ctx.lineWidth = 2;
  const x = -placement.width / 2;
  const y = -placement.height / 2;
  const w = placement.width;
  const h = placement.height;
  const r = 4; // border-radius: 4px (matching rounded class)
  
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  placement: Placement
): void {
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((placement.rotation * Math.PI) / 180);

  const x = -placement.width / 2;
  const y = -placement.height / 2;
  const w = placement.width;
  const h = placement.height;
  const r = 4; // border-radius: 4px

  // Draw rounded rectangle fill
  ctx.fillStyle = '#f3f4f6';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Draw rounded border
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
