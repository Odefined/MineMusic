import type {
  EffectDecision,
  EffectProposal,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  EffectBoundaryPort,
  EffectProposalRepository,
} from "../ports/index.js";

type EffectBoundaryOptions = {
  repository: EffectProposalRepository;
  idFactory?: () => string;
};

export function createEffectBoundary({
  repository,
  idFactory = createDefaultIdFactory("effect"),
}: EffectBoundaryOptions): EffectBoundaryPort {
  const decisions = new Map<string, EffectDecision>();

  return {
    async propose({ proposal }) {
      const storedProposal: EffectProposal = {
        ...proposal,
        id: idFactory(),
      };

      return repository.put(storedProposal);
    },

    async decide({ decision }) {
      const proposal = await repository.get(decision.proposalId);

      if (!proposal.ok) {
        return proposal;
      }

      if (proposal.value === null) {
        return fail({
          code: "effect.rejected",
          message: `Effect proposal '${decision.proposalId}' was not found.`,
          module: "effects",
          retryable: false,
        });
      }

      decisions.set(decision.proposalId, decision);

      return ok(undefined);
    },
  };
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
