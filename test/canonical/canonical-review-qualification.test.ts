import type {
  CanonicalProvisionalHint,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeRelation,
  Ref,
} from "../../src/contracts/index.js";
import { qualifyReviewRecordings } from "../../src/material_store/canonical/review-qualification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const subjectRef: Ref = {
  namespace: "minemusic",
  kind: "recording",
  id: "canonical-1",
};

const sourceRef: Ref = {
  namespace: "source:netease",
  kind: "track",
  id: "track-1",
};

function sourceRecordingHint(facts: CanonicalProvisionalHint["facts"]): CanonicalProvisionalHint {
  return {
    id: `hint-${facts.title ?? "untitled"}`,
    subjectRef,
    kind: "source_recording_context",
    sourceRef,
    providerId: "netease",
    facts,
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
}

function mbRecordingRef(id: string, label: string): Ref {
  return {
    namespace: "musicbrainz",
    kind: "recording",
    id,
    label,
  };
}

function musicBrainzRecordingKnowledgeItem({
  recordingId = "mb-recording-1",
  title = "Intro",
  durationMs = 127000,
  artistLabel = "The xx",
  artistAliases = [],
  releaseTitle = "xx",
  releaseDate = "2009-08-14",
  recordingAliases = [],
}: {
  recordingId?: string;
  title?: string;
  durationMs?: number;
  artistLabel?: string;
  artistAliases?: string[];
  releaseTitle?: string;
  releaseDate?: string;
  recordingAliases?: string[];
} = {}): KnowledgeItem {
  const recordingRef = mbRecordingRef(recordingId, title);
  const artistRef: Ref = {
    namespace: "musicbrainz",
    kind: "artist",
    id: "mb-artist-1",
    label: artistLabel,
  };
  const releaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "mb-release-1",
    label: releaseTitle,
  };
  const nodes: KnowledgeNode[] = [
    {
      id: `recording:${recordingId}`,
      type: "recording",
      ref: recordingRef,
      label: title,
      properties: { title, durationMs, aliases: recordingAliases },
    },
    {
      id: "artist:mb-artist-1",
      type: "artist",
      ref: artistRef,
      label: artistLabel,
      properties: { name: artistLabel, aliases: artistAliases },
    },
    {
      id: "release:mb-release-1",
      type: "release",
      ref: releaseRef,
      label: releaseTitle,
      properties: { title: releaseTitle, date: releaseDate },
    },
  ];
  const relations: KnowledgeRelation[] = [
    {
      type: "artist_credit",
      endpoints: [
        { nodeId: `recording:${recordingId}`, role: "credited_entity" },
        { nodeId: "artist:mb-artist-1", role: "artist" },
      ],
      properties: { position: 0 },
    },
    {
      type: "release_appearance",
      endpoints: [
        { nodeId: `recording:${recordingId}`, role: "recording" },
        { nodeId: "release:mb-release-1", role: "release" },
      ],
    },
  ];

  return {
    id: `knowledge-${recordingId}`,
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: recordingRef },
    rootNodeId: `recording:${recordingId}`,
    nodes,
    relations,
  };
}

function musicBrainzReleaseTracklistKnowledgeItem({
  releaseTitle = "xx",
  releaseDate = "2009-08-14",
  recordingId = "mb-recording-1",
  recordingTitle = "Intro",
  discNumbers = [1],
  trackNumber = 1,
  trackCount = 11,
}: {
  releaseTitle?: string;
  releaseDate?: string;
  recordingId?: string;
  recordingTitle?: string;
  discNumbers?: number[];
  trackNumber?: number;
  trackCount?: number;
} = {}): KnowledgeItem {
  const releaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "mb-release-1",
    label: releaseTitle,
  };
  const recordingRef = mbRecordingRef(recordingId, recordingTitle);
  const nodes: KnowledgeNode[] = [
    {
      id: "release:mb-release-1",
      type: "release",
      ref: releaseRef,
      label: releaseTitle,
      properties: { title: releaseTitle, date: releaseDate },
    },
    {
      id: `recording:${recordingId}`,
      type: "recording",
      ref: recordingRef,
      label: recordingTitle,
      properties: { title: recordingTitle },
    },
  ];
  const relations: KnowledgeRelation[] = [];

  for (const discNumber of discNumbers) {
    const mediumNodeId = `medium:mb-release-1:${discNumber}`;
    const trackNodeId = `track:mb-release-1:${discNumber}:${trackNumber}`;

    nodes.push(
      {
        id: mediumNodeId,
        type: "medium",
        properties: { position: discNumber, trackCount },
      },
      {
        id: trackNodeId,
        type: "track",
        properties: { position: trackNumber, title: recordingTitle, lengthMs: 127000 },
      },
    );
    relations.push(
      {
        type: "has_medium",
        endpoints: [
          { nodeId: "release:mb-release-1", role: "release" },
          { nodeId: mediumNodeId, role: "medium" },
        ],
      },
      {
        type: "has_track",
        endpoints: [
          { nodeId: mediumNodeId, role: "medium" },
          { nodeId: trackNodeId, role: "track" },
        ],
      },
    );

    if (discNumber === discNumbers[0]) {
      relations.push({
        type: "represents_recording",
        endpoints: [
          { nodeId: trackNodeId, role: "track" },
          { nodeId: `recording:${recordingId}`, role: "recording" },
        ],
      });
    }
  }

  return {
    id: "knowledge-tracklist",
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: releaseRef },
    rootNodeId: "release:mb-release-1",
    nodes,
    relations,
  };
}

