# Fix floorplan-export.ts Code Quality Issues

## Issues Identified

### 1. **Hardcoded Theme Values**
- Line 111: `ctx.strokeStyle = '#8C00AA'` - Primary purple hardcoded
- Lines 153, 168: Background colors hardcoded as hex values
- These should reference theme constants or be configurable

### 2. **Magic Numbers**
- Line 117, 150: Border radius `4` appears twice
- Lines 112, 169: Line width `2` appears twice  
- Line 19: Default quality `0.92`
- Should be defined as named constants

### 3. **Code Duplication**
Lines 119-130 and 155-170 have nearly identical rounded rectangle drawing logic:
```typescript
// Duplicated in both drawPlacement and drawPlaceholder:
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.lineTo(x + w - r, y);
ctx.quadraticCurveTo(x + w, y, x + w, y + r);
// ... etc
```
Should extract to `drawRoundedRect()` helper function.

### 4. **Missing Documentation**
- No JSDoc for exported function
- No explanation of parameters or return value
- Missing type documentation for `ExportOptions`

### 5. **Error Handling**
- Line 52: Generic console.warn for placement drawing errors
- No specific error types or recovery strategies
- Could provide better fallback behavior

### 6. **Type Safety**
- `visibleCategoryIds?: Set<number>` is unconventional
- Could accept array and convert internally
- Missing validation for options object

### 7. **Memory/Performance**
- No cleanup for failed image loads
- Could cache loaded images to avoid reloading
- Multiple sequential image loads could be parallelized

### 8. **Naming Conventions**
- `drawPlacement` is okay but could be more descriptive
- Variables like `r`, `w`, `h` are okay in small scope but borderline

## Proposed Changes

### File: `frontend/src/services/floorplan-export.ts`

#### 1. Add Constants Section
```typescript
// Export configuration constants
const EXPORT_CONFIG = {
  DEFAULT_QUALITY: 0.92,
  BORDER_RADIUS: 4,
  BORDER_WIDTH: 2,
  PLACEHOLDER_BG_COLOR: '#f3f4f6',
  PLACEHOLDER_BORDER_COLOR: '#9ca3af',
  PRIMARY_COLOR: '#8C00AA', // TODO: Get from theme
  MIME_TYPE: 'image/png',
  FILENAME_SANITIZE_REGEX: /[^a-zA-Z0-9-_]/g,
} as const;
```

#### 2. Extract Rounded Rectangle Function
```typescript
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  options?: {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
  }
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
```

#### 3. Add JSDoc
```typescript
/**
 * Exports a floorplan with placements as a PNG image.
 * 
 * @param floorplan - The floorplan to export
 * @param placements - Array of placements to draw on the floorplan
 * @param items - Array of items with variant data for placement images
 * @param options - Export configuration options
 * @param options.quality - JPEG quality (0-1), defaults to 0.92
 * @param options.backgroundColor - Optional background color to fill before drawing floorplan
 * @param visibleCategoryIds - Optional set of category IDs to filter placements
 * @returns Promise that resolves when download is triggered
 * @throws Error if canvas context cannot be obtained or image loading fails
 */
```

#### 4. Improve drawPlacement
```typescript
async function drawPlacement(
  ctx: CanvasRenderingContext2D,
  placement: Placement,
  items: Item[]
): Promise<void> {
  const item = items.find((i) => i.id === placement.item_id);
  const variant = item?.variants?.find((v) => v.id === placement.item_variant_id);

  // Determine image source with clear priority
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
    const image = await loadImage(imageUrl);
    drawPlacementImage(ctx, placement, image);
  } catch (error) {
    console.warn(`Failed to load image for placement ${placement.id}:`, error);
    drawPlaceholder(ctx, placement);
  }
}
```

#### 5. Extract drawPlacementImage
```typescript
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

  // Draw border using extracted function
  drawRoundedRect(
    ctx,
    -placement.width / 2,
    -placement.height / 2,
    placement.width,
    placement.height,
    EXPORT_CONFIG.BORDER_RADIUS,
    { stroke: EXPORT_CONFIG.PRIMARY_COLOR, lineWidth: EXPORT_CONFIG.BORDER_WIDTH }
  );

  ctx.restore();
}
```

#### 6. Refactor drawPlaceholder
```typescript
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  placement: Placement
): void {
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
      fill: EXPORT_CONFIG.PLACEHOLDER_BG_COLOR,
      stroke: EXPORT_CONFIG.PLACEHOLDER_BORDER_COLOR,
      lineWidth: EXPORT_CONFIG.BORDER_WIDTH,
    }
  );

  ctx.restore();
}
```

#### 7. Improve loadImage with Better Error Handling
```typescript
interface ImageLoadOptions {
  timeout?: number;
  crossOrigin?: string;
}

function loadImage(
  src: string, 
  options: ImageLoadOptions = {}
): Promise<HTMLImageElement> {
  const { timeout = 10000, crossOrigin = 'anonymous' } = options;
  
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
```

## Benefits

1. **Maintainability**: Constants make future changes easy
2. **DRY**: Single source of truth for rounded rect logic
3. **Documentation**: JSDoc helps IDE autocomplete and developers
4. **Error Handling**: Better fallback when images fail to load
5. **Type Safety**: Better TypeScript inference and validation
6. **Performance**: Timeout prevents hanging on slow image loads

## Verification

After changes:
1. Export still produces correct PNG files
2. Placements render with proper borders and rotation
3. Placeholders appear when images fail to load
4. No console errors during normal operation
5. TypeScript compilation passes
