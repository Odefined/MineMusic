import type { Ref, SourceMaterial } from "../../src/contracts/index.js";

export const fixtureCanonicalRef: Ref = {
  namespace: "minemusic",
  kind: "recording",
  id: "canonical-coding-track",
  label: "Quiet Coding Track",
};

export const fixtureSourceRef: Ref = {
  namespace: "source:fixture",
  kind: "track",
  id: "fixture-track-1",
  label: "Quiet Coding Track on Fixture Source",
};

export const fixtureKnownMaterial: SourceMaterial = {
  id: "fixture-material-known",
  kind: "recording",
  label: "Quiet Coding Track",
  state: "grounded",
  sourceRefs: [fixtureSourceRef],
  playableLinks: [
    {
      url: "https://fixture.example/play/quiet-coding-track",
      label: "Play Quiet Coding Track",
      sourceRef: fixtureSourceRef,
    },
  ],
  evidence: [
    {
      kind: "fixture_source_result",
      source: fixtureSourceRef,
      confidence: 1,
    },
  ],
};

export const fixtureSourceOnlyPlayableRef: Ref = {
  namespace: "source:fixture",
  kind: "track",
  id: "fixture-track-source-only",
  label: "Source-only Coding Track on Fixture Source",
};

export const fixtureSourceOnlyPlayableMaterial: SourceMaterial = {
  id: "fixture-material-source-only",
  kind: "recording",
  label: "Source-only Coding Track",
  state: "source_only_playable",
  sourceRefs: [fixtureSourceOnlyPlayableRef],
  playableLinks: [
    {
      url: "https://fixture.example/play/source-only-track",
      label: "Play Source-only Coding Track",
      sourceRef: fixtureSourceOnlyPlayableRef,
    },
  ],
};

export const fixtureUnresolvedExplorationMaterial: SourceMaterial = {
  id: "fixture-material-unresolved-exploration",
  kind: "recording",
  label: "Unresolved Exploration Track",
  state: "exploration",
  playableLinks: [
    {
      url: "https://fixture.example/play/unresolved-exploration",
      label: "Unresolved exploration link should not be shown",
      sourceRef: {
        namespace: "source:fixture",
        kind: "track",
        id: "fixture-track-unresolved-exploration",
      },
    },
  ],
};
