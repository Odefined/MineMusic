# Architecture Inconsistency Log

This document records architecture inconsistencies found during the
documentation/code alignment sweep.

This is not a code-fix plan. The sweep is docs-only. Source-code fixes, test
changes, schema changes, generated artifact changes, and architecture-guard
changes belong in later explicit code-fix slices.

## How To Use This Log

Add an entry whenever current authority documents, archived architecture
evidence, code imports/call paths, ports, tests, or architecture guards appear
to disagree.

This is a live ledger. Record inconsistencies when they are discovered during
an area sweep rather than waiting for the final manual audit. Open entries do
not block continuing documentation cleanup for the current area, but they do
block a final claim that project documentation is fully aligned with
architecture and code.

During the documentation sweep, update current documents to describe observed
code behavior as the current implementation fact. If that behavior conflicts
with accepted architecture or another current authority document, record the
conflict here. This log preserves the disagreement; it does not authorize code
fixes during the docs-only sweep.

Use stable IDs for entries: `AI-001`, `AI-002`, and so on. When a current
authority document describes a current implementation fact that is also an open
architecture inconsistency, add a short note in that document linking back to
the relevant log entry by ID. The current document should state the code fact;
this log should carry the disagreement, classification, and follow-up.

An architecture inconsistency is a conflict where two or more evidence sources
would lead a reader or agent to make different architecture, implementation,
review, tool-calling, verification, or archival decisions. Different wording or
different levels of detail are not enough; the disagreement must affect action.

Each entry must classify the inconsistency before choosing a resolution:

- `code-violates-accepted-architecture`
- `architecture-doc-stale`
- `area-doc-stale`
- `progress-state-stale`
- `archive-evidence-only`
- `temporary-exception`
- `needs-adr`
- `needs-later-code-fix`

Use the drift adjudication rules in
`docs/maintenance/documentation-architecture.md`.

This log is separate from
`docs/maintenance/documentation-alignment-audit.md`. The alignment audit records
document disposition. This log records architecture disagreement. Cross-link
with `AI-*` IDs when a document-disposition row is related to an architecture
inconsistency.

## Open Inconsistencies

| ID | Area | Summary | Evidence | Classification | Docs action in this sweep | Later code action | Owner/status |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Resolved Inconsistencies

| ID | Area | Summary | Resolution | Evidence | Closed by |
| --- | --- | --- | --- | --- | --- |
| `AI-001` | Material Store / Collection Service | ADR-0002 said Collection remains canonical-only unless a future decision changed the boundary, while current code and root architecture describe materialRef-backed Collection items. | ADR-0003 accepts materialRef-backed CollectionItems and supersedes only ADR-0002's canonical-only Collection consequence. | `docs/adr/0003-materialref-backed-collections.md`; `docs/adr/0002-material-store-boundary.md`; `src/collection/index.ts`; `docs/collection-service/ports.md`; `CURRENT_STATE.md` | ADR decision slice, 2026-06-02 |
| `AI-002` | Material Store / Canonical Store / Source Grounding | ADR-0002 said ordinary business modules should stop using `CanonicalStorePort.resolveSourceRef` / `attachSourceRef`, but Source Grounding received `CanonicalStorePort` and called `resolveSourceRef`. | Source Grounding now receives `SourceGroundingEvidenceStorePort`, reads confirmed canonical bindings for canonicalRef normalization, persists source evidence through the same narrow port, and no longer imports or calls Canonical Store source-ref APIs. | `src/source/index.ts`; `src/ports/index.ts`; `src/stage_core/compose.ts`; `test/source/source-grounding.test.ts`; `test/providers/netease-source-provider.test.ts`; `test/architecture/material-boundary.test.ts`; `docs/material-store/ports.md`; `docs/canonical-store/ports.md` | Code boundary slice, 2026-06-02 |

## Final Manual Audit Result

Date: 2026-06-02

Scope checked:

- root authority documents: `README.md`, `INDEX.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`, `PROGRESS.md`, `CONTEXT.md`;
- accepted ADRs: `docs/adr/0001-stage-core-runtime-composition.md`,
  `docs/adr/0002-material-store-boundary.md`, and
  `docs/adr/0003-materialref-backed-collections.md`;
- current area `design.md`, `ports.md`, and `progress.md` documents created or
  updated during the sweep;
- archived architecture evidence under `docs/archive/**`;
- representative code facts for Stage Core, Stage Interface, Material Store,
  Collection Service, Library Import, providers, Knowledge, and host/server
  runtime paths already checked during area phases.

Result:

- No new `AI-*` entries were found during root consolidation.
- `AI-001` and `AI-002` were later resolved on 2026-06-02 and are recorded in
  `Resolved Inconsistencies`.
- Current authority docs now describe ADR-0003's materialRef Collection
  decision and Source Grounding's `SourceGroundingEvidenceStorePort` boundary.

## Final Manual Audit Checklist

- Review `ARCHITECTURE.md` against accepted ADRs.
- Review current area `design.md` files against `ARCHITECTURE.md`.
- Review current area `ports.md` files against `src/ports/index.ts`.
- Review code imports and call paths against area `ports.md` files.
- Review architecture guards against documented forbidden dependencies.
- Review archived architecture evidence for unresolved disagreements.
- Move every remaining disagreement into `Open Inconsistencies`.
- Move resolved disagreements into `Resolved Inconsistencies` with evidence.
