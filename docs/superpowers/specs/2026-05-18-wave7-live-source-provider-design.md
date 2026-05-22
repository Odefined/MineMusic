# Wave 7 Live Source Provider Design

## Terminology Note

This historical Wave 7 design uses the legacy `Stage Kernel` term. Current
architecture vocabulary maps that code to Session Context and Material Gate
inside Stage Modules. Stage Core now means runtime composition and lifecycle in
`src/runtime/index.ts`.

## Goal

Wave 7 validates the fixture MVP chain against one real read-only source
provider without changing MineMusic's product boundary.

The goal is not playback control, provider writeback, queue mutation, or a host
adapter. The goal is to prove that a live source can enter the existing
`SourceProvider` slot and produce honest material states and playable-link
evidence through the current Source Resolution path.

## Current Repository Evidence

- `src/contracts/index.ts` defines the `SourceProvider` contract with
  `search(...)` and `getPlayableLinks(...)`.
- `src/source/index.ts` already discovers source providers through
  `PluginRegistryPort`, calls provider search, refreshes playable links, and
  normalizes material into `confirmed_playable` or `source_only_playable`.
- `src/runtime/index.ts` currently registers a fixture provider only.
- `docs/mvp/verification-report.md` explicitly says live provider validation is
  not yet verified.

## Approaches Considered

### Recommended: Read-Only Live Source Provider Slot

Add one provider adapter that implements `SourceProvider`, plus an opt-in live
smoke test.

Trade-offs:

- It tests the real missing MVP risk: whether source-backed playable links can
  come from a live provider.
- It keeps provider behavior behind the plugin slot.
- It does not require durable storage or host-surface work.
- It depends on live endpoint availability, so the smoke test must be opt-in.

### Alternative: Host Surface First

Expose the current Tool API through a Codex or OpenClaw surface before adding a
live provider.

Trade-offs:

- It validates integration ergonomics.
- It does not prove real music source behavior because the current runtime still
  uses fixture data.
- It risks moving product logic into the host adapter too early.

### Alternative: Durable Storage First

Replace in-memory repositories before touching live source access.

Trade-offs:

- It is useful later for persistence and auditability.
- It may freeze fixture assumptions before live provider failure modes are
  known.
- It does not improve the user-facing MVP chain by itself.

## Design

Wave 7 should implement a single provider adapter in a provider-owned path, for
example `src/providers/netease/index.ts`.

The local NetEase Cloud Music API endpoint for this workspace should default to
`http://127.0.0.1:3000`, based on the user's corrected environment note. The
implementation must still verify the endpoint shape before treating the
response as provider evidence, and the base URL should remain configurable for
other environments.

The adapter will:

- implement the existing `SourceProvider` interface.
- map live search results into `MusicMaterial`.
- put provider ids, URLs, and source metadata into `sourceRefs`,
  `playableLinks`, and `evidence`.
- return `unresolved` when the live result is ambiguous or unusable.
- return `blocked` when the provider says access is unavailable.
- avoid creating canonical records directly.
- avoid executing playback, changing queues, or writing back to the provider.

Runtime composition should remain fixture-first by default. A live runtime or
factory may be added only as an explicit opt-in path, such as a separate
`createMineMusicLiveSourceRuntime(...)` or a clearly named provider registration
helper. Existing `npm test` must remain deterministic and must not depend on a
network service.

## Data Flow

```text
Tool API or SourceResolutionPort
-> Source Resolution
-> Plugin Registry source slot
-> live SourceProvider adapter
-> MusicMaterial[] with source-backed evidence
-> Source Resolution normalization
-> Stage material preparation
```

The provider adapter does not bypass Source Resolution, Stage Kernel, Canonical
Store, Event Service, Memory Service, or Effect Boundary.

## Error Handling

Expected live provider failures should become `Result<T>` errors or honest
material states:

- endpoint unavailable: `source.no_provider` or provider-specific source error.
- no playable link: `source.no_playable_link` during refresh.
- ambiguous match: `unresolved` material state.
- access or policy block: `blocked` material state or `source.blocked`.

The implementation should keep the existing stable errors where they fit. New
provider-specific error codes may use string extension codes, but must still set
`module: "source"` and `retryable` truthfully.

## Testing Strategy

Wave 7 needs three test layers:

1. adapter unit tests with local fixture payloads from the live provider shape.
2. integration tests proving the adapter can be registered through
   `PluginRegistryPort` and consumed by `SourceResolutionPort`.
3. an opt-in live smoke command that defaults to `http://127.0.0.1:3000` and is
   skipped unless live provider access is explicitly enabled.

The normal verification path remains:

```bash
npm test
npm run typecheck
git diff --check
```

The live smoke command should be separate and documented in
`docs/mvp/verification-report.md` after it exists.

## Non-Goals

- autoplay.
- provider writeback.
- playlist import or mutation.
- playback queue control.
- autonomous DJ behavior.
- Music Knowledge promotion.
- durable storage replacement.
- host-surface integration.

## Acceptance Criteria

- The live provider adapter consumes no private module internals.
- The adapter can be registered through the existing source provider slot.
- Source Resolution can surface at least one live result as
  `confirmed_playable`, `source_only_playable`, `unresolved`, or `blocked`
  without lying about playability.
- Normal tests remain deterministic and pass without live provider access.
- The live smoke result is documented separately from fixture MVP verification.
- `CURRENT_STATE.md`, `PROGRESS.md`, `INDEX.md`, and
  `docs/mvp/verification-report.md` distinguish fixture verification from live
  source validation.

## Spec Self-Review

- Placeholder scan: no `TBD` or deferred unspecified behavior remains.
- Scope check: this is one bounded source-provider validation slice, not a host
  adapter or storage migration.
- Boundary check: provider access stays behind `SourceProvider` and
  `PluginRegistryPort`.
- Verification check: deterministic tests and opt-in live smoke are separated.
