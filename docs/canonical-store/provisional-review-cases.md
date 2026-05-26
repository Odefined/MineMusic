# Provisional Review V1 Case Calibration

This document records a real-data calibration pass for Provisional Review v1
recording decisions. It is a companion case note for
`docs/canonical-store/provisional-review-v1.md`; it does not replace that
design.

## Calibration Boundary

Run date: 2026-05-26.

Local source path:

- NetEase local API at `http://127.0.0.1:3000`.
- `createNetEasePlatformLibraryProvider(...)`.
- `createLibraryImportService(...)`.
- in-memory Canonical Store, Collection, Event, and Library Import
  repositories.

The run bounded `/likelist` to 10 real saved NetEase track ids from the signed-in
account, then let the existing NetEase provider call live `/song/detail` for the
selected ids. The Library Import path produced the local facts; no hand-written
inspection fixture was used.

Import result:

```text
batch=calibration-batch-1
status=completed
importedItems=10
canonicalRecordsCreated=10
canonicalRecordsReused=0
canonicalRecordsUnresolved=0
collectionItemsAdded=10
```

The 10 imported recordings created 32 local canonical records total: 10
provisional recordings plus linked provisional artist and release records. For
each recording, Library Import preserved the NetEase `source:netease:track`
source ref, canonical hints, import provenance, and provisional relations:

```text
performed_by
appears_on_release
has_duration_ms
```

MusicBrainz structured facts were queried through the MusicBrainz web service
shape used by the provider design:

- recording search with title, artist, and when available release field context.
- recording lookup with `artist-credits`, `isrcs`, `releases`, and `work-rels`.
- one release lookup for the top candidate with `media`, `recordings`,
  `artist-credits`, `isrcs`, and `release-groups` to inspect tracklist context.

## Case Table

`Activate?` is the agent calibration judgment from the imported provisional
record plus the queried MusicBrainz facts. `Merge?` follows v1 strictly: merge
is possible only when inspect returns an existing current canonical recording
that already carries the exact selected MusicBrainz recording ref.

