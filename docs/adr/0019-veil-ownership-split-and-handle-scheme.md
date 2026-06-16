# ADR-0019: Veil Ownership Split and Handle Scheme

## Status

Accepted

## Context

The Stage Interface Tool Frame repeatedly states that Stage Interface owns the
Public Handle Veil, presentation, compact output, and public error mapping. But
three established constraints make that claim impossible to honor locational-ly:

- The contribution model places a tool's runtime handler in its behavior-owning
  bounded context. For `music.discovery.lookup` that is `music_intelligence`
  (`RuntimeModuleOwnerArea` excludes `stage_interface`), and the handler must
  produce the final veiled public payload (ADR-0016 descriptor/handler split,
  ADR-0017 router-wraps-payload).
- The active-tree import guard forbids `music_intelligence` from importing
  `stage_interface`, and forbids `stage_interface` from importing
  `music_data_platform`.
- Handle minting is internal-anchor-to-public-id bridge logic that needs the
  internal ref (`materialRef` / `materialCandidateRef`) the handler already
  holds from `RetrievalQueryHit`.

So the veil implementation cannot physically live in `stage_interface`, and a
naive "Stage Interface owns the veil" reading contradicts both the contribution
model and the import guards. Separately, the public handle id scheme was
undecided: a registry of short opaque ids, or an authenticated encoding of the
ref into the id.

## Decision

Split the veil by concern.

1. **Cross-cutting identity veil — Stage Interface, via `HandleMintingPort`.**
   Minting a public `MusicItemHandle.id` from an internal anchor and resolving it
   back is owned and implemented by Stage Interface through a stateful
   `HandleMintingPort`: declared at the contract layer, implemented by Stage
   Interface, consumed by contributing tool handlers, wired by the composition
   root. Stage Interface is the genuine owner of the private
   `public id -> internal anchor` mapping; contributing areas never mint or
   reverse handles themselves.

2. **Per-tool description / label synthesis — contributing tool handler.**
   Label and description synthesis is tool-specific presentation, not
   cross-cutting identity, so it stays with the contributing handler. Pure
   label/description helpers live in a SEPARATE `contracts/public_music_description.ts`,
   NOT in `contracts/stage_interface.ts` — so a contributing area can reuse them
   without making its domain core stage-aware. Layering:
   `contracts/stage_interface.ts` holds Public Agent Protocol / tool-contract
   types only; `contracts/public_music_description.ts` holds pure label/description
   helpers; a contributing `stage_adapter` (e.g. `music_intelligence/stage_adapter/*`)
   imports both; the domain `core` (e.g. `music_intelligence/core/*`) imports
   neither — enforced by an architecture test that forbids `<area>/core/*`
   from importing `contracts/stage_interface.ts` or
   `contracts/public_music_description.ts`, while `<area>/stage_adapter/*` may.
   This keeps helper reuse from polluting domain core with Stage Interface DTOs.

3. **Handle id scheme.** `library` handle ids are registry-minted short opaque
   ids backed by a durable, **owner-bound** store: each binding is
   `{ publicId, ownerScope, handleKind, internalAnchor, issuedAt, expiresAt? }`,
   so a handle minted for owner A cannot resolve for owner B (owner isolation is
   load-bearing — MineMusic is owner-scoped throughout). `candidate` handle ids
   continue to resolve through the existing runtime candidate cache. Tests must
   cover: cross-owner resolution fails; a library id never equals a materialRef /
   refKey / db key; an expired candidate returns `candidate_expired`; an unknown
   handle returns a declared public error, not an internal not-found.

There is intentionally no single `PresentationPort.veil(...)` that bundles
minting with label synthesis.

## Rejected Alternatives

- **A single `PresentationPort.veil(...)`** bundling minting and label synthesis:
  rejected; it couples every caller through both and conflates cross-cutting
  identity with per-tool display formatting. The `VeilItemInput` neutral DTO it
  would require becomes a coupling point for every producing area.
- **Move the whole tool into Stage Interface** so the veil is inline: rejected
  for now; it requires lifting `RuntimeModuleOwnerArea excludes stage_interface`
  and relocating the public-scope-to-internal-pool mapping behind the Retrieval
  port. Proportionate to revisit only if presentation grows dominant.
- **Veil inline in the `music_intelligence` handler** (the frame's literal
  "handler calls query_service" reading): rejected; it puts Public Agent Protocol
  presentation logic inside a domain intelligence area and scatters the veil
  across every contributing area.
- **Authenticated encoding of the ref into the id** (`AEAD_Encrypt(materialRef)`):
  rejected; the agent treats every id as opaque and passes it back undecoded, so
  encoding the full ref plus an auth tag only lengthens ids (a token tax that
  scales with result count) for zero agent benefit. Statelessness here is bought
  with tokens the agent should not pay. This rejection is HANDLE-specific
  (handles are many-per-page); the lookup cursor is a separate one-blob-per-page,
  expiring, self-contained concern and uses authenticated encoding — see the Tool
  Frame Cursor and Pagination section.
- **Deterministic non-reversible hash of the ref**: rejected; it cannot resolve
  back to the material for future detail/save/commit tools without a store
  anyway, so the registry subsumes it.

## Consequences

- A new stateful `HandleMintingPort` plus a durable, **owner-bound**
  `opaque_id -> { ownerScope, internalAnchor, ... }` store become Stage Interface
  responsibilities; candidate handles reuse the existing runtime candidate cache.
  The registry is Stage Interface-owned **protocol-mapping infrastructure** (the
  veil's private id-to-anchor translation), NOT domain/user state. Stage
  Interface contributes its schema and repository over the Storage gateway — the
  same schema-contribution pattern Music Data Platform uses — and
  `stage_interface -> storage` is already permitted by the active-tree import
  guard (only `extension` and `music_data_platform` are forbidden). This narrowly
  scopes the frame's "Stage Interface does not own durable writes" rule to
  domain/USER state (saved/favorite/materialized candidates); the handle registry
  is the specific, non-generalizable exception.
- Contributing tool handlers consume `HandleMintingPort` (and other read ports)
  via the composition root and assemble the public payload; they never mint or
  reverse handles.
- The Tool Frame Ownership table and the "Stage Interface presentation" wording
  are corrected: Stage Interface owns the veil contract and handle minting;
  per-tool label synthesis is a contributing-handler responsibility.
- Library handles are short, opaque, stable, and reverse-resolvable; the agent
  pays no per-handle token tax for statelessness.
- Amends the veil ownership claims in the Stage Interface Tool Frame; composes
  with ADR-0016 and ADR-0017 (descriptor/handler/router split).
