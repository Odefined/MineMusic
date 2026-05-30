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

export const fixtureExplorationMaterial: SourceMaterial = {
  id: "fixture-material-exploration",
  kind: "recording",
  label: "Interesting But Unconfirmed Track",
  state: "exploration",
  sourceRefs: [
    {
      namespace: "source:fixture",
      kind: "track",
      id: "fixture-track-exploration",
    },
  ],
  playableLinks: [
    {
      url: "https://fixture.example/play/unconfirmed-track",
      label: "Unconfirmed link should not be shown",
      sourceRef: {
        namespace: "source:fixture",
        kind: "track",
        id: "fixture-track-exploration",
      },
    },
  ],
};
