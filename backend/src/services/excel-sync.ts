import * as xlsx from 'xlsx';
import { itemRepository } from '../repositories/item.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { categoryRepository } from '../repositories/category.ts';
import { fileStorageService } from './file-storage.ts';
import type { Item, ItemVariant } from '../models/index.ts';
import { env } from '../config/env.ts';

/**
 * Excel Catalog Sync Service
 * Syncs categories, items, and variants from Excel
 * - Excel is the source of truth
 * - Items/variants not in Excel are deactivated (not deleted)
 * - Images are extracted and associated with variants
 */

// Progress callback type for SSE
export type ProgressCallback = (message: string, phase: SyncPhase, progress?: number) => void;

export type SyncPhase = 'parsing' | 'categories' | 'items' | 'variants' | 'complete' | 'error';

export interface SyncResult {
  success: boolean;
  phases: {
    categories: {
      added: number;
      activated: number;
      deactivated: number;
      total: number;
    };
    items: {
      added: number;
      updated: number;
      deactivated: number;
      total: number;
    };
    variants: {
      added: number;
      updated: number;
      deactivated: number;
      imagesExtracted: number;
      total: number;
    };
  };
  log: string[];
  errors: Array<{
    row: number;
    message: string;
    details?: string;
  }>;
}

export interface ExcelRowData {
  rowNumber: number;
  category: string;
  itemName: string;
  description: string;
  modelNumber: string;
  dimensions: string;
  style: string;
  price: number;
  addOns: string[];
  imageAnchor: { row: number; col: number } | null;
}

export interface GroupedItem {
  baseModelNumber: string;
  name: string;
  category: string;
  description: string;
  dimensions: string;
  variants: Array<{
    rowNumber: number;
    style: string;
    price: number;
    imageAnchor: { row: number; col: number } | null;
  }>;
}

export class ExcelSyncService {
  private progressCallback: ProgressCallback | null = null;

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  private log(result: SyncResult, message: string, phase: SyncPhase = 'parsing') {
    result.log.push(message);
    if (this.progressCallback) {
      this.progressCallback(message, phase);
    }
  }

  /**
   * Main sync method - orchestrates all phases
   */
  async syncCatalog(excelPath: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      phases: {
        categories: { added: 0, activated: 0, deactivated: 0, total: 0 },
        items: { added: 0, updated: 0, deactivated: 0, total: 0 },
        variants: { added: 0, updated: 0, deactivated: 0, imagesExtracted: 0, total: 0 },
      },
      log: [],
      errors: [],
    };

    try {
      // Phase 0: Parse Excel
      this.log(result, '📖 Parsing Excel file...', 'parsing');
      const groupedItems = await this.parseAndGroupExcel(excelPath);
      const extractedImages = await this.extractImages(excelPath);
      
      this.log(result, `✓ Found ${Object.keys(groupedItems).length} unique items with ${Object.values(groupedItems).reduce((acc, item) => acc + item.variants.length, 0)} variants`, 'parsing');
      this.log(result, `✓ Extracted ${extractedImages.size} images`, 'parsing');

      // Phase 1: Sync Categories
      await this.syncCategories(groupedItems, result);

      // Phase 2: Sync Base Items
      const itemIdMap = await this.syncItems(groupedItems, result);

      // Phase 3: Sync Variants with Images
      await this.syncVariants(groupedItems, itemIdMap, extractedImages, result);

      this.log(result, '✅ Sync completed successfully!', 'complete');

    } catch (error) {
      result.success = false;
      const errorMsg = `Fatal error: ${error instanceof Error ? error.message : String(error)}`;
      this.log(result, `❌ ${errorMsg}`, 'error');
      result.errors.push({ row: 0, message: errorMsg });
    }

