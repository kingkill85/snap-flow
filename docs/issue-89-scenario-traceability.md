# Issue #89 scenario traceability

Approved source SHA: `d13afe536e6e8dcd727a7a2a32da642ab3de6ee2`
Approved scenario count: **40**

The matrix covers every active scenario in both approved delta specifications. Evidence layers are `backend`, `frontend`, representative real-runtime `cucumber`, or a justified `reviewed assertion`. Cucumber uses the harness-spawned Deno/SQLite backend and Vite frontend without mocks; it intentionally represents user-visible integration paths rather than duplicating every backend permutation.

| Approved scenario | Evidence layer | Exact evidence |
| --- | --- | --- |
| Save valid values atomically | backend | HTTP success and repository aggregate in `backend/tests/routes/areas_zoning_test.ts` |
| Clear a value | backend | Explicit zero and omitted-as-zero HTTP/repository assertions in `backend/tests/routes/areas_zoning_test.ts` |
| Reject one invalid value without partial save | backend + cucumber | HTTP 400 and unchanged state in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Invalid value is rejected atomically` |
| Project has one configured Product Type | backend | Repository aggregate in `backend/tests/routes/areas_zoning_test.ts` |
| Project has multiple configured Product Types | backend + frontend | Aggregate ordering in `backend/tests/routes/areas_zoning_test.ts` and `frontend/src/components/configurator/AreaEditModal.test.tsx` |
| Project has no applicable definitions | backend + frontend | Empty aggregate compatibility in `backend/tests/config/zoning_migration_test.ts`; empty summary in `frontend/src/components/configurator/AreaPolygon.test.tsx` |
| Tenant user edits own project Area | backend | Authenticated HTTP update in `backend/tests/routes/areas_zoning_test.ts` |
| Cross-tenant Area request | backend + cucumber | Route suites `backend/tests/routes/areas_zoning_test.ts` and `backend/tests/routes/areas_test.ts`; real-runtime scenario `Cross-tenant Area is non-disclosing` |
| Concurrent Area edit wins once | backend + cucumber | Stale transaction rollback in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Stale revision recovery` |
| Definition changes while editor is open | backend + cucumber | Applicability conflict in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Applicability conflict has visible recovery` |
| Edit multiple Product Type groups on desktop | frontend + cucumber | `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Multiple Product Type groups on desktop` |
| Edit on a narrow viewport | frontend + cucumber | Responsive component assertions in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Narrow accessible editor` at 390×700 |
| Operate a stepper accessibly | frontend + cucumber | Bounds and accessible controls in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Keyboard stepper and persistence` |
| Cancel an edit | frontend + cucumber | Component discard behavior in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Cancel discards drafts` |
| Mixed zero and positive values | frontend + cucumber | Positive-only rendering in `frontend/src/components/configurator/AreaPolygon.test.tsx`; real-runtime scenario `Positive-only grouped summary persists after reload` |
| No positive values | frontend | Empty-summary assertion in `frontend/src/components/configurator/AreaPolygon.test.tsx` |
| Long and numerous values | frontend + cucumber | Bounded geometry in `frontend/src/components/configurator/AreaPolygon.test.tsx`; real-runtime scenario `Summary overflow remains bounded and accessible` |
| Select or drag through a summary | frontend | `frontend/src/components/configurator/AreaPolygon.test.tsx` verifies non-target `pointer-events: none` behavior |
| Upgrade an existing database | backend | Pre-zoning fixture, migration constraints, and repeated startup in `backend/tests/config/zoning_migration_test.ts` |
| Existing project after upgrade | backend | Preserved project graph, revision zero, and empty zoning tables in `backend/tests/config/zoning_migration_test.ts` |
| Copy zoning values across multiple floorplans and Areas | backend + cucumber | Remapping/stable identity assertions in `backend/tests/repositories/project-version-zoning_test.ts`; real UI flow `Create Version preserves remapped zoning values` |
| Copy mixed valued and unvalued Areas | backend | Three copied Areas with only persisted positive rows and unchanged definition count in `backend/tests/repositories/project-version-zoning_test.ts` |
| Copied versions are isolated after creation | backend | Source→destination and destination→source mutation isolation in `backend/tests/repositories/project-version-zoning_test.ts` |
| Zoning-copy failure rolls back version creation | backend | Injected late zoning failure with BOM-inclusive complete database count restoration in `backend/tests/repositories/project-version-zoning_test.ts` |
| Inaccessible source version is not copied | backend | Same-tenant wrong-group and cross-tenant non-global route cases with unchanged project/zoning counts in `backend/tests/repositories/project-version-zoning_test.ts` |
| Traceability gate is evaluated | reviewed assertion | `tools/neo_dev_webhook/tests/test_scenario_traceability.py` proves the matrix denominator comes from all 40 approved scenarios; `npm run e2e:traceability` validates this matrix plus representative feature mappings |
| Administrator creates a definition | backend + cucumber | HTTP route in `backend/tests/routes/item-types-zoning_test.ts`; real-runtime scenario `Administrator creates a definition` |
| Non-administrator attempts configuration | backend + cucumber | HTTP 403 in `backend/tests/routes/item-types-zoning_test.ts`; real-runtime scenario `Non-administrator authorization is enforced` |
| Definitions are listed predictably | backend | Ordered HTTP response in `backend/tests/routes/item-types-zoning_test.ts` |
| Duplicate name in one Product Type | backend | Route rejection in `backend/tests/routes/item-types-zoning_test.ts`; repository scope in `backend/tests/repositories/zoning-parameter_test.ts` |
| Same name in separate Product Types | backend | Scoped identity in `backend/tests/repositories/zoning-parameter_test.ts` |
| Invalid reorder is atomic | backend | HTTP rejection and valid-order comparison in `backend/tests/routes/item-types-zoning_test.ts`; repository rejection in `backend/tests/repositories/zoning-parameter_test.ts` |
| Rename a used definition | backend | Stable-ID update in `backend/tests/routes/item-types-zoning_test.ts` and `backend/tests/repositories/zoning-parameter_test.ts` |
| Reorder used definitions | backend | Ordered stable IDs in `backend/tests/routes/item-types-zoning_test.ts` and `backend/tests/repositories/zoning-parameter_test.ts` |
| Deactivate a used definition | backend | Inactive-list semantics in `backend/tests/routes/item-types-zoning_test.ts`; retained values in `backend/tests/repositories/zoning-parameter_test.ts` |
| Reactivate a definition | backend + cucumber | Stable-ID activation in `backend/tests/routes/item-types-zoning_test.ts`; real-runtime scenario `Deactivate and reactivate retains values` |
| Delete an unused definition | backend | HTTP deletion and sibling preservation in `backend/tests/routes/item-types-zoning_test.ts` |
| Reject deletion of a referenced definition | backend + frontend + cucumber | HTTP 409 in `backend/tests/routes/item-types-zoning_test.ts`; management component error test; real-runtime scenario `Referenced parameter deletion is actionable` |
| Product Type becomes inactive | backend | Applicability lifecycle in `backend/tests/routes/areas_zoning_test.ts` and `backend/tests/repositories/zoning-parameter_test.ts` |
| Product Type is selected again for a project | backend + cucumber | Repository aggregates in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Project Product Type reselection retains values` |
