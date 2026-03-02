# Backend Lint Cleanup Plan

## Current Status
- **Total Errors**: 197 across 71 files
- **Auto-fixed**: 16 issues already resolved

## Error Breakdown

### 1. require-await (97 errors)
**Pattern**: Repository methods marked `async` but don't use `await`
**Files affected**: 
- All repository files (user.ts, category.ts, floorplan.ts, etc.)
- Test files
- Migration scripts

**Fix**: Remove `async` keyword from methods that don't use await
**Example**:
```typescript
// Before
async findAll(): Promise<User[]> { return this.db.query(...); }

// After  
findAll(): Promise<User[]> { return this.db.query(...); }
```

### 2. no-unused-vars (60 errors)
**Pattern**: Unused imports and variables
**Files affected**:
- Test files with unused imports
- Repository files with unused error variables
- Variables created but never used

**Fix**: 
- Remove unused imports
- Prefix intentionally unused vars with underscore: `_error`, `_user`
- Remove dead code

### 3. no-import-prefix (20 errors)
**Pattern**: Direct URL imports instead of bare specifiers
**Files affected**:
- Test files importing from `https://deno.land/std@0.208.0/assert/mod.ts`

**Fix**: Replace with `@std/assert` bare specifier (already added to deno.json)

### 4. no-explicit-any (18 errors)
**Pattern**: Using `any` type
**Files affected**:
- `src/services/excel-import.ts` - parseRow function
- `src/services/excel-sync.ts` - various functions
- `tests/test-client.ts` - parseJSON function
- Test files using `as any` assertions

**Fix**: Replace with proper types or `unknown` with type guards

### 5. no-extra-boolean-cast (2 errors)
**Pattern**: Unnecessary boolean conversions
**Fix**: Remove redundant `!!` or `Boolean()`

## Files Needing Manual Review

### High Priority
1. **src/repositories/*.ts** - Remove async from methods without await
2. **tests/**/*.ts** - Fix imports and unused variables
3. **src/services/excel-import.ts** - Replace `any` types
4. **src/services/excel-sync.ts** - Replace `any` types

### Medium Priority
5. **src/middleware/auth.ts** - Prefix unused error variables
6. **src/main.ts** - Prefix unused error variables
7. **migrations/*.ts** - Remove async from migration functions

### Low Priority
8. **src/scripts/*.ts** - Clean up unused imports

## Implementation Strategy

### Phase 1: Quick Wins (no-import-prefix, no-unused-vars)
- Fix all test file imports to use bare specifiers
- Prefix unused error variables with underscore
- Remove obviously dead code

### Phase 2: require-await
- Systematically remove async from repository methods
- Keep async on methods that return promises but don't await internally
- These are database wrapper methods that don't need async

### Phase 3: no-explicit-any
- Add proper types to Excel import/sync functions
- Define interfaces for row data
- Update test-client parseJSON with generic type

### Phase 4: Final Review
- Run deno lint to verify all issues resolved
- Run deno test to ensure functionality intact
- Commit changes

## Commands

```bash
# Check current status
cd /Users/michaelkusche/dev/snap-flow/backend && deno lint

# Auto-fix what can be fixed
cd /Users/michaelkusche/dev/snap-flow/backend && deno lint --fix

# Check specific error type
cd /Users/michaelkusche/dev/snap-flow/backend && deno lint 2>&1 | grep "require-await"

# Test after fixes
cd /Users/michaelkusche/dev/snap-flow/backend && deno test --allow-all
```

## Notes
- Repository pattern uses sync database calls wrapped in async methods
- Tests need `@std/assert` imports converted from URLs
- Excel services need proper typing for dynamic data
- Error variables in catch blocks should be prefixed if not used
