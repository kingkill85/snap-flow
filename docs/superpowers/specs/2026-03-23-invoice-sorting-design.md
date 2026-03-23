# Word Invoice Sorting + Font — Design Spec

## Context

GitHub Issue #50: Items in the Word invoice should be sorted by category (as they appear in the side panel), then alphabetically within category, with addons listed directly under their parent item. Font should be Bahnschrift Light size 9.

## Current State

- `invoice-docx.ts` generates a pivot table sorted alphabetically by item name
- `FloorplanItem` has no category info or addon relationship
- `aggregateItems` in `useBomCalculations.ts` flattens items and addons into a single list
- Font is Calibri size 10pt throughout

## Changes

### 1. Enrich FloorplanItem with Category and Addon Info

**Files:** `frontend/src/services/bom.ts`, `frontend/src/hooks/useBomCalculations.ts`

Add fields to `FloorplanItem`:
```typescript
export interface FloorplanItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  categoryId: number;
  categorySortOrder: number;
  categoryName: string;
  isAddon: boolean;
  parentItemName: string | null;
}
```

Update `useBomCalculations.ts`:
- Accept `items` and `categories` arrays as additional parameters to the hook
- In `aggregateItems`, look up each BOM entry's `item_id` in the items array to get `category_id`, then look up the category to get `sort_order` and `name`
- Track parent-child relationships: main entries get `isAddon: false, parentItemName: null`; children get `isAddon: true, parentItemName: <main entry's name>`

### 2. Sort Items in DOCX Generator

**File:** `frontend/src/services/invoice-docx.ts`

Update `PivotItem` to include the new fields. In `transformToPivot`, sort by:
1. `categorySortOrder` ascending
2. Non-addons before their addons
3. Item name alphabetically within category

Add category header rows — bold, shaded, spanning all columns — when the category changes between items.

Indent addon names with a prefix (e.g., "  ↳ " or "    ") to visually distinguish them from main items.

### 3. Change Font

**File:** `frontend/src/services/invoice-docx.ts`

- Replace all `font: 'Calibri'` with `font: 'Bahnschrift Light'`
- Replace the default document style font from `'Calibri'` to `'Bahnschrift Light'`
- Replace all `size: 20` (10pt) with `size: 18` (9pt)
- Keep `size: 22` (11pt) for the project header lines (or change to `size: 20` for 10pt)
- Word falls back to a similar font if Bahnschrift is not installed

### 4. Pass Items and Categories to SummaryTab

**Files:** `frontend/src/pages/projects/ProjectDashboard.tsx`, `frontend/src/components/invoice/SummaryTab.tsx`

- Add `items` and `categories` props to `SummaryTab`
- Pass them from `ProjectDashboard` (already available there)
- Pass through to `useBomCalculations` and then to `generateInvoiceDOCX`

## Acceptance Criteria

- Items in DOCX are grouped by category, with category headers
- Within each category, items are sorted alphabetically
- Addons appear directly under their parent item, visually indented
- Font is Bahnschrift Light, size 9pt
- Existing tests still pass
- Category sort order matches the catalog side panel
