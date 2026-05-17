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

await proposesEffectsBeforeExternalActions();
await decidesOnlyKnownProposals();