function qualifiesExactSourceAndMusicBrainzRecordingFacts(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem()],
  });

  assert(result.qualifiedRecordingRefs.length === 1, "one recording should qualify");
  assert(result.qualifiedRecordingRefs[0]?.id === "mb-recording-1", "qualified ref should be the MB recording");
  assert(result.recordings[0]?.qualified === true, "recording result should be marked qualified");
  assert(result.recordings[0]?.reasonCodes.length === 0, "qualified recording should not carry failure reason codes");
}

function qualifiesRecordingTitleAlias(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem({
        title: "Intro (album version)",
        recordingAliases: ["Intro"],
      }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 1, "recording title alias should qualify");
}

function qualifiesArtistAlias(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The Double X"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem({
        artistLabel: "The xx",
        artistAliases: ["The Double X"],
      }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 1, "explicit artist alias should qualify");
}

function oneSourceArtistMatchIsEnough(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["Featured Guest", "The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem({ artistLabel: "The xx" })],
  });

  assert(result.qualifiedRecordingRefs.length === 1, "one matching source artist should be enough");
}

function doesNotStitchReleaseTitleAndDateAcrossDifferentReleases(): void {
  const item = musicBrainzRecordingKnowledgeItem({
    releaseTitle: "xx",
    releaseDate: "2008-01-01",
  });

  if (item.kind !== "structured") {
    throw new Error("fixture should be structured");
  }

  item.nodes.push({
    id: "release:mb-release-2",
    type: "release",
    ref: {
      namespace: "musicbrainz",
      kind: "release",
      id: "mb-release-2",
      label: "Different Release",
    },
    label: "Different Release",
    properties: { title: "Different Release", date: "2009-08-14" },
  });
  item.relations.push({
    type: "release_appearance",
    endpoints: [
      { nodeId: "recording:mb-recording-1", role: "recording" },
      { nodeId: "release:mb-release-2", role: "release" },
    ],
  });

  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [item],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "release title and date must match on the same MB release");
  assert(
    result.recordings[0]?.reasonCodes.includes("no_release_date_match") === true,
    "failed recording should explain that release date did not match the matching release title",
  );
}

function missingOrUnparsableSourceDateDoesNotQualify(): void {
  const missingDate = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem()],
  });
  const unparsableDate = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "not-a-date",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem()],
  });

  assert(missingDate.qualifiedRecordingRefs.length === 0, "missing source release date should not qualify");
  assert(unparsableDate.qualifiedRecordingRefs.length === 0, "unparsable source release date should not qualify");
  assert(
    missingDate.reasonCodes.includes("missing_source_release_date") &&
      unparsableDate.reasonCodes.includes("missing_source_release_date"),
    "source date failures should be surfaced as missing source release date",
  );
}

function durationOutsideOnePercentDoesNotQualify(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem({ durationMs: 128271 })],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "duration over one percent should not qualify");
  assert(
    result.recordings[0]?.reasonCodes.includes("duration_outside_one_percent") === true,
    "duration failure should use the one-percent reason code",
  );
}

function compatibleDatePrecisionQualifies(): void {
  const oneDayDifference = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2010-07-13",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem({ releaseDate: "2010-07-12" })],
  });
  const yearPrecision = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "1987",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem({ releaseDate: "1987-04-20" })],
  });
  const monthPrecision = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2023-05",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem({ releaseDate: "2023-05-24" })],
  });

  assert(oneDayDifference.qualifiedRecordingRefs.length === 1, "full dates within one day should qualify");
  assert(yearPrecision.qualifiedRecordingRefs.length === 1, "year precision should compare only year");
  assert(monthPrecision.qualifiedRecordingRefs.length === 1, "month precision should compare only year-month");
}

