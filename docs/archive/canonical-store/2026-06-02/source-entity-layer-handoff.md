> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material-store/design.md`, `docs/material-store/progress.md`, `docs/adr/0002-material-store-boundary.md`
> Use only for: Historical Source Entity handoff evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`
> Related inconsistencies: `AI-001`, `AI-002`

# Provider-Neutral Source Entity Layer Handoff

## Status

Design handoff for the next session. Do not implement directly from this file
without first turning it into a scoped design and implementation plan.

## Why This Exists

Real Provisional Review v3 testing showed that normalizing imported source
tracks directly into Canonical Recordings is too expensive for MineMusic's
current priority.

One source track can require decisions about:

- recording identity.
- release/version compatibility.
- release date source differences.
- artist-credit aliases and provider credit styles.
- classical work/movement naming.
- tracklist position.
- MusicBrainz search strategy.
- agent judgment consistency.

That is a separate data-governance system. MineMusic should not block library
import, collection, recommendation, or playable material flows on that work.

## Core Decision

Add a provider-neutral source entity layer under the Canonical Store module:

- `source_track`
- `source_release`
- `source_artist`

These are MineMusic source entities, not NetEase entities. NetEase is only the
first provider adapter that populates them.

Canonical Recordings remain separate. A `source_track -> canonical_recording`
binding is optional and exists only after identity is actually confirmed.

## Important Boundary

Do not call source entities canonical records.

The Canonical Store module may own this layer for now because it already owns
identity evidence and source-ref lookup, but source entities must stay separate
from canonical identity records.

Recommended mental model:

```text
Provider Adapter
  -> Source Entity Layer
    -> Collection / Material Resolve / Playback
    -> optional Canonical Binding
      -> Canonical Recording
```

## Provider-Neutral Entities

### Source Track

Represents one provider-owned playable or library track identity.

Candidate fields:

- `providerId`
- `sourceRef`
- `title`
- `artistLabels`
- `artistSourceRefs`
- `releaseLabel`
- `releaseSourceRefs`
- `durationMs`
- `trackPosition`
- `url`
- `providerFacts`
- `createdAt`
- `updatedAt`

Provider-specific fields belong in `providerFacts`, not in core matching rules.

### Source Release

Represents one provider-owned release/album identity.

Candidate fields:

- `providerId`
- `sourceRef`
- `title`
- `artistLabels`
- `artistSourceRefs`
- `date`
- `url`
- `providerFacts`
- `createdAt`
- `updatedAt`

### Source Artist

Represents one provider-owned artist identity.

Candidate fields:

- `providerId`
- `sourceRef`
- `name`
- `aliases`
- `url`
- `providerFacts`
- `createdAt`
- `updatedAt`

## Binding

Add optional bindings from source entities to canonical entities later.

For the first useful slice, only `source_track -> canonical_recording` matters.

Binding rules:

- absence of a binding is normal.
- import must not create a Canonical Recording just because a source track
  exists.
- automatic MusicBrainz normalization is not the default import path.
- Canonical Maintenance can later add or change bindings, but should be
  low-frequency maintenance, not the main library ingestion flow.

## Library Import Flow

New target flow:

1. Provider adapter reads platform library facts.
2. Library Import upserts provider-neutral source entities.
3. It links source tracks to source releases and source artists using source
   refs.
4. Collection/library state can point at source tracks without requiring a
   Canonical Recording.
5. Material Resolve can create playable material directly from source tracks.
6. Canonical identity can enrich this path when a confirmed binding exists.

This replaces the current pressure to create provisional Canonical Recordings
for every imported source track.

## Collection And Material Resolve Implication

Current Collection Service is canonical-only. The next session must decide the
smallest change that lets a user library item point at a source track.

Likely direction:

- add a source-target option to collection/library membership, or
- keep Collection canonical-only but add a separate library-source membership
  path.

Do not silently force source tracks through Canonical Recordings just to satisfy
the current CollectionItem shape.

## What Not To Do

- Do not resume Provisional Review v3 as the main path.
- Do not expand real review runs to 50 or 200 records.
- Do not make NetEase-specific tables such as `netease_track`.
- Do not treat MusicBrainz lookup as required during source library import.
- Do not require source tracks to have canonical recording bindings.
- Do not make agent-facing review ergonomics the next project focus.

## Implementation Sketch

Suggested next-session sequence:

1. Update Canonical Store design docs with the source entity layer and optional
   binding boundary.
2. Add an implementation plan for provider-neutral source entity storage.
3. Add contracts for `SourceTrack`, `SourceRelease`, `SourceArtist`, and source
   entity repository methods.
4. Add in-memory and SQLite source entity persistence.
5. Change Library Import to upsert source entities first.
6. Stop creating provisional Canonical Recordings as the default outcome of
   source-track import.
7. Add a path for Collection / Material Resolve / playback to use source tracks
   directly.
8. Keep Canonical Maintenance as an optional enhancement path.

## Current Evidence To Read First

- `docs/canonical-store/progress.md`
  - records the Provisional Review v3 pause and 20-record validation findings.
- `docs/canonical-store/provisional-review-v3.md`
  - useful only as evidence of what became too complex.
- `docs/library-import/design.md`
  - current import design still routes imported source tracks toward Canonical
    Store source-ref/provisional canonical records.
- `docs/collection-service/design.md`
  - current Collection Service is canonical-only.
- `src/material_store/canonical/index.ts`
  - current Canonical Store public path.
- `src/library_import/index.ts`
  - current import orchestration.
- `src/material_resolve/index.ts`
  - current canonical-first material resolution.

## Suggested Prompt For The Next Session

```text
Project: /Users/jiajuzang/Documents/Codex/MineMusic

Read:
- AGENTS.md
- docs/canonical-store/source-entity-layer-handoff.md
- docs/canonical-store/progress.md
- docs/library-import/design.md
- docs/collection-service/design.md
- docs/canonical-store/design.md

Goal:
Stop treating source track import as provisional Canonical Recording
normalization. Design the first provider-neutral Source Entity Layer inside the
Canonical Store module: source_track, source_release, source_artist, and
optional source_track -> canonical_recording binding.

Do not resume Provisional Review v3 or real review batch testing. The current
priority is getting source library, collection, recommendation, and playable
material flows back onto a simpler path.

Start with a scoped design/implementation plan. Do not implement until the plan
is checked against existing contracts and module boundaries.
```
