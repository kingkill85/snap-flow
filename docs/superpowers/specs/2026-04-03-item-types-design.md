# Item Types Design

Add admin-manageable item types (Zigbee, BusPro, BusPro Wireless, KNX, etc.) to categorize items by technology. Each type has its own color, abbreviation, Excel import, and document output.

## Data Model

### New `item_types` table

| Column       | Type    | Notes                                      |
|-------------|---------|--------------------------------------------|
| id          | INTEGER | PK, autoincrement                          |
| name        | TEXT    | Unique, required (e.g. "Zigbee", "KNX")   |
| abbreviation| TEXT    | Short label for badges (e.g. "ZB", "KNX") |
| color       | TEXT    | Hex color for markers (e.g. "#3b82f6")     |
| sort_order  | INTEGER | Display ordering                           |
| is_active   | INTEGER | Default 1                                  |
| created_at  | TEXT    | ISO timestamp                              |

### New `project_item_types` junction table

| Column        | Type    | Notes                        |
|--------------|---------|------------------------------|
| project_id   | INTEGER | FK to projects               |
| item_type_id | INTEGER | FK to item_types             |

Composite primary key on `(project_id, item_type_id)`.

### Changes to `items` table

- Add `type_id` (INTEGER) — references `item_types.id`, required on all items.

### Changes to `project_bom` table

- Add `item_type_name` (TEXT) — snapshot of the item type name at placement time. Renames to the item type do not propagate to existing BOM entries.

### Migration

1. Create `item_types` table.
2. Insert default "Zigbee" type: name="Zigbee", abbreviation="ZB", color="#3b82f6", sort_order=1.
3. Add `type_id` column to `items`, set all existing items to the Zigbee type ID.
4. Add `item_type_name` column to `project_bom`, backfill all existing rows with "Zigbee".
5. Create `project_item_types` table.
6. For all existing projects, insert a row linking to the Zigbee type (so existing projects continue working).

### Hierarchy

```
Category (shared across types)
  └── Item (tagged with one item type)
        └── Variant (inherits type from parent item)
```

Categories are logical groups (e.g. "Switches", "Sensors") shared across all item types. Item type is a separate dimension — a category can contain both Zigbee and KNX switches.

## Backend

### ItemTypeRepository

New repository following existing patterns (like CategoryRepository):

- `findAll(includeInactive?)` — list all types, ordered by `sort_order`
- `findById(id)`, `findByName(name)`
- `create(data)`, `update(id, data)`
- `deactivate(id)`, `activate(id)`, `delete(id)`
- `reorder(ids[])`
- `getNextSortOrder()`

Delete is blocked if any items reference the type.

### Routes (`/item-types`)

| Method | Path                      | Auth  | Description                |
|--------|--------------------------|-------|----------------------------|
| GET    | /item-types              | user  | List all (filter: include_inactive) |
| POST   | /item-types              | admin | Create                     |
| PUT    | /item-types/:id          | admin | Update                     |
| DELETE | /item-types/:id          | admin | Delete (blocked if items exist) |
| PATCH  | /item-types/:id/deactivate | admin | Deactivate               |
| PATCH  | /item-types/:id/activate | admin | Activate                   |
| PATCH  | /item-types/reorder      | admin | Reorder                    |

### Items route changes

- `GET /items` gains `type_id` query parameter for filtering.
- `POST /items` and `PUT /items/:id` accept `type_id` (required on create).
- Item responses include type info: `type_id`, `type_name`, `type_abbreviation`, `type_color`.

### Excel sync changes

- `POST /items/sync-catalog` gains a required `type_id` parameter.
- All sync operations (create, update, deactivate) are scoped to the given type — items of other types are untouched.
- Same scoping applies to the preview-based import (`POST /items/import-preview`, `POST /items/import`).

### BOM entry changes

- When creating a BOM entry, snapshot `item_type_name` from the item's type.
- Existing behavior: BOM entries already snapshot `item_name`, `style_name`, etc. This follows the same pattern.

### Project changes

