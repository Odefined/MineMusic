# Canonical Store Ports

This document records the current Canonical Store port surface from
`src/ports/index.ts` and `src/material/store/canonical/**`.

## Provides

| Port | Provided to | Capabilities |
| --- | --- | --- |
| `CanonicalStorePort` | Stage Core composition, Material Store canonical reads, Source Grounding, Music Knowledge, tests | Canonical lookup, source-ref evidence lookup/write, provisional relations, and provisional hints. |
| `CanonicalMaintenancePort` | Stage Interface canonical review tools | Review list, inspect, apply, auto-update, and clear review state. |
| `CanonicalRecordRepository` | Canonical Store and Canonical Maintenance implementations | Storage-facing canonical record, relation, hint, review-state, provider-identity, and source-ref persistence. |

## `CanonicalStorePort`

| Method | Read/Write | Current use |
| --- | --- | --- |
| `get` | Read | Material Store canonical reads, Knowledge canonicalRef queries, tests. |
| `findByLabel` | Read | Material Store canonical lookup. |
| `resolveSourceRef` | Read | Source Grounding source material normalization; tracked as `AI-002`. |
| `createProvisional` | Write | Canonical Store tests and explicit provisional identity creation paths. |
| `attachSourceRef` | Write | Canonical evidence writes and tests; ordinary Source Entity binding should use Confirmed Canonical Bindings instead. |
| `recordProvisionalRelations` | Write | Provisional review/import evidence. |
| `listRelations` | Read | Knowledge canonical context and Canonical Maintenance. |
| `recordProvisionalHints` | Write | Provisional review/import evidence. |
| `listProvisionalHints` | Read | Canonical Maintenance inspection. |

## `CanonicalMaintenancePort`

| Method | Read/Write | Tool surface |
| --- | --- | --- |
| `reviewList` | Read | `canonical.review.list` |
| `reviewInspect` | Read/cache | `canonical.review.inspect` |
| `reviewApply` | Write | `canonical.review.apply` |
| `reviewAutoUpdate` | Write | `canonical.review.auto_update` |
| `clearReviewState` | Write | Internal/runtime maintenance capability, not currently a Stage Interface tool. |

## Consumes

| Consumer | Consumed canonical capability | Notes |
| --- | --- | --- |
| Material Store | `get`, `findByLabel` | Narrow canonical read surface only. |
| Stage Interface | `CanonicalMaintenancePort` | Tool definitions route through maintenance, not repositories. |
| Music Knowledge | `get`, `listRelations` | Only when a query uses MineMusic `canonicalRef`. |
| Source Grounding | `resolveSourceRef` | Current code fact; conflicts with ADR-0002 and is tracked as `AI-002`. |
| Canonical Maintenance | `CanonicalRecordRepository`, Knowledge, Event, Session Context | Owns review orchestration and writes. |

## Forbidden Dependencies

- Provider adapters must not call Canonical Store directly.
- Stage Interface must not call canonical repositories directly.
- Ordinary Material Flow should use Material Store / narrow material ports
  rather than full `CanonicalStorePort`.
- Source Entity Store and Confirmed Canonical Bindings are the ordinary
  provider-library binding path; canonical source refs must not be expanded
  into the Source Library binding mechanism.

## Guards And Tests

Current checks include:

- `test/canonical/canonical-store.test.ts`;
- `test/canonical/canonical-maintenance.test.ts`;
- `test/canonical/canonical-review-qualification.test.ts`;
- `test/storage/sqlite-canonical-store.test.ts`;
- `test/integration/canonical-persistence.test.ts`;
- `test/contracts/wave1-contracts.test.ts`.

No architecture guard currently enforces `AI-002`; that is later code/guard
work, not part of this docs-only sweep.
