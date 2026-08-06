## 1. OpenSpec and Governance

- [x] 1.1 Disable telemetry and install current Codex workflows including new, continue, fast-forward, and verify
- [x] 1.2 Document the governed lifecycle, material approval semantics, mutually exclusive transitions, and one-time bootstrap authorization
- [x] 1.3 Add and test the non-bypassable unsynced-delta archive guard

## 2. Webhook TDD and Implementation

- [x] 2.1 RED/GREEN exact marker, raw HMAC, UUID, schema, size, actor, repository/event/action/label and PR filtering
- [x] 2.2 RED/GREEN public unauthenticated GitHub revalidation immediately before task creation, plus HTTP-boundary rate/concurrency limits
- [x] 2.3 RED/GREEN multi-connection transactional enqueue, replay, ownership-token claim/lease recovery, bounded retry/dead-letter, task-ID persistence, and per-issue coalescing
- [x] 2.4 Add complete standalone receiver and consumer under tools without activation

## 3. Documentation and Verification

- [x] 3.1 Update environment examples and operator documentation; remove all product-backend coupling
- [x] 3.2 Run focused tests, formatters, linters, type checks, strict OpenSpec validation, and relevant project suites
- [x] 3.3 Record concrete review evidence; Playwright is not applicable because no UI behavior changes
