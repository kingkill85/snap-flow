# Fix Dialog Accessibility Warning

## Problem
The `PlacementEditModal` component in `frontend/src/components/configurator/ConfiguratorCanvas.tsx` is missing a `DialogDescription`, causing a Radix UI accessibility warning:
"Missing `Description` or `aria-describedby={undefined}` for {DialogContent}"

## Solution
Add a `DialogDescription` component inside the `DialogHeader` to provide context for screen readers.

## Changes Required

### File: `frontend/src/components/configurator/ConfiguratorCanvas.tsx`

#### Change 1: Import DialogDescription
**Location:** Line 8-13
```typescript
// BEFORE:
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// AFTER:
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
```

#### Change 2: Add DialogDescription to DialogHeader
**Location:** Line 753-755 (inside the PlacementEditModal component)
```typescript
// BEFORE:
<DialogHeader>
  <DialogTitle>Style & Add-Ons</DialogTitle>
</DialogHeader>

// AFTER:
<DialogHeader>
  <DialogTitle>Style & Add-Ons</DialogTitle>
  <DialogDescription>
    Customize the product style and select optional add-ons for this placement.
  </DialogDescription>
</DialogHeader>
```

## Verification
After applying these changes:
1. The accessibility warning should no longer appear in the browser console
2. Screen readers will announce the dialog description when the modal opens
3. The dialog remains functionally unchanged for sighted users
