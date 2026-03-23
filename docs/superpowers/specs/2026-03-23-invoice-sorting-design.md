# Word Invoice Sorting + Font — Design Spec

## Context

GitHub Issue #50: Items in the Word invoice should be sorted by category (as they appear in the side panel), then alphabetically within category, with addons listed directly under their parent item. Font should be Bahnschrift Light size 9.

## Current State

- `invoice-docx.ts` generates a pivot table sorted alphabetically by item name
- `FloorplanItem` has no category info or addon relationship
- `aggregateItems` in `useBomCalculations.ts` flattens items and addons into a single list, merging by name
- Font is Calibri size 10pt throughout
- Two conflicting `FloorplanTotal` types exist: one in `bom.ts` (with `FloorplanItem[]`) and one in `useBomCalculations.ts` (with `AggregatedItem[]`) — both have identical shapes today
- `categories` is NOT available in `ProjectDashboard` or `useProjectData` — must be fetched

## Changes

### 1. Fetch Categories in useProjectData

**File:** `frontend/src/hooks/useProjectData.ts`

Add `categoryService.getAll()` to the `fetchProjectData` function, alongside the existing project/floorplans/items fetches. Add `categories: Category[]` to the hook's state and return value. This provides category data (including `sort_order` and `name`) to `ProjectDashboard`.

### 2. Eliminate Dual FloorplanTotal Type

**Files:** `frontend/src/services/bom.ts`, `frontend/src/hooks/useBomCalculations.ts`

Remove the duplicate `FloorplanTotal` and `AggregatedItem` types from `useBomCalculations.ts`. Import `FloorplanItem` and `FloorplanTotal` from `bom.ts` instead. This prevents the type mismatch after enrichment.

### 3. Enrich FloorplanItem with Category and Addon Info

**File:** `frontend/src/services/bom.ts`

Update `FloorplanItem`:
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

**File:** `frontend/src/hooks/useBomCalculations.ts`

- Accept `items` and `categories` arrays as additional parameters to the hook
- In `aggregateItems`, look up each BOM entry's `item_id` in the items array to get `category_id`, then look up the category to get `sort_order` and `name`
- **Fallback for missing items:** When `items.find(i => i.id === entry.item_id)` returns `undefined` (item deleted from catalog), use fallback values: `categoryId: 0, categorySortOrder: Number.MAX_SAFE_INTEGER, categoryName: 'Other'`. This sorts unknown items to the end.
- **Assumption:** The same item always belongs to the same category. Cross-floorplan merging by name is safe because category assignments are stable. If an item is re-categorized, the first-seen category wins — acceptable since re-categorization is rare and the BOM snapshots the item at placement time.
- Track parent-child relationships: main entries get `isAddon: false, parentItemName: null`; children get `isAddon: true, parentItemName: <main entry's display name>`
- **Addon merging:** Addons with the same name but different parents are kept separate (keyed by `parentItemName + " > " + addonName` instead of just name). This prevents cross-parent merging artifacts.

### 4. Sort and Interleave Items in DOCX Generator

**File:** `frontend/src/services/invoice-docx.ts`

Update `PivotItem` to include the new fields. In `transformToPivot`, use a **group-then-flatten** algorithm (not a sort comparator):

1. Group all items by `categoryName`
2. Sort categories by `categorySortOrder`
3. Within each category, collect non-addon items sorted alphabetically
4. For each non-addon item, find addons whose `parentItemName` matches, sorted alphabetically
5. Interleave: `[non-addon, its addons, next non-addon, its addons, ...]`
6. Flatten all categories into the final sorted array

Add category header rows when the category changes:
- Bold, shaded background, spanning all columns
- Column span formula: `numFloorplanCols + 6` (# + Item + floorplan cols + TotalQty + UnitPrice + Total)
- `#` numbering continues across categories (does not reset per category)

Indent addon names with a prefix `"  ↳ "` to visually distinguish them from main items.

### 5. Change Font

**File:** `frontend/src/services/invoice-docx.ts`

- Replace all `font: 'Calibri'` with `font: 'Bahnschrift Light'`
- Replace the default document style font from `'Calibri'` to `'Bahnschrift Light'`
- Body text: change `size: 20` (10pt) to `size: 18` (9pt)
- Grand Total rows: keep `size: 20` (10pt) for visual emphasis over the 9pt body
- Project header lines (Project/Customer/Ref): keep `size: 22` (11pt)
- Word falls back to a similar font if Bahnschrift is not installed

### 6. Pass Items and Categories to SummaryTab

**Files:** `frontend/src/pages/projects/ProjectDashboard.tsx`, `frontend/src/components/invoice/SummaryTab.tsx`

- Add `items` and `categories` props to `SummaryTab`
- Pass them from `ProjectDashboard` (now available via `useProjectData`)
- `SummaryTab` passes them through to `generateInvoiceDOCX` (add to `InvoiceDocxData` interface)
- `useBomCalculations` receives them as additional hook parameters

## Acceptance Criteria

- Items in DOCX are grouped by category, with category header rows
- Within each category, main items are sorted alphabetically
- Addons appear directly under their parent item, visually indented with "↳"
- Items with deleted catalog entries sort to the end under "Other"
- Font is Bahnschrift Light, size 9pt body / 10pt Grand Total / 11pt headers
- `#` numbering is continuous across categories
- Existing tests still pass
- Category sort order matches the catalog side panel

## Out of Scope

- Addon de-duplication across different parent items (they stay separate)
- Per-floorplan sorting (only the pivot table is sorted)
- Font embedding in the DOCX file (relies on client machine having the font)
