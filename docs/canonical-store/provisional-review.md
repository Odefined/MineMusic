# Provisional Review Design

Provisional Review is Canonical Maintenance's workflow for deciding whether a
provisional recording can be updated from inspected provider-attributed facts.
It is not a separate scene system and it is not a durable review-case store.

## Boundary

Provisional Review owns:

- listing provisional recording subjects available for review;
- inspecting one provisional recording in summary or detail view;
- caching inspection snapshots in process memory;
- validating apply calls against the cached inspection snapshot;
- applying `update` or `cannot_confirm`;
- strict automatic update qualification.

Provisional Review does not own:

- provider search policy outside the Knowledge service;
- Stage Interface compact output ownership;
- free-form agent identity writes;
- arbitrary merge/split/reject/defer actions;
- durable batch-review case state.

## Tools

Stage Interface exposes current review tools through `CanonicalMaintenancePort`:

- `canonical.review.list`;
- `canonical.review.inspect`;
- `canonical.review.apply`;
- `canonical.review.auto_update`.

The review instrument is visible when the session posture is
`canonical_review`. Maintenance methods enforce the review posture through
Session Context.

## Inspection

`canonical.review.inspect` returns a snapshot with:

- the provisional subject;
- outgoing and incoming canonical relations;
- provisional hints;
- neighbor and related current records;
- Knowledge Items;
- anchors;
- relation candidates;
- optional detail views for release appearances and release track positions.

Inspection snapshots are held in process memory with a short TTL. Apply uses
the stored snapshot and fails if the snapshot is absent, expired, or not the
latest snapshot for the session and subject.

## Apply

Current apply actions are:

- `update`, which selects one inspected provider recording token and results in
  an internal `activate` or `merge` effect;
- `cannot_confirm`, which records a no-update review outcome.

The apply gate validates payload shape, session posture, subject state,
inspection id, and token membership. It does not let the agent choose arbitrary
merge targets or write provider facts directly.

## Auto Update

`canonical.review.auto_update` uses internal deterministic qualification in
`src/material/store/canonical/review-qualification.ts`. Qualification is not
exposed as a recommendation score. It either updates one strictly qualified
recording or returns reason codes explaining why the subject was not qualified.

Batch auto-update state is process memory with a short TTL. It is not canonical
identity state and is not persisted.

## Related Documents

- `docs/canonical-store/design.md`
- `docs/canonical-store/ports.md`
- `docs/canonical-store/progress.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/archive/canonical-store/README.md`
