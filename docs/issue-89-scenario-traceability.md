# Issue #89 scenario traceability

Approved source: `openspec/changes/issue-89-generic-zoning-parameters/specs` at `7507e2126f639ef17047a918b9c9b51cdbaea94c`.

| Specification scenarios | Primary evidence |
| --- | --- |
| Save valid values atomically; Clear a value; Reject one invalid value without partial save | `backend/tests/routes/areas_zoning_test.ts` (atomic update, zero deletion, rollback) |
| Project has one configured Product Type; Project has multiple configured Product Types; Project has no applicable definitions | `backend/tests/routes/areas_zoning_test.ts` (project-item-type applicability and ordered aggregate) |
| Tenant user edits own project Area; Cross-tenant Area request | Existing Area route matrix plus `backend/tests/routes/areas_zoning_test.ts` (own-tenant success and non-disclosing 404/no mutation) |
| Concurrent Area edit wins once; Definition changes while editor is open | `backend/tests/routes/areas_zoning_test.ts` (revision/applicability 409 and rollback) |
| Edit multiple Product Type groups on desktop; Edit on a narrow viewport | `frontend/src/components/configurator/AreaEditModal.test.tsx`; responsive CSS is a writer preflight pending independent UI review |
| Operate a stepper accessibly; Cancel an edit | `frontend/src/components/configurator/AreaEditModal.test.tsx` |
| Mixed zero and positive values; No positive values | `frontend/src/components/configurator/AreaPolygon.test.tsx` |
| Long and numerous values; Select or drag through a summary | `frontend/src/components/configurator/AreaPolygon.test.tsx`; visual readability and drag regression remain independent UI-review gates |
| Upgrade an existing database; Existing project after upgrade | `backend/tests/repositories/zoning-parameter_test.ts` and full backend migration/test startup |
| Traceability gate is evaluated | `npm run e2e:traceability` and this matrix |
| Administrator creates a definition | `backend/tests/routes/item-types-zoning_test.ts` and real-runtime `e2e/features/issue-89-zoning-parameters.feature` |
| Non-administrator attempts configuration; Definitions are listed predictably | `backend/tests/routes/item-types-zoning_test.ts` |
| Duplicate name in one Product Type; Same name in separate Product Types; Invalid reorder is atomic | `backend/tests/repositories/zoning-parameter_test.ts` and `backend/tests/routes/item-types-zoning_test.ts` |
| Rename a used definition; Reorder used definitions | `backend/tests/repositories/zoning-parameter_test.ts` and Area aggregate route coverage |
| Deactivate a used definition; Reactivate a definition | `backend/tests/repositories/zoning-parameter_test.ts` and Area aggregate route coverage |
| Delete an unused definition; Reject deletion of a referenced definition | `backend/tests/repositories/zoning-parameter_test.ts` and route conflict coverage |
| Product Type becomes inactive; Product Type is selected again for a project | `backend/tests/routes/areas_zoning_test.ts` |

The Cucumber scenario uses the real Deno/SQLite backend and Vite frontend with Playwright. The remaining independently reviewed assertions are intentionally not claimed by the implementation writer.
