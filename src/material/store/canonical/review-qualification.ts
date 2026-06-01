import type {
  CanonicalProvisionalHint,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeRelation,
  ProvisionalReviewAutoUpdateReasonCode,
  Ref,
  SourceReleaseTrackPosition,
} from "../../../contracts/index.js";

export type ReviewRecordingQualification = {
  recordingRef: Ref;
  qualified: boolean;
  reasonCodes: ProvisionalReviewAutoUpdateReasonCode[];
};

export type ReviewRecordingQualificationResult = {
  qualifiedRecordingRefs: Ref[];
  recordings: ReviewRecordingQualification[];
  reasonCodes: ProvisionalReviewAutoUpdateReasonCode[];
};

type SourceRecordingFacts = {
  title: string | undefined;
  artistLabels: string[];
  releaseLabel: string | undefined;
  releaseDate: string | undefined;
  durationMs: number | undefined;
  trackPosition: SourceReleaseTrackPosition | undefined;
  conflicting: boolean;
};

type MusicBrainzRecordingFacts = {
  ref: Ref;
  titles: string[];
  artistLabels: string[];
  durationMs: number | undefined;
  releases: MusicBrainzReleaseFacts[];
};

type MusicBrainzReleaseFacts = {
  ref: Ref | undefined;
  title: string;
  date: string | undefined;
  tracklistAvailable: boolean;
  tracklistDiscNumbers: string[];
  selectedRecordingPositions: MusicBrainzTrackPositionFacts[];
};

type MusicBrainzTrackPositionFacts = {
  disc: string | undefined;
  track: number | undefined;
  trackCount: number | undefined;
};

