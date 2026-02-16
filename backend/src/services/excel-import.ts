import * as xlsx from 'xlsx';
import { itemRepository } from '../repositories/item.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { categoryRepository } from '../repositories/category.ts';
import { fileStorageService } from './file-storage.ts';
import type { Item, ItemVariant } from '../models/index.ts';

/**
 * Excel Import Service
 * Handles parsing and importing items from Excel files
 */

export interface ExcelRow {
  rowNumber: number;
  category: string;
  itemName: string;
  description: string;
  modelNumber: string;
  dimensions: string;
  style: string;
  price: number | null;
  addon1: string;
  addon2: string;
  addon3: string;
  addon4: string;
}

export interface ImportPreviewItem {
  baseModelNumber: string;
  name: string;
  category: string;
  description: string;
  dimensions: string;
  variants: {
    style: string;
    price: number;
    imageFilename?: string;
  }[];
  addons: {
    slot: number;
    modelNumber: string;
    isRequired: boolean;
    found: boolean;
  }[];
  existingItemId: number | undefined;
  action: 'create' | 'update';
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value: string;
}

export interface ImportResult {
  success: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  addonsCreated: number;
  errors: ImportError[];
  warnings: string[];
}

export interface ImportPreview {
  items: ImportPreviewItem[];
  errors: ImportError[];
  warnings: string[];
  summary: {
    totalRows: number;
    itemsToCreate: number;
    itemsToUpdate: number;
  };
}

export class ExcelImportService {
  /**
   * Parse Excel file and return preview
   */
  async parseExcel(filePath: string): Promise<ImportPreview> {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const errors: ImportError[] = [];
    const warnings: string[] = [];
    const previewItems = new Map<string, ImportPreviewItem>();

    // Skip header row (row 0)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;

      // Skip empty rows
      if (!row || row.length === 0 || !row[3]) continue;

      const parsedRow = this.parseRow(row, rowNumber);
      
      // Validate row
      const rowErrors = this.validateRow(parsedRow, rowNumber);
      errors.push(...rowErrors);

      if (rowErrors.length > 0) continue;

      // Extract base model number
      const baseModel = this.extractBaseModelNumber(parsedRow.modelNumber);
      
      // Get or create preview item
      let previewItem = previewItems.get(baseModel);
      
      if (!previewItem) {
        // Check if item exists in database
        const existingItem = await itemRepository.findByBaseModelNumber(baseModel);
        
        const newPreviewItem: ImportPreviewItem = {
          baseModelNumber: baseModel,
          name: parsedRow.itemName,
          category: parsedRow.category,
          description: parsedRow.description,
          dimensions: parsedRow.dimensions,
          variants: [],
          addons: [],
          existingItemId: existingItem?.id,
          action: existingItem ? 'update' : 'create',
        };
        
        previewItems.set(baseModel, newPreviewItem);
        previewItem = newPreviewItem;
      }

      // Add variant
      if (parsedRow.style && parsedRow.price !== null) {
        const variantExists = previewItem.variants.some(v => v.style === parsedRow.style);
        if (!variantExists) {
          previewItem.variants.push({
            style: parsedRow.style,
            price: parsedRow.price,
          });
        }
      }

      // Parse and validate add-ons
      await this.parseAddons(parsedRow, previewItem, errors);
    }

    // Validate add-ons (check if referenced items exist)
    for (const item of previewItems.values()) {
      for (const addon of item.addons) {
        const referencedItem = await itemRepository.findByBaseModelNumber(
          this.extractBaseModelNumber(addon.modelNumber)
        );
        addon.found = !!referencedItem;
        
        if (!addon.found) {
          // Check if it's in the preview (will be created)
          const inPreview = Array.from(previewItems.values()).some(
            pi => pi.baseModelNumber === this.extractBaseModelNumber(addon.modelNumber)
          );
          addon.found = inPreview;
        }
      }
    }

    const items = Array.from(previewItems.values());

