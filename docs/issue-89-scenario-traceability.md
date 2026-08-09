# Issue #89 scenario traceability

Approved source: the 35 scenarios under `openspec/changes/issue-89-generic-zoning-parameters/specs` at `7507e2126f639ef17047a918b9c9b51cdbaea94c`. “HTTP” below means a request through the Hono application; repository tests are labelled separately. Cucumber evidence uses the harness-spawned Deno/SQLite backend and Vite frontend without mocks.

| Approved scenario | Executable evidence |
| --- | --- |
| Save valid values atomically | HTTP success and repository aggregate: `backend/tests/routes/areas_zoning_test.ts`; browser save/reload: `Keyboard stepper and persistence` |
| Clear a value | Explicit zero and omitted-as-zero HTTP/repository assertions: `backend/tests/routes/areas_zoning_test.ts` |
| Reject one invalid value without partial save | HTTP 400 plus unchanged-name assertion: `backend/tests/routes/areas_zoning_test.ts` |
| Project has one configured Product Type | Repository aggregate: `backend/tests/routes/areas_zoning_test.ts` |
| Project has multiple configured Product Types | Browser/API aggregate: `Multiple Product Type groups on desktop`; component ordering: `AreaEditModal.test.tsx` |
| Project has no applicable definitions | Migration/empty aggregate compatibility: `backend/tests/config/zoning_migration_test.ts`; `AreaPolygon.test.tsx` empty summary |
| Tenant user edits own project Area | Authenticated HTTP update: `backend/tests/routes/areas_zoning_test.ts` |
| Cross-tenant Area request | Repository non-disclosing lookup plus existing full Area route authorization suite: `areas_zoning_test.ts`, `areas_test.ts` |
| Concurrent Area edit wins once | Real API clients: `Stale revision recovery`; repository stale rollback: `areas_zoning_test.ts` |
| Definition changes while editor is open | Applicability-set conflict path: `areas_zoning_test.ts`; UI 409 recovery: `AreaEditModal.test.tsx` |
| Edit multiple Product Type groups on desktop | Real browser: `Multiple Product Type groups on desktop`; component: `AreaEditModal.test.tsx` |
| Edit on a narrow viewport | Real 390×700 browser: `Narrow accessible editor`; responsive class assertion: `AreaEditModal.test.tsx` |
| Operate a stepper accessibly | Real keyboard/direct-entry persistence: `Keyboard stepper and persistence`; component bounds: `AreaEditModal.test.tsx` |
| Cancel an edit | Real browser/API no-mutation assertion: `Cancel discards drafts`; component: `AreaEditModal.test.tsx` |
| Mixed zero and positive values | Real browser reload: `Positive-only grouped summary persists after reload`; component: `AreaPolygon.test.tsx` |
| No positive values | `AreaPolygon.test.tsx` |
| Long and numerous values | Real browser SVG bound/title/overflow: `Summary overflow remains bounded and accessible`; geometry component test: `AreaPolygon.test.tsx` |
| Select or drag through a summary | `AreaPolygon.test.tsx` verifies non-target pointer behavior; real runtime summary group is non-interactive in overflow scenario |
| Upgrade an existing database | Pre-zoning fixture, preserved rows, schema/index checks and repeated startup: `backend/tests/config/zoning_migration_test.ts` |
| Existing project after upgrade | Empty zoning tables/default revision in `zoning_migration_test.ts`; no-summary component case |
| Traceability gate is evaluated | `npm run e2e:traceability`; `e2e/tests/issue-89-required-scenarios.test.ts` fails when the nine required representative real-runtime scenarios are absent |
| Administrator creates a definition | HTTP route: `item-types-zoning_test.ts`; real admin UI/API: `Administrator creates a definition` |
| Non-administrator attempts configuration | HTTP 403: `item-types-zoning_test.ts` |
| Definitions are listed predictably | HTTP ordered response: `item-types-zoning_test.ts` |
| Duplicate name in one Product Type | HTTP 400: `item-types-zoning_test.ts`; repository: `zoning-parameter_test.ts` |
| Same name in separate Product Types | Repository scoped identity: `zoning-parameter_test.ts` |
| Invalid reorder is atomic | HTTP 400 and valid-order comparison: `item-types-zoning_test.ts`; repository rejection: `zoning-parameter_test.ts` |
| Rename a used definition | Stable ID HTTP update: `item-types-zoning_test.ts`; repository identity: `zoning-parameter_test.ts` |
| Reorder used definitions | HTTP/repository ordered stable IDs: `item-types-zoning_test.ts`, `zoning-parameter_test.ts` |
| Deactivate a used definition | HTTP inactive-list semantics: `item-types-zoning_test.ts`; repository retention: `zoning-parameter_test.ts` |
| Reactivate a definition | HTTP activation and stable ID: `item-types-zoning_test.ts`; repository retention: `zoning-parameter_test.ts` |
| Delete an unused definition | HTTP 200 and sibling preservation: `item-types-zoning_test.ts` |
| Reject deletion of a referenced definition | HTTP 409/code: `item-types-zoning_test.ts`; actionable real UI/value preservation: `Referenced parameter deletion is actionable`; management component error test |
| Product Type becomes inactive | Applicability query/repository lifecycle: `areas_zoning_test.ts`, `zoning-parameter_test.ts` |
| Product Type is selected again for a project | Retained stable values/applicability aggregate: `areas_zoning_test.ts`, `zoning-parameter_test.ts` |

The real-runtime representative gate intentionally covers user-visible integration paths rather than duplicating every backend-only permutation. Every approved scenario above names concrete executable evidence; none labels a direct repository call as an HTTP test.