function trackPositionRequiresTracklistContext(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
        trackPosition: { discNumber: "1", trackNumber: 1, trackCount: 11 },
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem()],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "source track position should require MB tracklist context");
  assert(
    result.recordings[0]?.reasonCodes.includes("track_position_unavailable") === true,
    "missing tracklist should use track_position_unavailable",
  );
}

function matchingTrackPositionQualifies(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
        trackPosition: { discNumber: "1", trackNumber: 1, trackCount: 11 },
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem(),
      musicBrainzReleaseTracklistKnowledgeItem(),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 1, "matching track position should qualify");
}

function trackPositionNotFoundDoesNotQualify(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
        trackPosition: { discNumber: "1", trackNumber: 1, trackCount: 11 },
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem(),
      musicBrainzReleaseTracklistKnowledgeItem({ recordingId: "other-recording" }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "tracklist without selected recording should not qualify");
  assert(
    result.recordings[0]?.reasonCodes.includes("track_position_not_found") === true,
    "missing selected recording position should use track_position_not_found",
  );
}

function trackPositionMismatchDoesNotQualify(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
        trackPosition: { discNumber: "1", trackNumber: 1, trackCount: 11 },
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem(),
      musicBrainzReleaseTracklistKnowledgeItem({ trackNumber: 2 }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "mismatched track number should not qualify");
  assert(
    result.recordings[0]?.reasonCodes.includes("track_position_mismatch") === true,
    "position mismatch should use track_position_mismatch",
  );
}

function ambiguousDiscDoesNotQualify(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
        trackPosition: { trackNumber: 1, trackCount: 11 },
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem(),
      musicBrainzReleaseTracklistKnowledgeItem({ discNumbers: [1, 2] }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "missing source disc on multi-disc MB release should not qualify");
  assert(
    result.recordings[0]?.reasonCodes.includes("track_position_ambiguous") === true,
    "ambiguous disc should use track_position_ambiguous",
  );
}

function tracklistOnlyRecordingNodesAreNotIdentityFacts(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzReleaseTracklistKnowledgeItem()],
  });

  assert(result.recordings.length === 0, "tracklist recording nodes should not become review identity facts");
  assert(
    result.reasonCodes.includes("no_musicbrainz_recording_facts"),
    "tracklist-only knowledge should report no identity recording facts",
  );
}

function multipleQualifiedRecordingsReturnReasonCode(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [
      musicBrainzRecordingKnowledgeItem({ recordingId: "mb-recording-1" }),
      musicBrainzRecordingKnowledgeItem({ recordingId: "mb-recording-2" }),
    ],
  });

  assert(result.qualifiedRecordingRefs.length === 2, "both exact MB recordings should qualify internally");
  assert(
    result.reasonCodes.includes("multiple_qualified_recordings"),
    "multiple qualified recordings should be returned as a compact batch-stop reason",
  );
}

function conflictingSourceHintsStopQualification(): void {
  const result = qualifyReviewRecordings({
    provisionalHints: [
      sourceRecordingHint({
        title: "Intro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
      sourceRecordingHint({
        title: "Outro",
        artistLabels: ["The xx"],
        releaseLabel: "xx",
        releaseDate: "2009-08-14",
        durationMs: 127000,
      }),
    ],
    knowledgeItems: [musicBrainzRecordingKnowledgeItem()],
  });

  assert(result.qualifiedRecordingRefs.length === 0, "conflicting source hints should not qualify");
  assert(
    result.reasonCodes.includes("conflicting_source_hints"),
    "conflicting source hints should be returned as a compact reason code",
  );
}

qualifiesExactSourceAndMusicBrainzRecordingFacts();
qualifiesRecordingTitleAlias();
qualifiesArtistAlias();
oneSourceArtistMatchIsEnough();
doesNotStitchReleaseTitleAndDateAcrossDifferentReleases();
missingOrUnparsableSourceDateDoesNotQualify();
durationOutsideOnePercentDoesNotQualify();
compatibleDatePrecisionQualifies();
trackPositionRequiresTracklistContext();
matchingTrackPositionQualifies();
trackPositionNotFoundDoesNotQualify();
trackPositionMismatchDoesNotQualify();
ambiguousDiscDoesNotQualify();
tracklistOnlyRecordingNodesAreNotIdentityFacts();
multipleQualifiedRecordingsReturnReasonCode();
conflictingSourceHintsStopQualification();
