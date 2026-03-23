# Modal Overflow Fix — Design Spec

## Context

GitHub Issue #51: Popups go out of the screen real estate. OK/Update buttons end up below the visible screen, requiring zoom out to access them.

## Root Cause

`DialogContent` in `frontend/src/components/ui/dialog.tsx` has no `max-height` or `overflow-y`. Modals grow unbounded and clip off the bottom of the viewport.

## Scope

1 base component fix + 4 modal restructures for sticky footer.

---

## Base Fix: dialog.tsx

**File:** `frontend/src/components/ui/dialog.tsx`

Add `max-h-[90vh] flex flex-col` to the `DialogContent` className. This gives every modal a viewport height constraint and flex layout. Modals shorter than 90vh are visually unchanged.

**Acceptance criteria:**
- All modals are constrained to 90% viewport height
- Short modals look exactly the same as before

---

## Sticky Footer Restructure

Apply to the 4 tallest modals. Pattern:

```tsx
<DialogContent className="sm:max-w-[500px]">
  <DialogHeader>...</DialogHeader>
  <div className="flex-1 overflow-y-auto px-1">
    {/* form fields */}
  </div>
  <DialogFooter>
    {/* buttons — always visible */}
  </DialogFooter>
</DialogContent>
```

The `flex-1 overflow-y-auto` div becomes the scrollable body. `DialogHeader` and `DialogFooter` stay pinned.

### 1. InvoiceSettingsModal

**File:** `frontend/src/components/invoice/InvoiceSettingsModal.tsx`

Tallest modal — 4 sections + preview. Wrap the form body (everything between DialogHeader and DialogFooter) in a `flex-1 overflow-y-auto` div.

### 2. VariantFormModal

**File:** `frontend/src/components/items/VariantFormModal.tsx`

Currently has `max-h-[80vh] overflow-y-auto` on DialogContent. Remove those classes (the base fix handles max-h now). Restructure to sticky footer pattern — wrap form fields in scrollable div, keep DialogFooter outside.

### 3. ItemFormModal

**File:** `frontend/src/components/items/ItemFormModal.tsx`

Wrap form fields between DialogHeader and DialogFooter in scrollable div.

### 4. ImportModal

**File:** `frontend/src/components/items/ImportModal.tsx`

Excel import preview can show many rows. Wrap the preview content in scrollable div, keep action buttons pinned.

---

## Modals NOT restructured (base fix sufficient)

- **ProjectFormModal** — 6 fields, fits on most screens
- **FloorplanFormModal** — 3 fields
- **UserFormModal** — 4 fields
- **CategoryFormModal** — 2 fields
- **ConfirmDeleteModal** — tiny confirmation prompt

These all inherit `max-h-[90vh] flex flex-col` from the base fix. If content somehow overflows, the flex layout allows future sticky footer addition without base changes.

## Testing Strategy

- Manual: open each modal on a small viewport (e.g., 768px height), verify buttons are visible
- Existing frontend tests should still pass (no behavior change, only CSS/layout)