- `POST /projects` and `PUT /projects/:id` accept `item_type_ids` (array of integers).
- Default on create: all active item types are selected.
- Project responses include the list of enabled item types.

## Frontend — Item Type Management

New admin page under the catalog section, similar to Category Management.

### CRUD table

- Columns: color swatch, name, abbreviation, sort order, active status, actions
- Create/edit modal with fields: name, abbreviation, color picker, sort order
- Color picker: preset palette of distinct colors + custom hex input (same pattern as Area Edit modal)
- Drag-and-drop reorder
- Delete blocked if items reference the type (show error message)
- Activate/deactivate toggle

## Frontend — Catalog (Item Management)

### Type filter

- Dropdown or tab bar at the top of the item list, alongside existing category filter and search.
- Options: "All Types" + each active type.
- Filters the item table to show only items of the selected type.

### Item form changes

- Item create/edit modal gains a required "Item Type" dropdown.
- Defaults to the first type alphabetically on create.

### Type badge on items

- Each item row in the table shows a small colored badge with the type abbreviation (e.g. colored "ZB", "BP", "KNX").

### Excel import modal changes

- User must select an item type from a dropdown before uploading the Excel file.
- The selected type ID is sent with the sync/import request.
- Modal header or description indicates which type is being imported.

## Frontend — Configurator

### Item palette / sidebar

- Type filter tabs or dropdown at the top of the item list.
- Only types enabled on the current project are shown.
- "All" tab shows all enabled types.
- Each item in the palette shows its type badge (colored abbreviation).

### Floorplan placements

- Each placed item shows a small colored ring/dot matching its type color, positioned at a consistent corner of the placement icon.
- A collapsible legend panel in a corner of the floorplan maps type colors to type names.

### Visibility toggles

- Per-type eye icon toggles in the existing visibility controls area (same pattern as area visibility).
- Toggling off a type hides all placements of that type on the floorplan.
- Only types enabled on the project are shown in the toggle list.
- Works independently of existing item visibility toggles.

## Frontend — Project Form

### Item type selection

- Project create/edit form includes a checkbox list of all active item types.
- Default on create: all active types are checked.
- At least one type must be selected (validation).
- Unchecking a type on a project that already has placements of that type: show a warning, but do not delete existing placements. They become hidden/filtered in the configurator and excluded from new exports.

## Frontend — Invoice / Document Output

### Separate document per item type

- Each item type with placements in the project produces its own DOCX proposal.
- Each document follows the existing format: items grouped by category, multi-floorplan columns, quantities, pricing, area summary.
- Filename: `{projectName}_{typeName}_Proposal.docx`.

### Export selection dialog

- "Generate Proposal" opens a selection dialog showing all project types that have placements.
- User checks which type(s) to export.
- Each selected type downloads as a separate DOCX file.
- If only one type has placements, skip the dialog and download directly.

### BOM snapshot integrity

- `item_type_name` on BOM entries ensures documents reflect the type name as it was at placement time.
- Renaming a type does not affect existing BOM entries or past proposals.

## Error Handling

- Deleting a type with items: blocked with error message.
- Creating items without a type: rejected (type_id required).
- Importing Excel without selecting a type: blocked in UI (dropdown required).
- Deactivating a type: does not cascade to items (items remain but type is hidden from new selections). Existing projects with the type still function.
- Project with no types selected: validation prevents this.

## Testing

### Backend tests

- ItemTypeRepository CRUD operations (in-memory SQLite).
- Items filtered by type_id.
- Excel sync scoped to type — verify items of other types are untouched.
- BOM entry snapshots `item_type_name` correctly.
- Migration: existing items get Zigbee type, existing BOMs get backfilled.
- Project item type association CRUD.

### Frontend tests

- Item type management page: create, edit, delete, reorder.
- Item form: type dropdown required, type badge rendering.
- Configurator: palette filter by type, visibility toggles.
- Import modal: type selection required before upload.
- Invoice: selection dialog appears with multiple types, single type skips dialog.
- Project form: type checkboxes, default all selected, at least one required.