    return {
      items,
      errors,
      warnings,
      summary: {
        totalRows: data.length - 1,
        itemsToCreate: items.filter(i => i.action === 'create').length,
        itemsToUpdate: items.filter(i => i.action === 'update').length,
      },
    };
  }

  /**
   * Execute import based on preview
   */
  async executeImport(preview: ImportPreview): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      itemsCreated: 0,
      itemsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      addonsCreated: 0,
      errors: [],
      warnings: [],
    };

    // First pass: Create/update base items
    const itemIdMap = new Map<string, number>();
    
    for (const previewItem of preview.items) {
      try {
        if (previewItem.action === 'create') {
          // Create category if needed
          let category = await categoryRepository.findByName(previewItem.category);
          if (!category) {
            category = await categoryRepository.create({ name: previewItem.category });
            result.warnings.push(`Created new category: ${previewItem.category}`);
          }

          const item = await itemRepository.create({
            category_id: category.id,
            name: previewItem.name,
            description: previewItem.description,
            base_model_number: previewItem.baseModelNumber,
            dimensions: previewItem.dimensions,
          });
          
          itemIdMap.set(previewItem.baseModelNumber, item.id);
          result.itemsCreated++;
        } else {
          // Update existing item
          if (previewItem.existingItemId) {
            await itemRepository.update(previewItem.existingItemId, {
              name: previewItem.name,
              description: previewItem.description,
              dimensions: previewItem.dimensions,
            });
            itemIdMap.set(previewItem.baseModelNumber, previewItem.existingItemId);
            result.itemsUpdated++;
          }
        }
      } catch (error) {
        result.errors.push({
          row: 0,
          field: 'item',
          message: `Failed to ${previewItem.action} item ${previewItem.name}: ${error}`,
          value: previewItem.baseModelNumber,
        });
      }
    }

    // Second pass: Create/update variants
    for (const previewItem of preview.items) {
      const itemId = itemIdMap.get(previewItem.baseModelNumber);
      if (!itemId) continue;

      for (const variant of previewItem.variants) {
        try {
          // For now, always create new variants during import
          // Could be enhanced to match by style_name if needed
          await itemVariantRepository.create({
            item_id: itemId,
            style_name: variant.style,
            price: variant.price,
          });
          result.variantsCreated++;
        } catch (error) {
          result.errors.push({
            row: 0,
            field: 'variant',
            message: `Failed to create variant ${variant.style}: ${error}`,
            value: variant.style,
          });
        }
      }
    }

    // Note: Add-ons are now handled at variant level via excel-sync service
    // This legacy import service does not create item-level add-ons

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Parse a single row from Excel
   */
  private parseRow(row: any[], rowNumber: number): ExcelRow {
    return {
      rowNumber,
      category: row[0]?.toString().trim() || '',
      itemName: row[3]?.toString().trim() || '',
      description: row[4]?.toString().trim() || '',
      modelNumber: row[5]?.toString().trim() || '',
      dimensions: row[6]?.toString().trim() || '',
      style: row[7]?.toString().trim() || '',
      price: row[9] ? parseFloat(row[9]) : null,
      addon1: row[11]?.toString().trim() || '',
      addon2: row[12]?.toString().trim() || '',
      addon3: row[13]?.toString().trim() || '',
      addon4: row[14]?.toString().trim() || '',
    };
  }

  /**
   * Validate a parsed row
   */
  private validateRow(row: ExcelRow, rowNumber: number): ImportError[] {
    const errors: ImportError[] = [];

    if (!row.category) {
      errors.push({ row: rowNumber, field: 'Category', message: 'Category is required', value: '' });
    }

    if (!row.itemName) {
      errors.push({ row: rowNumber, field: 'Item Name', message: 'Item name is required', value: '' });
    }

    if (!row.modelNumber) {
      errors.push({ row: rowNumber, field: 'Model Number', message: 'Model number is required', value: '' });
    }

    if (!row.style) {
      errors.push({ row: rowNumber, field: 'Style', message: 'Style is required', value: '' });
    }

    if (row.price === null || isNaN(row.price) || row.price < 0) {
      errors.push({ row: rowNumber, field: 'Price', message: 'Valid price is required', value: row.price?.toString() || '' });
    }

    return errors;
  }

  /**
   * Parse add-ons from a row
   */
  private async parseAddons(
    row: ExcelRow,
    previewItem: ImportPreviewItem,
    errors: ImportError[]
  ): Promise<void> {
    const addons = [
      { slot: 1, value: row.addon1, required: true },
      { slot: 2, value: row.addon2, required: true },
      { slot: 3, value: row.addon3, required: false },
      { slot: 4, value: row.addon4, required: false },
    ];

    for (const addon of addons) {
      if (addon.value) {
        // Check if already added
        const exists = previewItem.addons.some(a => 
          a.slot === addon.slot && a.modelNumber === addon.value
        );
        
        if (!exists) {
          previewItem.addons.push({
            slot: addon.slot,
            modelNumber: addon.value,
            isRequired: addon.required,
            found: false,
          });
        }
      } else if (addon.required) {
        // Required add-on is missing
        errors.push({
          row: row.rowNumber,
          field: `Add-On 0${addon.slot}`,
          message: `Required add-on ${addon.slot} is missing`,
          value: '',
        });
      }
    }
  }

  /**
   * Extract base model number (remove variant suffix)
   * Example: "MGWSIPD-LK.18 Ink Black" -> "MGWSIPD-LK.18"
   */
  private extractBaseModelNumber(modelNumber: string): string {
    // Remove style suffix (assumes last part after space is style)
    const parts = modelNumber.split(' ');
    if (parts.length > 1) {
      // Last part is likely the style, remove it
      return parts.slice(0, -1).join(' ');
    }
    return modelNumber;
  }

  /**
   * Match images to variants
   * This is a placeholder - actual implementation would need to:
   * 1. Read extracted images from directory
   * 2. Match based on row position or some identifier
   * 3. Copy images to proper storage location
   */
  async matchImages(excelFilePath: string, imagesDir: string): Promise<Map<string, string>> {
    // TODO: Implement image matching logic
    // For now, return empty map
    return new Map();
  }
}

export const excelImportService = new ExcelImportService();
