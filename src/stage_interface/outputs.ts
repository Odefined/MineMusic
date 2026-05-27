import type {
  CanonicalProvisionalHint,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeRelation,
  ProvisionalReviewApplyOutput,
  ProvisionalReviewInspection,
  ProvisionalReviewListOutput,
  Ref,
} from "../contracts/index.js";

export function reviewSubjectRef(subjectId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "recording",
    id: subjectId,
  };
}

export function compactReviewList(output: ProvisionalReviewListOutput): unknown {
  return {
    items: output.items.map((item) => ({
      subjectId: item.subjectRef.id,
      kind: item.kind,
      label: item.label,
    })),
    ...(output.nextCursor === undefined ? {} : { nextCursor: output.nextCursor }),
  };
}

export function compactReviewInspect(inspection: ProvisionalReviewInspection): unknown {
  if (inspection.detail !== undefined) {
    return compactReviewInspectDetail(inspection);
  }

  return {
    inspectionId: inspection.inspectionId,
    subject: {
      subjectId: inspection.subject.ref.id,
      kind: "recording",
      label: inspection.subject.label,
      ...(inspection.subject.aliases === undefined ? {} : { aliases: inspection.subject.aliases }),
      ...((inspection.subject.aliases?.length ?? 0) === 0
        ? {}
        : { aliasCount: inspection.subject.aliases?.length }),
    },
    hints: inspection.provisionalHints
      .filter((hint) => hint.kind === "source_recording_context")
      .map(compactHint),
    knowledgeFacts: compactKnowledgeFacts(inspection),
    ...(inspection.warnings === undefined
      ? {}
      : {
          warnings: inspection.warnings.map((message) => ({
            code: "canonical.review_warning",
            message,
          })),
        }),
  };
}

function compactReviewInspectDetail(inspection: ProvisionalReviewInspection): unknown {
  const detail = inspection.detail;

  if (detail === undefined) {
    return {};
  }

  return {
    inspectionId: inspection.inspectionId,
    recordingRefToken: detail.recordingRefToken,
    ...(detail.releaseAppearances === undefined
      ? {}
      : {
          releaseAppearances: detail.releaseAppearances.map((appearance) => ({
            refToken: appearance.refToken,
            title: appearance.title,
            ...(appearance.date === undefined ? {} : { date: appearance.date }),
            ...(appearance.country === undefined ? {} : { country: appearance.country }),
            ...(appearance.disambiguation === undefined ? {} : { disambiguation: appearance.disambiguation }),
          })),
        }),
    ...(detail.releaseTrackPositions === undefined
      ? {}
      : {
          releaseTrackPositions: detail.releaseTrackPositions.map((release) => ({
            refToken: release.refToken,
            title: release.title,
            ...(release.date === undefined ? {} : { date: release.date }),
            ...(release.country === undefined ? {} : { country: release.country }),
            positions: release.positions,
          })),
        }),
    ...(detail.truncated === undefined ? {} : { truncated: detail.truncated }),
    ...(detail.warnings === undefined
      ? {}
      : {
          warnings: detail.warnings.map((message) => ({
            code: "canonical.review_warning",
            message,
          })),
        }),
  };
}

export function compactReviewApply(output: ProvisionalReviewApplyOutput): unknown {
  return {
    subjectId: output.subjectRef.id,
    action: output.action,
    appliedAction: output.appliedAction,
    ...(output.action === "update" && output.selectedProviderRef !== undefined
      ? {
          selectedProviderRefToken: {
            kind: "recording",
            id: output.selectedProviderRef.id,
          },
        }
      : {}),
  };
}

function compactHint(hint: CanonicalProvisionalHint): unknown {
  return {
    kind: hint.kind,
    ...(hint.facts.title === undefined ? {} : { title: hint.facts.title }),
    ...(hint.facts.artistLabels === undefined ? {} : { artists: hint.facts.artistLabels }),
    ...(hint.facts.releaseLabel === undefined ? {} : { release: hint.facts.releaseLabel }),
    ...(hint.facts.durationMs === undefined ? {} : { durationMs: hint.facts.durationMs }),
    ...(hint.facts.trackPosition === undefined
      ? {}
      : {
          track: {
            ...(hint.facts.trackPosition.discNumber === undefined
              ? {}
              : { disc: hint.facts.trackPosition.discNumber }),
            ...(hint.facts.trackPosition.trackNumber === undefined
              ? {}
              : { number: hint.facts.trackPosition.trackNumber }),
            ...(hint.facts.trackPosition.trackCount === undefined
              ? {}
              : { count: hint.facts.trackPosition.trackCount }),
          },
        }),
  };
}

