# Add DialogDescription to All Modals

## Summary
Add accessibility-compliant `DialogDescription` components to all modals that are currently missing them. This resolves Radix UI warnings and improves screen reader support.

## Files Requiring DialogDescription

### 1. ConfiguratorCanvas.tsx - PlacementEditModal
**Current State:** Missing DialogDescription
**Location:** Lines 752-755

**Changes:**
```typescript
// Add to imports (line 8-13):
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,  // ADD THIS
} from '@/components/ui/dialog';

// Add description after DialogTitle (line 753-755):
<DialogHeader>
  <DialogTitle>Style & Add-Ons</DialogTitle>
  <DialogDescription>
    Customize the product style and select optional add-ons for this placement.
  </DialogDescription>
</DialogHeader>
```

---

### 2. InvoiceSettingsModal.tsx
**Current State:** Missing DialogDescription  
**Location:** Lines 1-8, 168-170

**Changes:**
```typescript
// Update imports (line 1-8):
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,  // ADD THIS
} from '@/components/ui/dialog';

// Add description (line 168-170):
<DialogHeader>
  <DialogTitle>Configure Invoice</DialogTitle>
  <DialogDescription>
    Customize discount rates, markup percentages, and pricing settings for the project invoice.
  </DialogDescription>
</DialogHeader>
```

---

### 3. VariantFormModal.tsx
**Current State:** Missing DialogDescription
**Location:** Lines 1-8, 234-236

**Changes:**
```typescript
// Update imports (line 1-8):
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,  // ADD THIS
} from '@/components/ui/dialog';

// Add description (line 234-236):
<DialogHeader className="pb-2">
  <DialogTitle className="text-lg">{isEdit ? 'Edit Style' : 'Create Style'}</DialogTitle>
  <DialogDescription>
    {isEdit 
      ? 'Update the style details, pricing, and associated add-ons.' 
      : 'Create a new style variant with pricing and optional add-ons.'}
  </DialogDescription>
</DialogHeader>
```

---

### 4. FloorplanFormModal.tsx
**Current State:** Missing DialogDescription
**Location:** Lines 7-12, 191-193

**Changes:**
```typescript
// Update imports (line 7-12):
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,  // ADD THIS
} from '@/components/ui/dialog';

// Add description (line 191-193):
<DialogHeader>
  <DialogTitle>{isEdit ? 'Edit Floorplan' : 'Create Floorplan'}</DialogTitle>
  <DialogDescription>
    {isEdit 
      ? 'Update the floorplan name and image.' 
      : 'Upload a floorplan image and provide a name for the project.'}
  </DialogDescription>
</DialogHeader>
```

---

### 5. ProjectDashboard.tsx - Delete Floorplan Modal
**Current State:** Missing DialogDescription
**Location:** Lines 19-24, 1047-1049

**Changes:**
```typescript
// Update imports (line 19-24):
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,  // ADD THIS
} from '@/components/ui/dialog';

// Add description (line 1047-1049):
<DialogHeader>
  <DialogTitle>Delete Floorplan</DialogTitle>
  <DialogDescription>
    This action cannot be undone. The floorplan and all associated placements will be permanently removed.
  </DialogDescription>
</DialogHeader>
```

---

## Already Complete (No Changes Needed)

The following modals already have DialogDescription:
- ✅ ConfirmDeleteModal.tsx
- ✅ UserFormModal.tsx
- ✅ ProjectFormModal.tsx
- ✅ ImportModal.tsx
- ✅ ItemFormModal.tsx
- ✅ CategoryFormModal.tsx

## Verification Steps

After applying all changes:
1. Open each modal in the browser
2. Check browser console - no Radix UI warnings should appear
3. Test with screen reader (if available) - descriptions should be announced
4. All modals should remain visually unchanged

## Impact
- **Accessibility:** Screen readers now announce dialog purpose
- **Console:** Eliminates all "Missing Description" warnings
- **UX:** No visual changes for sighted users
