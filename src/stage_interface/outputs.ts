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

const defaultKnowledgeFactLimit = 5;

export function compactReviewInspect(
  inspection: ProvisionalReviewInspection,
  options: { knowledgeFactLimit?: number | undefined } = {},
): unknown {
  if (inspection.detail !== undefined) {
    return compactReviewInspectDetail(inspection);
  }

  const allKnowledgeFacts = compactKnowledgeFacts(inspection);
  const knowledgeFactLimit = normalizeKnowledgeFactLimit(options.knowledgeFactLimit);
  const knowledgeFacts = allKnowledgeFacts.slice(0, knowledgeFactLimit);

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
    knowledgeFacts,
    knowledgeFactCount: allKnowledgeFacts.length,
    hiddenKnowledgeFactCount: allKnowledgeFacts.length - knowledgeFacts.length,
    ...(inspection.warnings === undefined
      ? {}
      : {
          warnings: inspection.warnings.map(compactReviewWarning),
        }),
  };
}

function normalizeKnowledgeFactLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return defaultKnowledgeFactLimit;
  }

  return Math.floor(limit);
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

function compactReviewWarning(message: string): { code: string; message: string } {
  if (message.startsWith("broad_title_fragment_results:")) {
    return {
      code: "broad_title_fragment_results",
      message: message.slice("broad_title_fragment_results:".length).trim(),
    };
  }

  return {
    code: "canonical.review_warning",
    message,
  };
}

export function compactReviewApply(output: ProvisionalReviewApplyOutput): unknown {
  return {
    subjectId: output.subjectRef.id,
    action: output.action,
    appliedAction: output.appliedAction,
    ...(output.action === "update"
      ? {
          selectedProviderRefToken: output.selectedProviderRefToken,
        }
      : {}),
    ...(output.action === "update" && output.warnings !== undefined
      ? {
          warnings: output.warnings.map((message) => ({
            code: message === "Audit event recording failed after canonical update."
              ? "audit_event_failed"
              : "canonical.review_warning",
            message,
          })),
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
    ...(hint.facts.releaseDate === undefined ? {} : { releaseDate: hint.facts.releaseDate }),
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
