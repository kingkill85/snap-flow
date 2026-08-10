# Issue #89 scenario traceability

Approved source SHA: `9dff3d83b82d32698993d05f3cca3ac4b7b5e695`
Approved scenario count: **48**

The matrix covers every active scenario in both approved delta specifications. Evidence layers are `backend`, `frontend`, representative real-runtime `cucumber`, or a justified `reviewed assertion`. Cucumber uses the harness-spawned Deno/SQLite backend and Vite frontend without mocks; it intentionally represents user-visible integration paths rather than duplicating every backend permutation.

| Approved scenario | Evidence layer | Exact evidence |
| --- | --- | --- |
| Save valid values atomically | backend | HTTP success and repository aggregate in `backend/tests/routes/areas_zoning_test.ts` |
| Clear a value | backend | Explicit zero and omitted-as-zero HTTP/repository assertions in `backend/tests/routes/areas_zoning_test.ts` |
| Reject one invalid value without partial save | backend + cucumber | HTTP 400 and unchanged state in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Invalid value is rejected atomically` |
| Project has one configured Product Type | backend | Repository aggregate in `backend/tests/routes/areas_zoning_test.ts` |
| Project has multiple configured Product Types | backend + frontend | Aggregate ordering in `backend/tests/routes/areas_zoning_test.ts` and `frontend/src/components/configurator/AreaEditModal.test.tsx` |
| Project has no applicable definitions | backend + frontend | Empty aggregate compatibility in `backend/tests/config/zoning_migration_test.ts`; empty annotation in `frontend/src/components/configurator/AreaPolygon.test.tsx` |
| Tenant user edits own project Area | backend | Authenticated HTTP update in `backend/tests/routes/areas_zoning_test.ts` |
| Cross-tenant Area request | backend + cucumber | Route suites `backend/tests/routes/areas_zoning_test.ts` and `backend/tests/routes/areas_test.ts`; real-runtime scenario `Cross-tenant Area is non-disclosing` |
| Concurrent Area edit wins once | backend + cucumber | Stale transaction rollback in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Stale revision recovery` |
| Definition changes while editor is open | backend + cucumber | Applicability conflict in `backend/tests/routes/areas_zoning_test.ts`; real-runtime scenario `Applicability conflict has visible recovery` |
| Edit one Product Type compactly on desktop | frontend + cucumber | Native compact row assertions in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Compact native zoning editor` |
| Edit multiple Product Type groups on desktop | frontend + cucumber | Ordered compact groups in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Multiple Product Type groups on desktop` |
| Edit on a narrow viewport | frontend + cucumber | Responsive component assertions in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Narrow accessible editor` at 390×700 |
| Operate a native number input accessibly | frontend + cucumber | Native spinbutton bounds and absence of custom controls in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Native keyboard stepper and persistence` |
| Save and reopen compact zoning values | frontend | Complete atomic payload and reopened-prop state behavior in `frontend/src/components/configurator/AreaEditModal.test.tsx`; the representative native-input real-runtime scenario separately proves persisted reopening |
| Cancel an edit | frontend + cucumber | Component discard behavior in `frontend/src/components/configurator/AreaEditModal.test.tsx`; real-runtime scenario `Cancel discards drafts` |
| Mixed zero and positive values | frontend + cucumber | Positive-only shared model/rendering in `frontend/src/components/configurator/zoning-annotation.test.ts` and `AreaPolygon.test.tsx`; real-runtime scenario `Positive-only grouped annotations persist after reload` |
| No positive values | frontend | Empty-summary assertion in `frontend/src/components/configurator/AreaPolygon.test.tsx` |
| Read annotations over varied floorplan backgrounds | frontend + cucumber | Shared dual-contrast constants and SVG fill/stroke assertions in `frontend/src/components/configurator/zoning-annotation.test.ts` and `AreaPolygon.test.tsx`; real-runtime scenario `Annotation remains readable over varied floorplan backgrounds` verifies direct outlined text without a panel or color-only grouping |
| Avoid overlapping nearby product placements | frontend + cucumber | Canonical-candidate and shared 45° rotated-AABB assertions in `frontend/src/components/configurator/zoning-annotation.test.ts`; real-runtime scenario `Annotation avoids a nearby product placement` compares the annotation with the rendered bounds of a non-square 45° product |
| Long and numerous values | frontend + cucumber | Bounded deterministic model in `frontend/src/components/configurator/zoning-annotation.test.ts`; real-runtime scenario `Annotation overflow remains bounded and accessible` |
| Select or drag through an annotation | frontend + cucumber | `frontend/src/components/configurator/AreaPolygon.test.tsx` verifies `pointer-events: none`; real-runtime scenario `Annotation passes pointer interaction through` uses hit testing |
| Export includes the interactive annotations | frontend + cucumber | Exact prepared-descriptor drawing and hidden-Area assertions in `frontend/src/services/__tests__/floorplan-export.test.ts`; real-runtime scenario `PNG export preserves annotation presentation` compares canonical anchor/omission/export bounds, decodes the downloaded PNG, and inspects foreground/outline pixels plus canvas text/style coordinates |
| Export remains deterministic at supported scales | frontend | The collision-producing `.5`/`1`/`1.5` model regression proves one anchor, omission count, and collision result while renderer-only presentation dimensions transform; the export service test consumes that exact canonical descriptor |
| Export annotations remain clear near products and varied imagery | frontend | Shared rotation-aware placement bounds, shared scale-aware Area-name geometry, and dual-contrast canvas assertions have focused model/export coverage; the separately mapped runtime overflow, nearby-placement, and PNG scenarios exercise the same geometry with a non-square 45° product |
| Annotation export fails closed | frontend + cucumber | `frontend/src/services/__tests__/floorplan-export.test.ts` asserts no encoding/link creation after drawing failure; real-runtime scenario `PNG annotation export fails closed` asserts surfaced error and no download |
| Upgrade an existing database | backend | Pre-zoning fixture, migration constraints, and repeated startup in `backend/tests/config/zoning_migration_test.ts` |
| Existing project after upgrade | backend | Preserved project graph, revision zero, and empty zoning tables in `backend/tests/config/zoning_migration_test.ts` |
| Copy zoning values across multiple floorplans and Areas | backend + cucumber | Remapping/stable identity assertions in `backend/tests/repositories/project-version-zoning_test.ts`; real UI flow `Create Version preserves remapped zoning values` |
| Copy mixed valued and unvalued Areas | backend | Three copied Areas with only persisted positive rows and unchanged definition count in `backend/tests/repositories/project-version-zoning_test.ts` |
| Copied versions are isolated after creation | backend | Source→destination and destination→source mutation isolation in `backend/tests/repositories/project-version-zoning_test.ts` |
| Zoning-copy failure rolls back version creation | backend | Injected late zoning failure with BOM-inclusive complete database count restoration in `backend/tests/repositories/project-version-zoning_test.ts` |
| Inaccessible source version is not copied | backend | Same-tenant wrong-group and cross-tenant non-global route cases with unchanged project/zoning counts in `backend/tests/repositories/project-version-zoning_test.ts` |
| Traceability gate is evaluated | backend + frontend | `tools/neo_dev_webhook/tests/test_scenario_traceability.py` proves the matrix denominator comes from all 48 approved scenarios; `npm run e2e:traceability` validates this matrix plus representative feature mappings |
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