function compactKnowledgeFacts(inspection: ProvisionalReviewInspection): unknown[] {
  return (inspection.refTokens ?? [])
    .filter((binding) => binding.token.kind === "recording")
    .map((binding) => {
      const node = findKnowledgeNode(inspection.knowledgeItems, binding.ref);
      const releases = compactReleaseSummaries(inspection, binding.ref);
      const facts = compactKnowledgeNodeFacts(node, binding.ref, releases.slice(0, 3));

      return {
        refToken: binding.token,
        facts,
        ...(releases.length > 3 ? { releaseCount: releases.length } : {}),
        ...(node?.properties?.disambiguation === undefined
          ? {}
          : {
              context: {
                disambiguation: String(node.properties.disambiguation),
              },
            }),
      };
    });
}

function findKnowledgeNode(items: KnowledgeItem[], ref: Ref): KnowledgeNode | undefined {
  for (const item of items) {
    if (item.kind !== "structured") {
      continue;
    }

    const node = item.nodes.find((candidate) =>
      candidate.ref !== undefined && sameRef(candidate.ref, ref),
    );

    if (node !== undefined) {
      return node;
    }
  }

  return undefined;
}

function compactKnowledgeNodeFacts(
  node: KnowledgeNode | undefined,
  ref: Ref,
  releases: Array<{ title: string; date?: string }>,
): Record<string, unknown> {
  const properties = node?.properties ?? {};

  return {
    title: stringFact(properties.title) ?? node?.label ?? ref.label,
    ...(stringFact(properties.artistCreditText) === undefined
      ? {}
      : { artistCredit: stringFact(properties.artistCreditText) }),
    ...(numberFact(properties.durationMs) === undefined
      ? {}
      : { durationMs: numberFact(properties.durationMs) }),
    ...(releases.length === 0 ? {} : { releases }),
  };
}

function compactReleaseSummaries(
  inspection: ProvisionalReviewInspection,
  recordingRef: Ref,
): Array<{ title: string; date?: string }> {
  if (!inspection.provisionalHints.some((hint) => hint.facts.releaseLabel !== undefined)) {
    return [];
  }

  const byRef = new Map<string, { title: string; date?: string }>();

  for (const item of inspection.knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    const recordingNode = item.nodes.find((node) =>
      node.ref !== undefined && sameRef(node.ref, recordingRef),
    );

    if (recordingNode === undefined) {
      continue;
    }

    for (const relation of item.relations.filter((candidate) => candidate.type === "release_appearance")) {
      if (!relation.endpoints.some((endpoint) => endpoint.nodeId === recordingNode.id)) {
        continue;
      }

      const releaseNode = nodeForEndpointRole(item.nodes, relation, "release");

      if (releaseNode?.ref === undefined || byRef.has(refKey(releaseNode.ref))) {
        continue;
      }

      const summary = releaseSummaryFromNode(releaseNode);

      if (summary !== undefined) {
        byRef.set(refKey(releaseNode.ref), summary);
      }
    }
  }

  return [...byRef.values()];
}

function releaseSummaryFromNode(node: KnowledgeNode): { title: string; date?: string } | undefined {
  const title = stringFact(node.properties?.title) ?? node.label ?? node.ref?.label;

  if (title === undefined) {
    return undefined;
  }

  const date = stringFact(node.properties?.date);

  return {
    title,
    ...(date === undefined ? {} : { date }),
  };
}

function nodeForEndpointRole(
  nodes: KnowledgeNode[],
  relation: KnowledgeRelation,
  role: string,
): KnowledgeNode | undefined {
  const nodeId = relation.endpoints.find((endpoint) => endpoint.role === role)?.nodeId;

  return nodeId === undefined ? undefined : nodes.find((node) => node.id === nodeId);
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function stringFact(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberFact(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
