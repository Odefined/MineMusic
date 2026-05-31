import type {
  InstrumentProviderDescriptor,
  PlayableLink,
  Ref,
  Result,
  SourceMaterial,
  SourceProvider,
} from "../contracts/index.js";

type RecommendationFixtureTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  tags: string[];
  energy: number;
  link?: string;
};

const fixtureNamespace = "source:fixture-recommendation";

export const recommendationFixtureProviderDescriptor: InstrumentProviderDescriptor = {
  id: "fixture_recommendation",
  label: "Fixture Recommendation Catalog",
  slot: "source",
  status: "available",
  authentication: "none",
  operations: ["search", "refresh_playable_links"],
  notes: [
    "Controlled 20-track catalog for recommendation posture scenario tests.",
    "Use it as the only source provider when MINEMUSIC_SOURCE_PROVIDER=fixture_recommendation.",
    "Useful collection/search terms: late-night coding, quiet groove, rhythmic but not loud, focus, calm electronic.",
  ],
};

export const recommendationFixtureTracks: RecommendationFixtureTrack[] = [
  track("midnight-pulse", "Midnight Pulse", "Array Harbor", "Low Light Compile", ["coding", "night", "groove", "calm", "electronic"], 72),
  track("soft-compile", "Soft Compile", "Array Harbor", "Low Light Compile", ["coding", "night", "soft", "focus", "electronic"], 62),
  track("quiet-clockwork", "Quiet Clockwork", "Array Harbor", "Low Light Compile", ["coding", "loop", "quiet", "focus"], 54),
  track("neon-thread", "Neon Thread", "Null Rain", "Semaphore", ["coding", "groove", "downtempo", "night"], 68),
  track("blue-cache", "Blue Cache", "Null Rain", "Semaphore", ["coding", "quiet", "downtempo", "calm"], 50),
  track("low-priority-loop", "Low Priority Loop", "Null Rain", "Semaphore", ["loop", "minimal", "focus", "quiet"], 46),
  track("terminal-bloom", "Terminal Bloom", "Packet Garden", "Packet Garden", ["night", "warm", "instrumental", "focus"], 58),
  track("sleeping-router", "Sleeping Router", "Packet Garden", "Packet Garden", ["calm", "ambient", "quiet"], 34),
  track("branch-predictor", "Branch Predictor", "Packet Garden", "Packet Garden", ["groove", "instrumental", "coding"], 66),
  track("index-moon", "Index Moon", "Vellum VM", "After Hours Index", ["night", "jazzy", "groove", "focus"], 64),
  track("paper-stack-drift", "Paper Stack Drift", "Vellum VM", "After Hours Index", ["quiet", "jazzy", "calm"], 42),
  track("warm-stack", "Warm Stack", "Vellum VM", "After Hours Index", ["warm", "coding", "soft"], 56),
  track("uninterruptible", "Uninterruptible", "Signal Porch", "No Pager", ["steady", "coding", "groove"], 70),
  track("pager-muted", "Pager Muted", "Signal Porch", "No Pager", ["quiet", "steady", "night"], 48),
  track("after-hours-cron", "After Hours Cron", "Signal Porch", "No Pager", ["night", "loop", "minimal"], 52),
  track("glass-keystrokes", "Glass Keystrokes", "Distant Merge", "Small Diffs", ["minimal", "focus", "quiet"], 44),
  track("small-diffs", "Small Diffs", "Distant Merge", "Small Diffs", ["coding", "soft", "groove"], 60),
  track("review-lamp", "Review Lamp", "Distant Merge", "Small Diffs", ["calm", "late", "focus"], 38),
  track("page-window", "Page Window", "Broken Link Lab", "Unsafe Page URLs", ["page-url-only", "negative"], 40, undefined),
  track("loud-stacktrace", "Loud Stacktrace", "Crash Lantern", "Too Much Coffee", ["loud", "noisy", "high-energy"], 96),
];

export function createRecommendationFixtureSourceProvider(): SourceProvider {
  return {
    id: "fixture_recommendation",
    descriptor: recommendationFixtureProviderDescriptor,

    async search({ query }) {
      const limit = query.limit ?? 10;
      const exactSourceRef = query.sourceRef;
      const matches =
        exactSourceRef === undefined
          ? rankTracks(query.text)
          : recommendationFixtureTracks.filter((trackItem) =>
              sameRef(trackRef(trackItem), exactSourceRef)
            );

      return ok(matches.slice(0, limit).map(toSourceMaterial));
    },

    async getPlayableLinks({ material }) {
      const links = (material.sourceRefs ?? [])
        .map((sourceRef) => recommendationFixtureTracks.find((trackItem) => sameRef(trackRef(trackItem), sourceRef)))
        .filter((trackItem): trackItem is RecommendationFixtureTrack => trackItem !== undefined)
        .flatMap((trackItem) => playableLinksForTrack(trackItem));

      return ok(links);
    },
  };
}

