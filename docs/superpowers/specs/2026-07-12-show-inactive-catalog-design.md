# Show Inactive Catalog Records

## Problem

The frontend correctly sends `include_inactive=true` with an authorization token. The public product and variant GET routes do not run authentication middleware, so their Hono context never receives `userId` or `userRole`. Both routes therefore ignore the flag and return active records only.

## Required Behavior

- Public catalog requests without authentication continue to return active products and styles.
- A valid administrator token allows `include_inactive=true` to return active and inactive products and styles.
- Non-administrator and unauthenticated requests cannot expose inactive catalog records.
- Inactive products shown to administrators retain a preview from their first style, even when every style is inactive.
- Existing API response formats and frontend controls remain unchanged.

## Design

Add an optional authentication middleware that reads a bearer token when supplied, verifies it, and populates the same context fields as the required authentication middleware. A missing or invalid token continues without identity, preserving public catalog access.

Apply optional authentication to the product-list and item-variant-list routes. Honor `include_inactive=true` only when `userRole === 'admin'`, rather than merely checking for any authenticated user.

When the item repository includes inactive records, its preview-image subquery may select the first inactive style image as a fallback. Active-only requests continue to select images from active styles only.

## Tests

Add route-level regression coverage proving:

- public requests with `include_inactive=true` still omit inactive products and styles;
- administrator requests with the flag include inactive products and styles;
- inactive products returned to administrators retain their stored preview image;
- database records remain unchanged by reads.

Run the focused route tests, backend lint, and the complete backend test suite.
