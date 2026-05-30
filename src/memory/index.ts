import type {
  EffectProposal,
  MemoryEntry,
  MemoryProposal,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  MemoryPort,
  MemoryRepository,
} from "../ports/index.js";

type MemoryServiceOptions = {
  repository: MemoryRepository;
  events: EventPort;
  effects: EffectBoundaryPort;
  idFactory?: () => string;
};

export function createMemoryService({
  repository,
  events,
  effects,
  idFactory = createDefaultIdFactory("memory-proposal"),
}: MemoryServiceOptions): MemoryPort {
  const proposals = new Map<string, MemoryProposal>();

  return {
    async summarizeForSession({ sessionId }) {
      await events.listBySession({ sessionId });

      const entries = await repository.list({ sessionId });

      if (!entries.ok) {
        return entries;
      }

      return ok(entries.value.map((entry) => entry.text));
    },

    async propose({ proposal }) {
      if (!hasEnoughEvidence(proposal.entry)) {
        return fail({
          code: "memory.insufficient_evidence",
          message: "Memory proposal lacks explicit rule status or evidence event ids.",
          module: "memory",
          retryable: false,
        });
      }

      const storedProposal: MemoryProposal = {
        ...proposal,
        id: idFactory(),
      };

      proposals.set(storedProposal.id, storedProposal);

      return ok(storedProposal);
    },

    async accept({ proposalId }) {
      const proposal = proposals.get(proposalId);

      if (proposal === undefined) {
        return fail({
          code: "memory.proposal_not_found",
          message: `Memory proposal '${proposalId}' was not found.`,
          module: "memory",
          retryable: false,
        });
      }

      if (proposal.requiresEffectApproval) {
        const effectResult = await effects.propose({
          proposal: memoryProposalToEffectProposal(proposal),
        });

        if (!effectResult.ok) {
          return effectResult;
        }
      }

      const entry: MemoryEntry = {
        ...proposal.entry,
        id: proposal.id,
      };

      return repository.put(entry);
    },
  };
}

function hasEnoughEvidence(entry: Omit<MemoryEntry, "id">): boolean {
  return entry.kind === "explicit_rule" || (entry.evidenceEventIds?.length ?? 0) > 0;
}

function memoryProposalToEffectProposal(proposal: MemoryProposal): Omit<EffectProposal, "id"> {
  const effectProposal: Omit<EffectProposal, "id"> = {
    kind: "memory_update",
    preview: proposal.entry.text,
    reason: proposal.reason,
    requiresConfirmation: proposal.requiresEffectApproval,
    reversible: proposal.entry.undoable ?? true,
  };

  if (proposal.entry.target !== undefined) {
    return {
      ...effectProposal,
      target: proposal.entry.target,
    };
  }

  if (proposal.entry.structuredTarget?.kind === "material") {
    return {
      ...effectProposal,
      target: {
        kind: "material",
        ref: materialRefToCompactRef(proposal.entry.structuredTarget.materialRef),
        actionScope: "remember_preference",
      },
    };
  }

  return effectProposal;
}

function materialRefToCompactRef(materialRef: { id: string }): string {
  return `mat_${encodeURIComponent(materialRef.id)}`;
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