| NetEase track | Local facts from import | MusicBrainz candidates observed | Activate? | Merge? |
| --- | --- | --- | --- | --- |
| `22559034` "Everything In Its Right Place" - Radiohead | Release hint `Kid A`; duration `251426`; relations `performed_by: Radiohead`, `appears_on_release: Kid A`, `has_duration_ms: 251426`. | Top candidates were `musicbrainz:recording:16584b67-6df2-47fb-b44e-5e96caadeec0` and `8d474644-fec4-4904-8343-3450e6f51356`. Both had title/artist and `Kid A` release appearances, but durations `364080` and `402853`, distinct ISRCs, and disambiguations indicating live/session material. | No. Title/artist/release search score is not enough when duration and disambiguation contradict the NetEase source. Need a better MB recording candidate, likely from release tracklist search for the studio album track. | No in this run. A v1 merge would require an inspected current recording carrying the exact selected MB recording ref. |
| `17893755` "Spanish Sahara" - Foals | Release hint `Total Life Forever`; duration `409560`; relations for Foals, release, and duration. | Candidate `musicbrainz:recording:8f7c2bd2-297f-4e50-9d88-27f0b2bf309b` had title `Spanish Sahara`, artist credit Foals, duration `409320`, release appearance `Total Life Forever`, and matching tracklist entry. ISRC was absent. Candidate `43d8edac-8af3-4b65-ae14-1c023d8b9cbf` was `Spanish Sahara (sonar)`, duration `80306`, ISRC `GBAHT1000083`. | Yes. Sufficient non-label reasons: `artist_credit`, `duration`, `release_appearance`, and `tracklist_context`. Missing ISRC does not block when other inspected non-label facts converge. | No current duplicate target was inspected. |
| `2067378971` "グッドバイ" - toe | Release hint `New Sentimentality - EP`; duration `454026`; relations for toe, release, and duration. | Top candidates were `f5dbff67-fecc-4965-ad7d-4925668c7440` and `828018d7-0f5b-4ea0-adf5-232188597213`; both were `グッドバイ` by toe, but disambiguated as music video material, with duration `269000` or missing duration and no NetEase release match. | No. Same Japanese title and artist are not enough. Need the correct recording with duration/release/tracklist support for `New Sentimentality - EP` or another inspected explanation for the source release mismatch. | No current duplicate target was inspected. |
| `22770026` "The Everlasting Guilty Crown" - EGOIST | Release hint `Extra terrestrial Biological Entities`; duration `326960`; relations for EGOIST, release, and duration. | Candidate `musicbrainz:recording:473b5e75-8a5e-48a9-a2a8-8bf661888efe` had title/artist, ISRC `JPE301104202`, album-mix disambiguation, release appearances on `Extra terrestrial Biological Entities`, a work link, and tracklist duration `326960`. Candidate `ed2b2b81-ed2d-4404-8a1e-674b46d4fc69` was a `TV Edit` music-video candidate at `91000`. | Yes. Sufficient non-label reasons: `artist_credit`, `duration`, `isrc`, `release_appearance`, and `tracklist_context`. The shorter TV edit is a useful negative comparator. | No current duplicate target was inspected. |
| `495637` "心拍数#0822" - 一之瀬ユウ / 初音ミク | Release hint `Glorious World`; duration `318906`; relations for both artists, release, and duration. | The bounded MusicBrainz field search returned no top recording candidates. | No. Source relations and duration are useful local facts, but v1 activation needs an inspected same-kind MusicBrainz recording ref plus at least two supporting reason kinds. This case needs better alias/romanization search or another structured MB candidate. | No selected MB recording ref, so merge is impossible. |
| `2687578176` "My Crime 2020" - 惘闻 | Release hint `电影《追幸福的人》原声音乐`; duration `371000`; relations for 惘闻, release, and duration. | The bounded MusicBrainz field search returned no top recording candidates. | No. The case is useful for Chinese/local soundtrack coverage, but activation cannot proceed without a same-kind MB recording ref. | No selected MB recording ref, so merge is impossible. |
| `5027854` "Deborah's Theme" - Ennio Morricone | Release hint `Once Upon a Time In America (Original Motion Picture Soundtrack)`; duration `264706`; relations for Ennio Morricone, release, and duration. | Candidate `musicbrainz:recording:7715fd26-634d-4974-ac16-d87d7c13ca02` had title `Deborah's Theme`, artist credit Ennio Morricone, duration `266466`, soundtrack release appearances including localized titles, work link, and a tracklist entry. Candidate `129e5ca4-9e22-40ff-8a94-0bd3ed52c687` was combined `Deborah's Theme / Amapola`, duration `371800`. ISRCs were absent. | Yes, if the agent explicitly treats the `1760 ms` duration difference as close in the presence of release and tracklist context. Sufficient reason kinds: `artist_credit`, `duration`, `release_appearance`, `tracklist_context`. | No current duplicate target was inspected. |
| `1060914` "Nocturne No. 2 in E Flat Major, Op. 9, No. 2" - Arthur Rubinstein | Release hint `The Chopin Collection: The Nocturnes`; duration `266693`; relations for Arthur Rubinstein, release, and duration. | Candidate `musicbrainz:recording:0f853af2-331c-4bcc-9d88-967f86356908` had matching artist, ISRC `USBC19802655`, work link, several release appearances including `The Chopin Collection: The Nocturnes`, and tracklist length `266693`. Candidate `e23f3842-8126-491c-a965-7800d88a5562` had same title/artist/work and close duration `267533`, but appeared on `Selections From the Chopin Collection`. | Yes for `0f853af2-331c-4bcc-9d88-967f86356908`. This is the clearest "same title/artist, multiple MB recordings" case: release and tracklist facts select the candidate. | No current duplicate target was inspected. |
| `440101439` "GHOST" - かめりあ | Release hint `Cyphisonia E.P.`; duration `349000`; relations for かめりあ, release, and duration. | Candidate `musicbrainz:recording:0d9b382f-175e-4651-b170-207289bcd757` had exact title, Japanese artist credit, exact duration, ISRC `TCJPE1679429`, multiple release appearances including `Cyphisonia E.P.` and `Cyphisonia`, and a matching tracklist entry. Candidate `57e843b3-238d-4c66-b1cb-bba6e984b89b` was `GHOST-NOVA`, duration `274000`, ISRC `JPC231800197`, and different releases. | Yes. Sufficient reason kinds: `artist_credit`, `duration`, `isrc`, `release_appearance`, and `tracklist_context`. This also shows one MB recording can appear on several releases. | No current duplicate target was inspected. If an active current recording already carried `0d9b382f-175e-4651-b170-207289bcd757`, v1 should merge into that target rather than activate. |
| `2048604695` "月 feat. ヰ世界情緒" - Guiano / ヰ世界情緒 | Release hint `花鳥風月`; duration `214360`; relations for Guiano, ヰ世界情緒, release, and duration. | The bounded MusicBrainz field search returned no top recording candidates. | No. This is a mixed Japanese title/featured-artist case where local source facts are strong but v1 cannot activate without an inspected same-kind MB recording ref. | No selected MB recording ref, so merge is impossible. |

