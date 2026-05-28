# NetEase Platform Library Provider Implementation Plan

## Goal

Implement a NetEase provider for the `platform_library` capability slot.

This provider reads account-scoped NetEase library facts and maps them into the
generic `PlatformLibraryProvider` contract. It does not import into MineMusic,
write Canonical Store records, write Collection items, or decide what the user
wants to import.

## Sources Of Truth

- `src/contracts/index.ts` owns the `PlatformLibraryProvider` TypeScript
  contract.
- `docs/platform-library-provider/design.md` owns the generic slot rules.
- `docs/library-import/design.md` owns import/update orchestration rules.
- `src/providers/netease/index.ts` owns NetEase adapter behavior.

## Boundaries

- NetEase payload field names are adapter-internal.
- Generic slot output uses only `PlatformLibraryItem`,
  `PlatformLibraryPreview`, `PlatformLibraryReadResult`, and related shared
  contract types.
- Library Import must not inspect NetEase-specific response fields or
  provider-specific `sourceRef.kind` values.
- The NetEase provider may implement both `source` and `platform_library`
  slots, but those slot contracts stay separate.

## First Slice

Readable areas:

| Area | Item kind | Target kind |
| --- | --- | --- |
| `saved_source_tracks` | `saved_source_track` | `recording` |
| `saved_source_releases` | `saved_source_release` | `release` |
| `saved_source_artists` | `saved_source_artist` | `artist` |

Non-readable areas:

| Area | First-slice behavior |
| --- | --- |
| `playlists` | Return `unsupported` for import/read. |
| `listening_history` | Return `unsupported` for import/read. |

`preview` may return lightweight samples. Samples must not include `sourceRef`,
`addedAt`, `canonicalHints`, raw provider metadata, Canonical Store status, or
Collection status.

`readItems` must return stable `sourceRef` values for readable items.

## Implementation Tasks

### Task 1: Reuse NetEase Request Infrastructure

- **File**: `src/providers/netease/index.ts`
- **Description**: Keep one NetEase requester shape for both source and
  platform-library providers.
- **Details**:
  - Keep `defaultNetEaseBaseUrl`.
  - Keep injectable `requestJson` for deterministic tests.
  - Reuse only adapter-internal payload parsing helpers.
  - Do not expose NetEase payload field names through shared contract types.
- **Dependencies**: None.

### Task 2: Add Provider Factory

- **File**: `src/providers/netease/index.ts`
- **Description**: Export `createNetEasePlatformLibraryProvider(...)`.
- **Details**:
  - Return `PlatformLibraryProvider`.
  - Use `id: "netease"`.
  - Implement `preview(input)`.
  - Implement `readItems(input)`.
  - Accept the same `baseUrl` and `requestJson` injection pattern as the source
    provider.
- **Dependencies**: Task 1.

### Task 3: Resolve Provider Account Identity

- **File**: `src/providers/netease/index.ts`
- **Description**: Return provider account identity when the local NetEase
  service can expose it.
- **Details**:
  - If `providerAccountId` is supplied, read that account when the local API can
    support explicit account reads.
  - If no account can be proven, return a structured `login_required` issue.
  - If several accounts are possible and no default account is known, return
    `account_selection_required`.
  - Do not store credentials, cookies, or passwords.
- **Dependencies**: Task 2.

### Task 4: Map Readable Areas

- **File**: `src/providers/netease/index.ts`
- **Description**: Map NetEase account-library responses into generic
  `PlatformLibraryItem` records.
- **Details**:
  - `saved_source_tracks` items use stable NetEase track refs as provider
    `sourceRef` values.
  - `saved_source_releases` items use stable NetEase album refs as provider
    `sourceRef` values.
  - `saved_source_artists` items use stable NetEase artist refs as provider
    `sourceRef` values.
  - `label` and `canonicalHints` use generic names only.
  - `canonicalHints` may include `label`, `artistLabels`,
    `artistSourceRefs`, `releaseLabel`, `releaseSourceRef`, `releaseDate`,
    and `durationMs` when the adapter can derive them.
  - Do not include raw provider payloads or provider-specific metadata.
- **Dependencies**: Task 3.

### Task 5: Implement Preview

- **File**: `src/providers/netease/index.ts`
- **Description**: Return availability, counts, and lightweight samples for
  requested areas.
- **Details**:
  - Default requested areas to the first-slice readable areas unless discovery
    is requested.
  - Discovery may also report `playlists` and `listening_history` as
    unsupported.
  - Use `exact`, `at_least`, or `unknown` count certainty honestly.
  - Respect `sampleLimitPerArea`.
  - Samples carry only `label`, optional `itemKind`, optional `targetKind`, and
    optional `artistLabels`.
- **Dependencies**: Task 4.

### Task 6: Implement Read Items

- **File**: `src/providers/netease/index.ts`
- **Description**: Return item results for requested readable areas.
- **Details**:
  - Complete area reads use `status: "complete"`.
  - Area failures do not force global failure when other requested areas
    succeed.
  - Unsupported areas return an area result with `status: "unavailable"` and a
    standard issue.
  - Partial provider reads use `status: "partial"` and a `partial_read` issue.
- **Dependencies**: Task 4.

### Task 7: Map Provider Issues

- **File**: `src/providers/netease/index.ts`
- **Description**: Convert adapter failures into standard
  `PlatformLibraryIssueCode` values.
- **Details**:
  - Network or local API unavailable: `provider_unavailable`.
  - Timeout: `timeout`.
  - Not logged in: `login_required`.
  - Unsupported area: `scope_unsupported`.
  - Malformed local API response: `malformed_response`.
  - Rate limiting, if exposed by the local API: `rate_limited`.
- **Dependencies**: Tasks 5 and 6.

### Task 8: Add Deterministic Tests

- **File**: `test/providers/netease-platform-library-provider.test.ts`
- **Description**: Cover provider behavior with fixture responses.
- **Details**:
  - Preview returns supported readable areas, counts, and lightweight samples.
  - Read returns `saved_source_track`, `saved_source_release`, and `saved_source_artist`
    items.
  - Readable items include stable `sourceRef` values.
  - Samples do not include `sourceRef`.
  - Unsupported areas are reported without pretending they are readable.
  - Login, provider-unavailable, malformed-response, and partial-read paths use
    standard issue codes.
  - The provider can be registered through `slot: "platform_library"`.
- **Dependencies**: Tasks 2-7.

### Task 9: Wire Test Runner And Docs

- **Files**:
  - `test/run-stage-core-tests.ts`
  - `docs/source-providers/netease.md`
  - `docs/library-import/progress.md`
- **Description**: Make the new deterministic tests part of `npm test` and
  record the provider scope.
- **Details**:
  - Add the new test module to the test runner.
  - Document that the NetEase adapter now has two slot providers: `source` and
    `platform_library`.
  - Keep live platform-library smoke testing out of the first slice.
- **Dependencies**: Task 8.

## Verification

Run:

```bash
npm test
git diff --check
```

Search checks:

```bash
rg -n "CanonicalStore|Collection|LibraryImport" src/providers/netease
rg -n "raw|sampleItems" src test docs/platform-library-provider docs/library-import
```

Expected outcomes:

- NetEase platform-library provider tests pass.
- Existing NetEase source provider tests still pass.
- No provider code imports Canonical Store, Collection Service, or Library
  Import.
- Generic slot docs still avoid NetEase payload field names.

## Non-Goals

- Implementing Library Import Service.
- Writing Canonical Store records.
- Writing Collection items.
- Importing or mutating playlists.
- Importing listening history.
- Writing back to NetEase.
- Choosing import scope for the user.
