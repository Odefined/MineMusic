import type { EffectBoundaryPort, EventPort } from "../../src/ports/index.js";
import { createMemoryService } from "../../src/memory/index.js";
import { createInMemoryMemoryRepository } from "../../src/storage/index.js";

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

const events: EventPort = {
  record: async ({ event }) => ({
    ok: true,
    value: { ...event, id: "event-recorded", time: "2026-05-17T00:00:00.000Z" },
  }),
  listBySession: async () => ({
    ok: true,
    value: [
      {
        id: "event-1",
        time: "2026-05-17T00:00:00.000Z",
        sessionId: "session-1",
        actor: "user",
        type: "feedback",
        payload: { text: "quiet coding music works" },
      },
    ],
  }),
};

function createRecordingEffectBoundary(calls: string[]): EffectBoundaryPort {
  return {
    propose: async ({ proposal }) => {
      calls.push(proposal.kind);
      return { ok: true, value: { ...proposal, id: "effect-1" } };
    },
    decide: async () => ({ ok: true, value: undefined }),
  };
}

async function rejectsWeakMemoryProposals(): Promise<void> {
  const calls: string[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary(calls),
    idFactory: () => "memory-proposal-weak",
  });

  const result = await memory.propose({
    proposal: {
      entry: {
        text: "Probably likes every ambient track.",
        kind: "contextual_preference",
      },
      reason: "LLM guess without evidence.",
      requiresEffectApproval: true,
    },
  });

  assert(!result.ok, "weak contextual preferences should not become proposals");
  assert(result.error.code === "memory.insufficient_evidence", "weak memory should use stable error");
}

async function acceptsEvidenceBackedProposalsThroughEffectBoundary(): Promise<void> {
  const calls: string[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary(calls),
    idFactory: () => "memory-proposal-1",
  });

  const proposal = await assertOk(
    memory.propose({
      proposal: {
        entry: {
          text: "Likes quiet but not sleepy coding music.",
          kind: "contextual_preference",
          evidenceEventIds: ["event-1"],
          confidence: 0.85,
          undoable: true,
        },
        reason: "User gave explicit session feedback.",
        requiresEffectApproval: true,
      },
    }),
  );
  const accepted = await assertOk(memory.accept({ proposalId: proposal.id }));
  const summaries = await assertOk(memory.summarizeForSession({ sessionId: "session-1" }));

  assert(calls.includes("memory_update"), "accepting durable memory should pass through effect boundary");
  assert(accepted.id === proposal.id, "accepted memory should use proposal id as entry id");
  assert(summaries.includes(accepted.text), "accepted memory should be summarized");
}

async function materialStructuredTargetKeepsEvidenceGateAndEffectTarget(): Promise<void> {
  const effectTargets: unknown[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: {
      propose: async ({ proposal }) => {
        effectTargets.push(proposal.target);
        return { ok: true, value: { ...proposal, id: "effect-material-memory" } };
      },
      decide: async () => ({ ok: true, value: undefined }),
    },
    idFactory: () => "memory-proposal-material",
  });

  const weak = await memory.propose({
    proposal: {
      entry: {
        text: "Likes this source-only material for coding.",
        kind: "contextual_preference",
        structuredTarget: {
          kind: "material",
          materialRef: { namespace: "minemusic", kind: "material", id: "memory-material" },
          scope: { level: "material" },
        },
      },
      reason: "No evidence yet.",
      requiresEffectApproval: true,
    },
  });
  const proposal = await assertOk(
    memory.propose({
      proposal: {
        entry: {
          text: "Likes this source-only material for coding.",
          kind: "contextual_preference",
          structuredTarget: {
            kind: "material",
            materialRef: { namespace: "minemusic", kind: "material", id: "memory-material" },
            scope: { level: "material" },
          },
          evidenceEventIds: ["event-1"],
        },
        reason: "User gave feedback on the material.",
        requiresEffectApproval: true,
      },
    }),
  );
  const accepted = await assertOk(memory.accept({ proposalId: proposal.id }));

  assert(!weak.ok, "material memory still needs explicit rule status or evidence");
  assert(accepted.structuredTarget?.kind === "material", "accepted memory should retain structured material target");
  assert(
    effectTargets.some(
      (target) =>
        typeof target === "object" &&
        target !== null &&
        "kind" in target &&
        target.kind === "material" &&
        "actionScope" in target &&
        target.actionScope === "remember_preference",
    ),
    "accepted material memory should propose a compact material effect target",
  );
}

await rejectsWeakMemoryProposals();
await acceptsEvidenceBackedProposalsThroughEffectBoundary();
await materialStructuredTargetKeepsEvidenceGateAndEffectTarget();