    return result;
  }

  /**
   * Parse Excel and group by base model number
   */
  private async parseAndGroupExcel(excelPath: string): Promise<Record<string, GroupedItem>> {
    // Convert relative path to full path
    const uploadDir = env.UPLOAD_DIR || './uploads';
    const fullPath = `${uploadDir}/${excelPath}`;
    
    // Read file as bytes for Deno compatibility
    const fileData = await Deno.readFile(fullPath);
    const workbook = xlsx.read(fileData, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Convert to array starting at row 4 (0-indexed: row 3) to skip headers
    // Headers are in row 3 (1-indexed), data starts at row 4 (1-indexed)
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 3 }) as any[][];
    
    const groupedItems: Record<string, GroupedItem> = {};

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 4; // Excel row number (data starts at row 4)

      // Skip empty rows
      if (!row || row.length < 9) continue;

      const parsedRow = this.parseRow(row, rowNumber);
      
      // Skip rows without required fields
      if (!parsedRow.modelNumber || !parsedRow.itemName) continue;

      const baseModel = parsedRow.modelNumber;

      // Get or create grouped item
      if (!groupedItems[baseModel]) {
        groupedItems[baseModel] = {
          baseModelNumber: baseModel,
          name: parsedRow.itemName,
          category: parsedRow.category,
          description: parsedRow.description,
          dimensions: parsedRow.dimensions,
          variants: [],
        };
      }

      // Add variant
      groupedItems[baseModel].variants.push({
        rowNumber: parsedRow.rowNumber,
        style: parsedRow.style,
        price: parsedRow.price,
        imageAnchor: parsedRow.imageAnchor,
      });
    }

    return groupedItems;
  }

  /**
   * Parse a single row from Excel data
   * Note: When using range: 3, columns shift left by 1 (B becomes index 0)
   */
  private parseRow(row: any[], rowNumber: number): ExcelRowData {
    // Column mapping with range: 3 (data shifted left):
    // Index 0 = Column B (Category)
    // Index 3 = Column E (ItemName)
    // Index 4 = Column F (Description)
    // Index 5 = Column G (Model)
    // Index 6 = Column H (Dimensions)
    // Index 7 = Column I (Style)
    // Index 9 = Column K (Price)
    
    const price = row[9]; // Price at index 9
    const priceValue = typeof price === 'number' ? price : 
                       typeof price === 'string' ? parseFloat(price) : 0;

    return {
      rowNumber,
      category: String(row[0] || '').trim(), // Category at index 0
      itemName: String(row[3] || '').trim(), // ItemName at index 3
      description: String(row[4] || '').trim(), // Description at index 4
      modelNumber: String(row[5] || '').trim(), // Model at index 5
      dimensions: String(row[6] || '').trim(), // Dimensions at index 6
      style: String(row[7] || '').trim(), // Style at index 7
      price: isNaN(priceValue) ? 0 : priceValue,
      addOns: [
        String(row[10] || '').trim(), // M
        String(row[11] || '').trim(), // N
        String(row[12] || '').trim(), // O
        String(row[14] || '').trim(), // Q
        String(row[15] || '').trim(), // R
        String(row[16] || '').trim(), // S
        String(row[17] || '').trim(), // T
        String(row[18] || '').trim(), // U
      ].filter(a => a),
      imageAnchor: { row: rowNumber - 1, col: 2 }, // Column D becomes index 2
    };
  }

  /**
   * Extract embedded images from Excel
   * Returns map of row number -> image filename
   */
  private async extractImages(excelPath: string): Promise<Map<number, string>> {
    const imageMap = new Map<number, string>();
    
    try {
      // Read Excel as ZIP to extract images
      const extractedDir = await this.extractExcelAsZip(excelPath);
      
      // Parse drawing.xml to find image positions
      const drawingPath = `${extractedDir}/xl/drawings/drawing1.xml`;
      const drawingXml = await Deno.readTextFile(drawingPath);
      
      // Parse relationships to get image filenames
      const relsPath = `${extractedDir}/xl/drawings/_rels/drawing1.xml.rels`;
      const relsXml = await Deno.readTextFile(relsPath);
      
      // Build rId -> filename mapping
      const rIdToFilename = new Map<string, string>();
      const relMatches = relsXml.matchAll(/<Relationship Id="([^"]+)"[^>]*Target="([^"]+)"/g);
      for (const match of relMatches) {
        const filename = match[2].split('/').pop();
        if (filename) {
          rIdToFilename.set(match[1], filename);
        }
      }

      // Parse anchors to find row positions
      const anchorMatches = drawingXml.matchAll(/<xdr:twoCellAnchor[^>]*>(.*?)<\/xdr:twoCellAnchor>/gs);
      
      for (const anchorMatch of anchorMatches) {
        const anchor = anchorMatch[1];
        
        // Extract row from <xdr:from> section
        const fromMatch = anchor.match(/<xdr:from>.*?<xdr:row>(\d+)<\/xdr:row>.*?<\/xdr:from>/s);
        const blipMatch = anchor.match(/<a:blip[^>]*r:embed="([^"]+)"/);
        
        if (fromMatch && blipMatch) {
          const rowIndex = parseInt(fromMatch[1]) + 1; // Convert to 1-indexed row number
          const rId = blipMatch[1];
          const filename = rIdToFilename.get(rId);
          
          if (filename) {
            imageMap.set(rowIndex, filename);
          }
        }
      }

      // Copy images to uploads directory
      const uploadsDir = './uploads/items/excel-import';
      await Deno.mkdir(uploadsDir, { recursive: true });
      
      for (const [rowNum, filename] of imageMap) {
        const sourcePath = `${extractedDir}/xl/media/${filename}`;
        const targetPath = `${uploadsDir}/${filename}`;
        
        try {
          const imageData = await Deno.readFile(sourcePath);
          await Deno.writeFile(targetPath, imageData);
        } catch (e) {
          console.error(`Failed to copy image ${filename}:`, e);
        }
      }

      // Cleanup temp directory
      await Deno.remove(extractedDir, { recursive: true });

    } catch (error) {
      console.error('Failed to extract images:', error);
    }

    return imageMap;
  }

  /**
   * Extract Excel file as ZIP
   */
  private async extractExcelAsZip(excelPath: string): Promise<string> {
    const tempDir = `/tmp/excel-sync-${Date.now()}`;
    await Deno.mkdir(tempDir, { recursive: true });
    
    // Convert relative path to full path for unzip command
    const uploadDir = env.UPLOAD_DIR || './uploads';
    const fullPath = `${uploadDir}/${excelPath}`;
    
    // Use unzip command
    const command = new Deno.Command('unzip', {
      args: ['-q', fullPath, '-d', tempDir],
    });
    
    const result = await command.output();
    
    if (!result.success) {
      throw new Error('Failed to extract Excel file');
    }

    return tempDir;
  }

  /**
   * Phase 1: Sync Categories
   * - Create new categories from Excel
   * - Activate categories that exist in Excel
   * - Deactivate categories not in Excel
   */
  private async syncCategories(
    groupedItems: Record<string, GroupedItem>,
    result: SyncResult
  ): Promise<void> {
    this.log(result, '📂 Phase 1: Syncing categories...', 'categories');

    // Get unique categories from Excel
    const excelCategories = new Set<string>();
    Object.values(groupedItems).forEach(item => {
      if (item.category) {
        excelCategories.add(item.category);
      }
    });

    // Get existing categories from DB
    const dbCategories = await categoryRepository.findAll();
    const dbCategoryMap = new Map(dbCategories.map(c => [c.name.toLowerCase(), c]));

    // Activate/Create Excel categories
    for (const categoryName of excelCategories) {
      const existing = dbCategoryMap.get(categoryName.toLowerCase());
      
      if (existing) {
        if (!existing.is_active) {
          // Reactivate
          await categoryRepository.activate(existing.id);
          result.phases.categories.activated++;
          this.log(result, `  ✓ Activated category: ${categoryName}`, 'categories');
        }
      } else {
        // Create new
        await categoryRepository.create({ name: categoryName });
        result.phases.categories.added++;
        this.log(result, `  ✓ Created category: ${categoryName}`, 'categories');
      }
    }

    // Deactivate categories not in Excel
    for (const dbCat of dbCategories) {
      if (!excelCategories.has(dbCat.name) && dbCat.is_active) {
        await categoryRepository.deactivate(dbCat.id);
        result.phases.categories.deactivated++;
        this.log(result, `  ✗ Deactivated category: ${dbCat.name}`, 'categories');
      }
    }

    result.phases.categories.total = excelCategories.size;
    this.log(result, `✓ Categories synced: ${result.phases.categories.added} added, ${result.phases.categories.activated} activated, ${result.phases.categories.deactivated} deactivated`, 'categories');
  }

  /**
   * Phase 2: Sync Base Items
   * - Create new items from Excel
   * - Update existing items
   * - Deactivate items not in Excel
   */
  private async syncItems(
    groupedItems: Record<string, GroupedItem>,
    result: SyncResult
  ): Promise<Map<string, number>> {
    this.log(result, '📦 Phase 2: Syncing base items...', 'items');

    const itemIdMap = new Map<string, number>();
    const excelModelNumbers = new Set(Object.keys(groupedItems));

    // Get all existing items
    const allItems = await itemRepository.findAll({}, { page: 1, limit: 10000 });
    const existingItemsMap = new Map<string, typeof allItems.items[0]>();
    
    for (const item of allItems.items) {
      if (item.base_model_number) {
        existingItemsMap.set(item.base_model_number, item);
      }
    }

    // Sync Excel items
    for (const [baseModel, groupedItem] of Object.entries(groupedItems)) {
      try {
        // Find category
        const category = await categoryRepository.findByName(groupedItem.category);
        const categoryId = category?.id;

        if (!categoryId) {
          result.errors.push({
            row: groupedItem.variants[0]?.rowNumber || 0,
            message: `Category not found: ${groupedItem.category}`,
          });
          continue;
        }

        const existingItem = existingItemsMap.get(baseModel);

        if (existingItem) {
          // Update existing
          await itemRepository.update(existingItem.id, {
            category_id: categoryId,
            name: groupedItem.name,
            description: groupedItem.description,
            dimensions: groupedItem.dimensions,
            is_active: true,
          });
          result.phases.items.updated++;
          this.log(result, `  ✓ Updated item: ${groupedItem.name} (${baseModel})`, 'items');
          itemIdMap.set(baseModel, existingItem.id);
        } else {
          // Create new
          const newItem = await itemRepository.create({
            category_id: categoryId,
            name: groupedItem.name,
            description: groupedItem.description,
            base_model_number: baseModel,
            dimensions: groupedItem.dimensions,
          });
          result.phases.items.added++;
          this.log(result, `  ✓ Created item: ${groupedItem.name} (${baseModel})`, 'items');
          itemIdMap.set(baseModel, newItem.id);
        }
      } catch (error) {
        result.errors.push({
          row: groupedItem.variants[0]?.rowNumber || 0,
          message: `Failed to sync item ${groupedItem.name}`,
          details: String(error),
        });
      }
    }

    // Deactivate items not in Excel
    for (const [baseModel, item] of existingItemsMap) {
      if (!excelModelNumbers.has(baseModel) && item.is_active) {
        try {
          await itemRepository.deactivate(item.id);
          result.phases.items.deactivated++;
          this.log(result, `  ✗ Deactivated item: ${item.name} (${baseModel})`, 'items');
        } catch (error) {
          result.errors.push({
            row: 0,
            message: `Failed to deactivate item ${item.name}`,
            details: String(error),
          });
        }
      }
    }

    result.phases.items.total = excelModelNumbers.size;
    this.log(result, `✓ Items synced: ${result.phases.items.added} added, ${result.phases.items.updated} updated, ${result.phases.items.deactivated} deactivated`, 'items');

    return itemIdMap;
  }

  /**
   * Phase 3: Sync Variants with Images
   * - Create/update variants
   * - Associate extracted images
   * - Deactivate variants not in Excel
   */
  private async syncVariants(
    groupedItems: Record<string, GroupedItem>,
    itemIdMap: Map<string, number>,
    extractedImages: Map<number, string>,
    result: SyncResult
  ): Promise<void> {
    this.log(result, '🎨 Phase 3: Syncing variants with images...', 'variants');

    // Track which variants exist in Excel for deactivation
    const excelVariantKeys = new Set<string>(); // format: "itemId:styleName"
    const excelRowNumbers = new Set<number>();

    // First pass: Create/update variants
    for (const [baseModel, groupedItem] of Object.entries(groupedItems)) {
      const itemId = itemIdMap.get(baseModel);
      if (!itemId) continue;

      // Get existing variants for this item
      const existingVariants = await itemVariantRepository.findByItemId(itemId, true);
      const existingVariantMap = new Map(existingVariants.map(v => [v.style_name.toLowerCase(), v]));

      for (const variant of groupedItem.variants) {
        const variantKey = `${itemId}:${variant.style.toLowerCase()}`;
        excelVariantKeys.add(variantKey);
        excelRowNumbers.add(variant.rowNumber);

        try {
          // Get image for this variant
          let imagePath: string | null = null;
          const imageFilename = extractedImages.get(variant.rowNumber);
          if (imageFilename) {
            imagePath = `items/excel-import/${imageFilename}`;
            result.phases.variants.imagesExtracted++;
          }

          const existingVariant = existingVariantMap.get(variant.style.toLowerCase());

          if (existingVariant) {
            // Update existing variant
            await itemVariantRepository.update(existingVariant.id, {
              price: variant.price,
              is_active: true,
              ...(imagePath && { image_path: imagePath }),
            });
            result.phases.variants.updated++;
            this.log(result, `  ✓ Updated variant: ${variant.style} ($${variant.price})`, 'variants');
          } else {
            // Create new variant
            await itemVariantRepository.create({
              item_id: itemId,
              style_name: variant.style,
              price: variant.price,
              ...(imagePath ? { image_path: imagePath } : {}),
            });
            result.phases.variants.added++;
            this.log(result, `  ✓ Created variant: ${variant.style} ($${variant.price})`, 'variants');
          }
        } catch (error) {
          result.errors.push({
            row: variant.rowNumber,
            message: `Failed to sync variant ${variant.style}`,
            details: String(error),
          });
        }
      }
    }

    // Second pass: Deactivate variants not in Excel
    for (const [baseModel, groupedItem] of Object.entries(groupedItems)) {
      const itemId = itemIdMap.get(baseModel);
      if (!itemId) continue;

      const allVariants = await itemVariantRepository.findByItemId(itemId, true);
      
      for (const variant of allVariants) {
        const variantKey = `${itemId}:${variant.style_name.toLowerCase()}`;
        
        if (!excelVariantKeys.has(variantKey) && variant.is_active) {
          try {
            await itemVariantRepository.deactivate(variant.id);
            result.phases.variants.deactivated++;
            this.log(result, `  ✗ Deactivated variant: ${variant.style_name} (item: ${baseModel})`, 'variants');
          } catch (error) {
            result.errors.push({
              row: 0,
              message: `Failed to deactivate variant ${variant.style_name}`,
              details: String(error),
            });
          }
        }
      }
    }

    result.phases.variants.total = excelVariantKeys.size;
    this.log(result, `✓ Variants synced: ${result.phases.variants.added} added, ${result.phases.variants.updated} updated, ${result.phases.variants.deactivated} deactivated, ${result.phases.variants.imagesExtracted} images`, 'variants');
  }
}

export const excelSyncService = new ExcelSyncService();