function track(
  id: string,
  title: string,
  artist: string,
  album: string,
  tags: string[],
  energy: number,
  link = `https://fixture.example/play/${id}`,
): RecommendationFixtureTrack {
  return { id, title, artist, album, tags, energy, ...(link === undefined ? {} : { link }) };
}

function rankTracks(text: string | undefined): RecommendationFixtureTrack[] {
  const normalized = normalize(text);

  if (normalized.length === 0) {
    return [...recommendationFixtureTracks].sort(defaultTrackOrder);
  }

  return [...recommendationFixtureTracks]
    .map((trackItem) => ({
      track: trackItem,
      score: scoreTrack(trackItem, normalized),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || defaultTrackOrder(left.track, right.track))
    .map(({ track }) => track);
}

function scoreTrack(trackItem: RecommendationFixtureTrack, normalized: string): number {
  const haystack = normalize([
    trackItem.title,
    trackItem.artist,
    trackItem.album,
    ...trackItem.tags,
  ].join(" "));
  let score = 0;

  for (const token of normalized.split(/\s+/)) {
    if (token.length > 0 && haystack.includes(token)) {
      score += 10;
    }
  }

  if (includesAny(normalized, ["coding", "code", "编程", "写代码", "focus", "专注"])) {
    score += tagScore(trackItem, ["coding", "focus"]);
  }

  if (includesAny(normalized, ["night", "late", "深夜", "晚上"])) {
    score += tagScore(trackItem, ["night", "late"]);
  }

  if (includesAny(normalized, ["groove", "rhythmic", "律动", "节奏"])) {
    score += tagScore(trackItem, ["groove", "loop", "steady"]);
  }

  if (includesAny(normalized, ["quiet", "calm", "soft", "安静", "不吵", "不要太吵"])) {
    score += tagScore(trackItem, ["quiet", "calm", "soft"]);
    score += Math.max(0, 80 - trackItem.energy) / 10;
  }

  if (includesAny(normalized, ["loud", "noisy", "太吵", "炸"])) {
    score += tagScore(trackItem, ["loud", "noisy"]);
  }

  if (score === 0 && normalized.includes(trackItem.id)) {
    score += 100;
  }

  return score;
}

function tagScore(trackItem: RecommendationFixtureTrack, tags: string[]): number {
  return trackItem.tags.filter((tag) => tags.includes(tag)).length * 8;
}

function defaultTrackOrder(left: RecommendationFixtureTrack, right: RecommendationFixtureTrack): number {
  return left.energy - right.energy || left.id.localeCompare(right.id);
}

function toSourceMaterial(trackItem: RecommendationFixtureTrack): SourceMaterial {
  const sourceRef = trackRef(trackItem);
  const playableLinks = playableLinksForTrack(trackItem);

  return {
    id: `fixture-recommendation:${trackItem.id}`,
    kind: "recording",
    label: `${trackItem.title} - ${trackItem.artist}`,
    state: playableLinks.length === 0 ? "grounded" : "source_only_playable",
    sourceRefs: [sourceRef],
    ...(playableLinks.length === 0 ? {} : { playableLinks }),
    evidence: [
      {
        kind: "fixture_recommendation.track",
        source: sourceRef,
        note: `album=${trackItem.album}; tags=${trackItem.tags.join(",")}; energy=${trackItem.energy}`,
        confidence: 1,
      },
    ],
  };
}

function playableLinksForTrack(trackItem: RecommendationFixtureTrack): PlayableLink[] {
  if (trackItem.link === undefined) {
    return [];
  }

  return [{
    url: trackItem.link,
    label: `${trackItem.title} fixture link`,
    sourceRef: trackRef(trackItem),
  }];
}

function trackRef(trackItem: RecommendationFixtureTrack): Ref {
  return {
    namespace: fixtureNamespace,
    kind: "track",
    id: trackItem.id,
    label: `${trackItem.title} - ${trackItem.artist}`,
    ...(trackItem.link === undefined ? { url: `https://fixture.example/page/${trackItem.id}` } : {}),
  };
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(normalize(needle)));
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
