import { createEffectBoundary } from "../../src/effects/index.js";
import { createInMemoryEffectProposalRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function proposesEffectsBeforeExternalActions(): Promise<void> {
  const boundary = createEffectBoundary({
    repository: createInMemoryEffectProposalRepository(),
    idFactory: () => "effect-1",
  });

  const proposal = await assertOk(
    boundary.propose({
      proposal: {
        kind: "open_link",
        preview: "Open a playable link.",
        reason: "User asked for an external action.",
        requiresConfirmation: true,
        reversible: false,
      },
    }),
  );

  assert(proposal.id === "effect-1", "effect boundary should assign proposal ids");
  assert(proposal.requiresConfirmation, "external actions should remain confirmation-gated proposals");
}

async function decidesOnlyKnownProposals(): Promise<void> {
  const boundary = createEffectBoundary({
    repository: createInMemoryEffectProposalRepository(),
    idFactory: () => "effect-2",
  });
  const proposal = await assertOk(
    boundary.propose({
      proposal: {
        kind: "memory_update",
        preview: "Save a preference.",
        requiresConfirmation: true,
      },
    }),
  );

  await assertOk(
    boundary.decide({
      decision: { status: "approved", proposalId: proposal.id },
    }),
  );
  const missing = await boundary.decide({
    decision: { status: "rejected", proposalId: "missing", reason: "not found" },
  });

  assert(!missing.ok, "deciding missing proposals should fail");
  assert(missing.error.code === "effect.rejected", "missing decisions should use a stable effect error");
}

async function acceptsCompactMaterialActionTargets(): Promise<void> {
  const boundary = createEffectBoundary({
    repository: createInMemoryEffectProposalRepository(),
    idFactory: () => "effect-material",
  });

  const proposal = await assertOk(
    boundary.propose({
      proposal: {
        kind: "block_material",
        target: {
          kind: "material",
          materialId: "source-only-material",
          actionScope: "block_material",
        },
        preview: "Block this material.",
        requiresConfirmation: true,
        reversible: true,
      },
    }),
  );

  assert(proposal.id === "effect-material", "effect boundary should store compact material target proposals");
  assert(
    typeof proposal.target === "object" &&
      proposal.target !== null &&
      "kind" in proposal.target &&
      proposal.target.kind === "material" &&
      "actionScope" in proposal.target &&
      proposal.target.actionScope === "block_material",
    "material id action target should round-trip through Effect Boundary",
  );
  assert(proposal.requiresConfirmation, "material consequences should remain confirmation-gated");
}

await proposesEffectsBeforeExternalActions();
await decidesOnlyKnownProposals();
await acceptsCompactMaterialActionTargets();
