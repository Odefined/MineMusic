# Progress

This is a project-level milestone index. Area-level status and verification
details live in area `progress.md` files listed in `INDEX.md`.

## 2026-05-17

- Created the original MVP documentation pack and TypeScript foundation.
- Added shared contracts, public ports, in-memory repositories, Plugin
  Registry, core capability skeletons, Stage Modules, Stage Interface, fixture
  end-to-end slice, and MVP verification/final-review evidence.

## 2026-05-18

- Added the first read-only NetEase source provider and opt-in live smoke path.
- Added Codex-facing MCP and skill work that later evolved into the current
  skill plus global MCP client boundary.

## 2026-05-22

- Captured a Stage Interface architecture review, now archived under
  `docs/archive/architecture-reviews/`.

## 2026-05-23

- Established the current architecture vocabulary: MineMusic Server,
  Stage Core, Stage Interface, Stage Modules, Core Capabilities, Plugin Slots,
  and Storage.
- Added ADR-0001 for the Stage Core runtime-composition naming decision.
- Started Canonical Store durable-storage and boundary documentation.

## 2026-05-24

- Implemented SQLite-backed Canonical Store storage and policy hardening.
- Added Canonical Store progress/status tracking and persistence tests.

## 2026-05-25

- Added Collection Service design and implementation foundation.
- Added Platform Library Provider slot design and NetEase platform-library
  planning.
- Added first Library Import design and early implementation slices.

## 2026-05-26

- Moved runtime ownership to the long-lived MineMusic server process.
- Added streamable HTTP MCP server operation and launchd documentation.
- Corrected Codex integration to skill plus global MCP client.
- Advanced Knowledge Slot and MusicBrainz provider implementation, including
  relation-object output.

## 2026-05-29

- Added ADR-0002 for the Material Store boundary.
- Moved Source Entity Store, Source Library, Library Import/Update state,
  confirmed bindings, and material-level storage under the Material Store
  architecture.
- Added SQLite-backed Material Registry, Source Entity Store, Library Import,
  and related storage paths.

## 2026-05-30

- Added Material Registry with stable `materialRef` identity, redirects,
  source/canonical indexes, merge survival behavior, relations, and activity.
- Integrated Material Resolve with Material Store materialization and material
  relation filtering.
- Added Material Query, Related, Policy, Sort, Select, and query-ready Source
  Library / Collection flows.

## 2026-05-31

- Completed materialId migration for public agent-facing material handles.
- Hardened recommendation posture around playable-link evidence, identity
  confidence, resolve diagnostics, policy/sort/select substrate, and
  recommendation presentation.
- Added `memory.feedback.record` and feedback binding to presented material
  cards.

## 2026-06-01

- Moved compact material output ownership under Stage Interface.
- Consolidated Material bounded context under `src/material/**`.
- Narrowed Material Query / Resolve / Stage Interface material-store
  dependencies and extracted projection/materialization boundaries.

## 2026-06-02

- Removed old public `library.source.list` and normalized public tool language
  around `materialId`, pools, Material Resolve, and Recommendation Presentation.
- Added documentation architecture rules, alignment phase plan, audit ledger,
  and architecture inconsistency ledger.
- Started `codex/documentation-alignment-sweep` as a docs-only branch.
- Completed Phase 0 foundation.
- Completed Phase 1 Stage Interface public-surface alignment.
- Completed Phase 2 Material Flow alignment.
- Completed Phase 3 Material Store and Canonical Store alignment, recording
  open inconsistencies `AI-001` and `AI-002`.
- Completed Phase 4 Collection Service and Library Import alignment.
- Completed Phase 5 Providers, Knowledge, Host Adapters, and Operations
  alignment.
- Completed Phase 6 root consolidation and final manual audit, archiving the
  original MVP docs, root proposal/plans, Stage Core refactor plans, and
  architecture-review evidence.
- Resolved `AI-001` by accepting materialRef-backed Collections in ADR-0003.
- Resolved `AI-002` by moving Source Grounding canonicalRef normalization to
  `SourceGroundingEvidenceStorePort` confirmed canonical bindings and adding a
  Source Grounding architecture guard.
- Addressed PR #44 review feedback by correcting Library Import / Collection
  documentation drift and narrowing Library Import to
  `LibraryImportMaterialStorePort` with architecture guards.
- Completed PR 4 Collection Item boundary cleanup: pre-code docs sync,
  CollectionItem compatibility-field deletion, collection query fallback
  removal, compact Stage Interface collection outputs, guards, and final docs
  sync.

## 2026-06-03

- Narrowed Material-facing collection capabilities to
  `MaterialQueryCollectionReadPort` and `MaterialPolicyCollectionBlockPort`.
- Routed Resolve relation and collection-block projection through
  `MaterialPolicyEvaluatorPort` with internal `material_resolution`.
- Extended `MaterialResolveStatus` with `wrong_version` and `not_playable`
  and added architecture guards that keep Query/Policy/Resolve off broad
  `CollectionPort`.
- Moved durable source-backed MaterialRecord binding for imported library items
  into Library Import by extending `LibraryImportMaterialStorePort` with
  `getOrCreateBySourceRef` and materializing each imported `sourceRef` during
  Source Library persistence.
- Enforced the MVP invariant that
  `putConfirmedCanonicalBinding(...)` must leave a canonical-confirmed
  `MaterialRecord` containing both `canonicalRef` and `sourceRef`.

## Next

- Implement the documented docs guard (`npm run check:docs` /
  `scripts/check-docs.mjs`) when a code-change slice is opened for tooling.
- Choose the next product/runtime slice from the current area progress docs.
