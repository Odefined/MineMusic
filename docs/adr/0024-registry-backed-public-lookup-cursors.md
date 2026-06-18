# ADR-0024: Registry-Backed Public Lookup Cursors

## Status

Accepted

## Context

Phase 16D shipped `music.discovery.lookup` pagination with a Stage
Interface-wrapped public cursor. The original Stage Interface Tool Frame
specified that cursor as a self-contained AEAD token carrying the internal
Retrieval cursor, owner scope, expiry, and query replay state.

Phase 20 made the Public Agent Protocol callable over MCP stdio and made public
cursor size and multi-request transport behavior more visible. The AEAD design
keeps server-side state minimal, but it produces long public tokens, couples
cursor survival to key management, and gives future HTTP / multi-instance
transport work a separate cursor mechanism from the existing Stage
Interface-owned public handle registry.

The Public Handle Veil already established the ownership pattern for public
opaque ids: Stage Interface owns the public id, owner isolation, and private
registry mapping, while the contributing tool owns the domain-specific payload
it stores behind the veil. Lookup cursors have different lifecycle semantics
from music item handles, but they need the same public-veil ownership pattern.

## Decision

`music.discovery.lookup` public pagination uses a Stage Interface-owned,
registry-backed Public Cursor Veil.

- The public `nextCursor` remains an opaque string and is currently minted with
  an `lc_` prefix for observability only. Agents and host clients must not parse
  the value.
- A cursor page still accepts only `{ cursor, limit? }`. The agent must not
  repeat or modify `lookupText`, `targetKind`, or `scopes` while following a
  cursor.
- Stage Interface owns the `LookupCursorStore` contract, registry schema,
  records, id minting, owner-scope isolation, TTL enforcement, and public
  `invalid_cursor` / `result_window_expired` boundary.
- The lookup handler stores the normalized Retrieval replay input plus the
  internal Retrieval cursor behind the public cursor id. It re-validates the
  replay input after resolving the cursor because the store treats it as opaque
  JSON.
- The cursor store is available through `StageToolContext.lookupCursors`, like
  `StageToolContext.handleMinting`, instead of being a
  `music.discovery.lookup`-private registration dependency.
- The cursor registry is separate from the handle registry. Handles represent
  music item identity and may deduplicate stable owner/anchor pairs; lookup
  cursors represent result-window continuation state and mint a fresh id for
  each next page.
- Old `mlc1.*` AEAD cursor tokens are not a compatibility contract. They resolve
  as ordinary invalid/unknown cursors.

Short term, the Stage Interface cursor registry schema is initialized through
the same database-composition path as the Stage Interface handle registry. This
continues a known composition wart: Music Data Platform hosts the concrete
database initialization today, but it does not own cursor or handle semantics.
A later runtime-state composition cleanup may extract Stage Interface registry
schema contribution wiring.

## Rejected Alternatives

- **Keep self-contained AEAD cursors**: rejected because public cursor size,
  restart/key behavior, and future multi-instance transport semantics now matter
  more than avoiding one small runtime-state table.
- **Fold lookup cursors into `HandleMintingPort` or `handleKind = cursor`**:
  rejected because cursor continuation is not a music item handle and has
  different lifecycle, deduplication, and error semantics.
- **Create a generic registry abstraction now**: rejected because handle and
  cursor registries share an ownership pattern but not the same domain object or
  lifecycle. A premature abstraction would obscure the public contract.
- **Preserve `mlc1.*` compatibility**: rejected because these cursors are
  transient result-window state, not durable user data. A fresh first-page
  lookup is the recovery path.

## Consequences

- Public lookup cursors are short, opaque, owner-scoped ids.
- Cursor replay state persists in Stage Interface runtime state until expiry.
- `MUSIC_LOOKUP_CURSOR_KEY` and lookup-specific AEAD cursor code are no longer
  production behavior.
- `music.discovery.lookup` depends on `ctx.lookupCursors` for pagination while
  Retrieval continues to own the internal Retrieval cursor.
- Stage Interface docs and progress summaries must describe registry-backed
  lookup cursors and treat older AEAD cursor text as superseded.
