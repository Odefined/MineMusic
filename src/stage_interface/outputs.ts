import type {
  CanonicalProvisionalHint,
  KnowledgeItem,
  KnowledgeNode,
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
      const facts = compactKnowledgeNodeFacts(node, binding.ref);

      return {
        refToken: binding.token,
        facts,
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
  };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function stringFact(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberFact(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