export function qualifyReviewRecordings({
  provisionalHints,
  knowledgeItems,
}: {
  provisionalHints: CanonicalProvisionalHint[];
  knowledgeItems: KnowledgeItem[];
}): ReviewRecordingQualificationResult {
  const source = sourceRecordingFacts(provisionalHints);
  const sourceReasonCodes = sourceMissingReasonCodes(source);
  const recordings = musicBrainzRecordingFacts(knowledgeItems).map((recording) =>
    qualifyRecording(source, sourceReasonCodes, recording)
  );
  const qualifiedRecordingRefs = recordings
    .filter((recording) => recording.qualified)
    .map((recording) => recording.recordingRef);
  const reasonCodes = sourceReasonCodes.length > 0
    ? sourceReasonCodes
    : recordings.length === 0
      ? ["no_musicbrainz_recording_facts"]
      : [];

  if (qualifiedRecordingRefs.length > 1) {
    reasonCodes.push("multiple_qualified_recordings");
  }

  return {
    qualifiedRecordingRefs,
    recordings,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

function qualifyRecording(
  source: SourceRecordingFacts,
  sourceReasonCodes: ProvisionalReviewAutoUpdateReasonCode[],
  recording: MusicBrainzRecordingFacts,
): ReviewRecordingQualification {
  const reasonCodes = [...sourceReasonCodes];

  if (!hasNormalizedMatch([source.title], recording.titles)) {
    reasonCodes.push("no_title_match");
  }

  if (!hasNormalizedMatch(source.artistLabels, recording.artistLabels)) {
    reasonCodes.push("no_recording_artist_match");
  }

  if (!recording.releases.some((release) => releaseMatchesSource(source, release))) {
    reasonCodes.push(
      recording.releases.some((release) => hasNormalizedMatch([source.releaseLabel], [release.title]))
        ? "no_release_date_match"
        : "no_release_title_match",
    );
  }

  if (source.durationMs !== undefined && recording.durationMs !== undefined) {
    const durationDelta = Math.abs(source.durationMs - recording.durationMs) / source.durationMs;

    if (durationDelta > 0.01) {
      reasonCodes.push("duration_outside_one_percent");
    }
  } else {
    reasonCodes.push("duration_missing");
  }

  const trackPositionReason = trackPositionReasonCode(source, recording);

  if (trackPositionReason !== undefined) {
    reasonCodes.push(trackPositionReason);
  }

  return {
    recordingRef: recording.ref,
    qualified: reasonCodes.length === 0,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

function sourceRecordingFacts(hints: CanonicalProvisionalHint[]): SourceRecordingFacts {
  const recordingHints = hints.filter((hint) => hint.kind === "source_recording_context");
  const title = mergeHardSourceField(recordingHints.map((hint) => hint.facts.title), normalizeText);
  const releaseLabel = mergeHardSourceField(recordingHints.map((hint) => hint.facts.releaseLabel), normalizeText);
  const releaseDate = mergeHardSourceField(recordingHints.map((hint) => hint.facts.releaseDate), (value) =>
    value.trim()
  );
  const durationMs = mergeHardSourceField(recordingHints.map((hint) => hint.facts.durationMs), String);
  const trackPosition = mergeHardSourceField(
    recordingHints.map((hint) => hint.facts.trackPosition),
    sourceTrackPositionKey,
  );

  return {
    title: title.value,
    artistLabels: uniqueStrings(recordingHints.flatMap((hint) => hint.facts.artistLabels ?? [])),
    releaseLabel: releaseLabel.value,
    releaseDate: releaseDate.value,
    durationMs: durationMs.value,
    trackPosition: trackPosition.value,
    conflicting: title.conflicting ||
      releaseLabel.conflicting ||
      releaseDate.conflicting ||
      durationMs.conflicting ||
      trackPosition.conflicting,
  };
}

function mergeHardSourceField<T>(
  values: Array<T | undefined>,
  keyForValue: (value: T) => string,
): { value: T | undefined; conflicting: boolean } {
  let selected: T | undefined;
  let selectedKey: string | undefined;

  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    const key = keyForValue(value);

    if (selected === undefined) {
      selected = value;
      selectedKey = key;
      continue;
    }

    if (selectedKey !== key) {
      return { value: selected, conflicting: true };
    }
  }

  return { value: selected, conflicting: false };
}

function sourceTrackPositionKey(value: SourceReleaseTrackPosition): string {
  return JSON.stringify({
    discNumber: value.discNumber,
    trackNumber: value.trackNumber,
    trackCount: value.trackCount,
  });
}

function sourceMissingReasonCodes(source: SourceRecordingFacts): ProvisionalReviewAutoUpdateReasonCode[] {
  const reasonCodes: ProvisionalReviewAutoUpdateReasonCode[] = [];

  if (source.title === undefined || normalizeText(source.title).length === 0) {
    reasonCodes.push("missing_source_title");
  }

  if (source.conflicting) {
    reasonCodes.push("conflicting_source_hints");
  }

  if (source.artistLabels.length === 0) {
    reasonCodes.push("missing_source_artist");
  }

  if (source.releaseLabel === undefined || normalizeText(source.releaseLabel).length === 0) {
    reasonCodes.push("missing_source_release");
  }

  if (source.releaseDate === undefined || parseDatePrecision(source.releaseDate) === undefined) {
    reasonCodes.push("missing_source_release_date");
  }

  if (source.durationMs === undefined || source.durationMs <= 0) {
    reasonCodes.push("missing_source_duration");
  }

  return reasonCodes;
}

function musicBrainzRecordingFacts(knowledgeItems: KnowledgeItem[]): MusicBrainzRecordingFacts[] {
  const byRef = new Map<string, MusicBrainzRecordingFacts>();

  for (const item of knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    for (const recordingNode of identityRecordingNodes(item)) {
      const ref = recordingNode.ref;

      if (ref === undefined) {
        continue;
      }

      byRef.set(refKey(ref), {
        ref,
        titles: recordingTitles(recordingNode),
        artistLabels: recordingArtistLabels(item.nodes, item.relations, recordingNode.id),
        durationMs: numberFromUnknown(recordingNode.properties?.durationMs),
        releases: recordingReleases(item.nodes, item.relations, recordingNode.id),
      });
    }
  }

  for (const recording of byRef.values()) {
    recording.releases = recording.releases.map((release) => {
      const tracklist = release.ref === undefined
        ? { available: false, discNumbers: [], positions: [] }
        : tracklistForReleaseAndRecording(knowledgeItems, release.ref, recording.ref);

      return {
        ...release,
        tracklistAvailable: tracklist.available,
        tracklistDiscNumbers: tracklist.discNumbers,
        selectedRecordingPositions: tracklist.positions,
      };
    });
  }

  return [...byRef.values()];
}

function identityRecordingNodes(item: Extract<KnowledgeItem, { kind: "structured" }>): KnowledgeNode[] {
  const nodes: KnowledgeNode[] = [];

  if (item.source.ref !== undefined && isMusicBrainzRecordingRef(item.source.ref)) {
    const sourceRef = item.source.ref;
    const sourceNode = item.nodes.find((node) => node.ref !== undefined && sameRef(node.ref, sourceRef));

    if (sourceNode !== undefined) {
      nodes.push(sourceNode);
    }
  }

  const rootNode = item.nodes.find((node) => node.id === item.rootNodeId);

  if (rootNode?.ref !== undefined && isMusicBrainzRecordingRef(rootNode.ref)) {
    nodes.push(rootNode);
  }

  return uniqueNodes(nodes);
}

function recordingTitles(node: KnowledgeNode): string[] {
  return uniqueStrings([
    stringFromUnknown(node.properties?.title),
    node.label,
    node.ref?.label,
    ...stringArrayFromUnknown(node.properties?.aliases),
  ]);
}

function recordingArtistLabels(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  recordingNodeId: string,
): string[] {
  const labels: string[] = [];

  for (const relation of relations.filter((candidate) => candidate.type === "artist_credit")) {
    const recordingEndpoint = relation.endpoints.find((endpoint) =>
      endpoint.nodeId === recordingNodeId && (endpoint.role === undefined || endpoint.role === "credited_entity")
    );

    if (recordingEndpoint === undefined) {
      continue;
    }

    const artistNode = nodeForEndpointRole(nodes, relation, "artist");

    if (artistNode === undefined) {
      continue;
    }

    labels.push(...uniqueStrings([
      artistNode.label,
      artistNode.ref?.label,
      stringFromUnknown(artistNode.properties?.name),
      ...stringArrayFromUnknown(artistNode.properties?.aliases),
    ]));
  }

  return uniqueStrings(labels);
}

function recordingReleases(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  recordingNodeId: string,
): MusicBrainzReleaseFacts[] {
  return relations
    .filter((relation) => relation.type === "release_appearance")
    .filter((relation) =>
      relation.endpoints.some((endpoint) =>
        endpoint.nodeId === recordingNodeId && (endpoint.role === undefined || endpoint.role === "recording")
      )
    )
    .map((relation) => nodeForEndpointRole(nodes, relation, "release"))
    .filter((node): node is KnowledgeNode => node !== undefined)
    .map((node) => ({
      ref: node.ref,
      title: stringFromUnknown(node.properties?.title) ?? node.label ?? node.ref?.label ?? node.id,
      date: stringFromUnknown(node.properties?.date),
      tracklistAvailable: false,
      tracklistDiscNumbers: [],
      selectedRecordingPositions: [],
    }));
}

function trackPositionReasonCode(
  source: SourceRecordingFacts,
  recording: MusicBrainzRecordingFacts,
): ProvisionalReviewAutoUpdateReasonCode | undefined {
  if (source.trackPosition === undefined) {
    return undefined;
  }

  const matchingReleases = recording.releases.filter((release) => releaseMatchesSource(source, release));

  if (matchingReleases.length === 0) {
    return undefined;
  }

  if (!matchingReleases.some((release) => release.tracklistAvailable)) {
    return "track_position_unavailable";
  }

  if (source.trackPosition.trackNumber === undefined) {
    return "track_position_unavailable";
  }

  if (
    source.trackPosition.discNumber === undefined &&
    matchingReleases.some((release) => release.tracklistDiscNumbers.length > 1)
  ) {
    return "track_position_ambiguous";
  }

  const positions = matchingReleases.flatMap((release) => release.selectedRecordingPositions);

  if (positions.length === 0) {
    return "track_position_not_found";
  }

  const sourceDisc = source.trackPosition.discNumber;
  const sourceTrack = source.trackPosition.trackNumber;
  const sourceTrackCount = source.trackPosition.trackCount;
  const matches = positions.some((position) =>
    position.track === sourceTrack &&
    (sourceDisc === undefined || normalizeText(position.disc ?? "") === normalizeText(sourceDisc)) &&
    (sourceTrackCount === undefined || position.trackCount === undefined || position.trackCount === sourceTrackCount)
  );

  return matches ? undefined : "track_position_mismatch";
}

function tracklistForReleaseAndRecording(
  knowledgeItems: KnowledgeItem[],
  releaseRef: Ref,
  recordingRef: Ref,
): {
  available: boolean;
  discNumbers: string[];
  positions: MusicBrainzTrackPositionFacts[];
} {
  let available = false;
  const discNumbers: string[] = [];
  const positions: MusicBrainzTrackPositionFacts[] = [];

  for (const item of knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    const releaseNode = item.nodes.find((node) => node.ref !== undefined && sameRef(node.ref, releaseRef));

    if (releaseNode === undefined) {
      continue;
    }

    const mediumNodes = item.relations
      .filter((relation) => relation.type === "has_medium")
      .filter((relation) =>
        relation.endpoints.some((endpoint) =>
          endpoint.nodeId === releaseNode.id && (endpoint.role === undefined || endpoint.role === "release")
        )
      )
      .map((relation) => nodeForEndpointRole(item.nodes, relation, "medium"))
      .filter((node): node is KnowledgeNode => node !== undefined);

    if (mediumNodes.length === 0) {
      continue;
    }

    available = true;

    for (const mediumNode of mediumNodes) {
      const disc = stringFromUnknown(mediumNode.properties?.position);

      if (disc !== undefined) {
        discNumbers.push(disc);
      }

      const trackNodes = item.relations
        .filter((relation) => relation.type === "has_track")
        .filter((relation) =>
          relation.endpoints.some((endpoint) =>
            endpoint.nodeId === mediumNode.id && (endpoint.role === undefined || endpoint.role === "medium")
          )
        )
        .map((relation) => nodeForEndpointRole(item.nodes, relation, "track"))
        .filter((node): node is KnowledgeNode => node !== undefined);

      for (const trackNode of trackNodes) {
        if (!trackRepresentsRecording(item.nodes, item.relations, trackNode.id, recordingRef)) {
          continue;
        }

        positions.push({
          disc,
          track: numberFromUnknown(trackNode.properties?.position),
          trackCount: numberFromUnknown(mediumNode.properties?.trackCount),
        });
      }
    }
  }

  return {
    available,
    discNumbers: uniqueStrings(discNumbers),
    positions,
  };
}

function trackRepresentsRecording(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  trackNodeId: string,
  recordingRef: Ref,
): boolean {
  return relations
    .filter((relation) => relation.type === "represents_recording")
    .filter((relation) =>
      relation.endpoints.some((endpoint) =>
        endpoint.nodeId === trackNodeId && (endpoint.role === undefined || endpoint.role === "track")
      )
    )
    .map((relation) => nodeForEndpointRole(nodes, relation, "recording"))
    .some((node) => node?.ref !== undefined && sameRef(node.ref, recordingRef));
}

function releaseMatchesSource(source: SourceRecordingFacts, release: MusicBrainzReleaseFacts): boolean {
  return hasNormalizedMatch([source.releaseLabel], [release.title]) &&
    source.releaseDate !== undefined &&
    release.date !== undefined &&
    datesCompatible(source.releaseDate, release.date);
}

function datesCompatible(left: string, right: string): boolean {
  const leftDate = parseDatePrecision(left);
  const rightDate = parseDatePrecision(right);

  if (leftDate === undefined || rightDate === undefined) {
    return false;
  }

  if (leftDate.precision === "year" || rightDate.precision === "year") {
    return leftDate.year === rightDate.year;
  }

  if (leftDate.precision === "month" || rightDate.precision === "month") {
    return leftDate.year === rightDate.year && leftDate.month === rightDate.month;
  }

  return Math.abs(leftDate.dayNumber - rightDate.dayNumber) <= 1;
}

function parseDatePrecision(value: string): (
  | { precision: "year"; year: number }
  | { precision: "month"; year: number; month: number }
  | { precision: "day"; year: number; month: number; day: number; dayNumber: number }
) | undefined {
  const yearMatch = /^(\d{4})$/.exec(value);

  if (yearMatch !== null) {
    return { precision: "year", year: Number(yearMatch[1]) };
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value);

  if (monthMatch !== null) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);

    return month >= 1 && month <= 12 ? { precision: "month", year, month } : undefined;
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dayMatch === null) {
    return undefined;
  }

  const year = Number(dayMatch[1]);
  const month = Number(dayMatch[2]);
  const day = Number(dayMatch[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const dayNumber = Date.UTC(year, month - 1, day) / 86400000;
  const parsed = new Date(dayNumber * 86400000);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return { precision: "day", year, month, day, dayNumber };
}

function hasNormalizedMatch(left: Array<string | undefined>, right: Array<string | undefined>): boolean {
  const leftKeys = new Set(left.map((value) => value === undefined ? "" : normalizeText(value)).filter(Boolean));

  if (leftKeys.size === 0) {
    return false;
  }

  return right.some((value) => value !== undefined && leftKeys.has(normalizeText(value)));
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const byKey = new Map<string, string>();

  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    const normalized = normalizeText(value);

    if (normalized.length === 0 || byKey.has(normalized)) {
      continue;
    }

    byKey.set(normalized, value);
  }

  return [...byKey.values()];
}

function uniqueReasonCodes(
  reasonCodes: ProvisionalReviewAutoUpdateReasonCode[],
): ProvisionalReviewAutoUpdateReasonCode[] {
  return [...new Set(reasonCodes)];
}

function uniqueNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const byId = new Map<string, KnowledgeNode>();

  for (const node of nodes) {
    byId.set(node.id, node);
  }

  return [...byId.values()];
}

function nodeForEndpointRole(
  nodes: KnowledgeNode[],
  relation: KnowledgeRelation,
  role: string,
): KnowledgeNode | undefined {
  const nodeId = relation.endpoints.find((endpoint) => endpoint.role === role)?.nodeId;

  return nodeId === undefined ? undefined : nodes.find((node) => node.id === nodeId);
}

function isMusicBrainzRecordingRef(ref: Ref): boolean {
  return ref.namespace === "musicbrainz" && ref.kind === "recording";
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}