## Coverage Notes

- Same title/artist with multiple plausible MB recordings: `グッドバイ`, the
  Rubinstein Nocturne, and the Radiohead case.
- Same MB recording appearing on multiple releases: `GHOST`, the Rubinstein
  Nocturne, `The Everlasting Guilty Crown`, and `Deborah's Theme`.
- Chinese/Japanese/English/romanized or alias pressure: `GHOST`, `グッドバイ`,
  `心拍数#0822`, `月 feat. ヰ世界情緒`, `My Crime 2020`, and English soundtrack or
  classical titles.
- Duration close but not exact: `Spanish Sahara` (`240 ms` difference),
  `Deborah's Theme` (`1760 ms` difference), and the Rubinstein case where the
  recording duration was rounded but the release tracklist length matched.
- ISRC present, missing, and conflicting candidates: present on `GHOST`,
  `The Everlasting Guilty Crown`, the Rubinstein candidate, and incorrect or
  competing candidates such as `GHOST-NOVA`; missing on otherwise plausible
  cases such as `Spanish Sahara` and `Deborah's Theme`.
- NetEase release differing from MB release naming while the recording may still
  be the same: `Deborah's Theme` has localized soundtrack release titles;
  `GHOST` appears on both `Cyphisonia E.P.` and `Cyphisonia`;
  `The Everlasting Guilty Crown` has casing/edition variation across release
  appearances.

## Stage Context Guidance From Cases

Stage Context guidance should teach the agent to compare inspected facts, not
to trust search ordering.

Recommended guidance:

- Treat MusicBrainz search score as retrieval relevance only. It does not count
  as a support reason kind.
- Never activate from title equality alone, even when title, artist, release
  text, and search score all look strong.
- Use `artist_credit` as support only when the credited artist identity is
  plausible against local artist relations. It is not a substitute for duration,
  release, ISRC, or tracklist facts.
- Use duration as a tolerance judgment, not an exact-string rule. Small
  differences can support activation when release or tracklist context also
  agrees; large differences or edit/live/video disambiguations should block
  activation.
- Use ISRC as strong support for the selected MB recording, but absence of ISRC
  does not block activation when other non-label facts converge. Distinct ISRCs
  across candidate recordings are a warning to choose carefully, not a merge
  basis.
- Use release appearance as context, not as identity proof by itself. A wrong
  live/video candidate can still have a release appearance with a matching
  title.
- Prefer release tracklist context over broad release appearance when available:
  a track position and track length that represent the selected recording are
  stronger than a release title alone.
- Work links are useful supporting context, especially in classical cases, but
  two recordings can share the same work. Work links must not select a recording
  without recording-level facts.
- For multilingual titles, featured artists, romanization, and aliases, do not
  ask the Gate to understand equivalence. The agent may reason about the
  equivalence in `reason`, but the applied decision must still cite inspected
  refs, Knowledge Item ids, anchors, and support reason kinds.
- If the selected MB recording ref is absent, do not activate. Search again with
  better structured context or leave the provisional recording unapplied.

## V1 Decision Conclusions

Activate is calibrated as a positive decision only when the agent can name one
selected `musicbrainz:recording` ref and at least two non-label
`supportingReasonKinds` from inspected facts.

These cases suggest the most useful positive combinations are:

- `artist_credit` + `duration` + `release_appearance`.
- `artist_credit` + `duration` + `tracklist_context`.
- `artist_credit` + `isrc` + `tracklist_context`.
- `artist_credit` + `release_appearance` + `work`-like context is not enough by
  itself because v1 does not have a `work_link` support reason kind and work
  identity can be shared by multiple recordings.

Merge remains deliberately narrower than activation. In the isolated run no
case had an existing current canonical recording with a shared MusicBrainz
recording ref, so the agent should not choose merge for any of the 10 imported
provisional records.

The merge calibration rule is:

```text
Choose merge only when inspect shows both:
1. the provisional subject is supported by selectedProviderRef, and
2. a related current recording target already carries the exact same
   selectedProviderRef.
```

Same title, same artist credit, close duration, same ISRC, same release
appearance, same work, or same tracklist context can support activation. None
of those facts can create a v1 merge target without the shared MusicBrainz
recording ref on an inspected current canonical recording.
