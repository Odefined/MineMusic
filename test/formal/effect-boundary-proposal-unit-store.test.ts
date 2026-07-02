import assert from "node:assert/strict";

import type {
  FrozenOwningCommand,
  ProposalUnitBasisReader,
  ProposalUnitReleasePort,
} from "../../src/contracts/effect_boundary.js";
import type { ConcernRevisionSet, Result } from "../../src/contracts/kernel.js";
import { createMemoryProposalUnitStore } from "../../src/effect_boundary/index.js";

let now = "2026-07-02T00:00:00.000Z";
let nextId = 0;
let currentBasis: ConcernRevisionSet = {
  radioDirectionRevision: 1,
  queueRevision: 2,
};
const releaseCalls: {
  ownerScope: string;
  proposalUnitId: string;
  frozenOwningCommand: FrozenOwningCommand;
}[] = [];

const basisReader: ProposalUnitBasisReader = {
  async currentBasis() {
    return {
      ok: true,
      value: { ...currentBasis },
    };
  },
};

const release: ProposalUnitReleasePort = {
  async release(input) {
    releaseCalls.push(input);
    return {
      ok: true,
      value: undefined,
    };
  },
};

const store = createMemoryProposalUnitStore({
  ttlMs: 1_000,
  clock: () => now,
  proposalUnitIdFactory: () => `pu_test_${++nextId}`,
  basisReader,
  release,
});

const mutableArguments = {
  item: "[material:abc]",
};
const parked = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command(mutableArguments),
  basis: {
    radioDirectionRevision: 1,
    queueRevision: 2,
  },
  provenance: {
    gateDecision: "ask",
    sessionId: "session-a",
    requestId: "request-a",
    actor: "main_agent",
  },
});

assert.deepEqual(parked, {
  proposalUnitId: "pu_test_1",
  state: "pending",
  expiresAt: "2026-07-02T00:00:01.000Z",
});
assert.equal(Object.hasOwn(parked, "effectKind"), false);
assert.equal(Object.hasOwn(parked, "structuredFacts"), false);
assert.equal(Object.hasOwn(parked, "stale"), false);
assert.equal(Object.hasOwn(parked, "outcome"), false);

mutableArguments.item = "[material:mutated]";

const freshConfirm = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: parked.proposalUnitId,
  decision: "confirm",
});
assert.deepEqual(okValue(freshConfirm), {
  proposalUnitId: "pu_test_1",
  state: "confirmed",
});
assert.equal(releaseCalls.length, 1);
assert.equal(releaseCalls[0]?.proposalUnitId, "pu_test_1");
assert.deepEqual(releaseCalls[0]?.frozenOwningCommand.arguments, {
  item: "[material:abc]",
});
assert.equal("resultSummary" in (releaseCalls[0]?.frozenOwningCommand.descriptor ?? {}), false);
assert.equal("agentResultText" in (releaseCalls[0]?.frozenOwningCommand.descriptor ?? {}), false);

const rejectPark = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command({ item: "[material:def]" }),
  basis: {},
  provenance: {
    gateDecision: "raise-to-conversation",
    sessionId: "session-b",
    requestId: "request-b",
    actor: "radio_agent",
  },
});
const rejected = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: rejectPark.proposalUnitId,
  decision: "reject",
});
assert.deepEqual(okValue(rejected), {
  proposalUnitId: "pu_test_2",
  state: "rejected",
});
assert.equal(releaseCalls.length, 1);

currentBasis = {
  radioDirectionRevision: 2,
  queueRevision: 2,
};
const stalePark = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command({ item: "[material:ghi]" }),
  basis: {
    radioDirectionRevision: 1,
  },
  provenance: {
    gateDecision: "ask",
    sessionId: "session-c",
    requestId: "request-c",
  },
});
const stale = await store.recheckBasis({
  ownerScope: "owner-a",
  proposalUnitId: stalePark.proposalUnitId,
});
assert.deepEqual(okValue(stale), {
  proposalUnitId: "pu_test_3",
  state: "voided_stale",
});
assert.equal(releaseCalls.length, 1);

currentBasis = {
  radioDirectionRevision: 2,
  queueRevision: 2,
};
const confirmStalePark = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command({ item: "[material:jkl]" }),
  basis: {
    queueRevision: 1,
  },
  provenance: {
    gateDecision: "ask",
    sessionId: "session-d",
    requestId: "request-d",
  },
});
const confirmStale = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: confirmStalePark.proposalUnitId,
  decision: "confirm",
});
assert.deepEqual(okValue(confirmStale), {
  proposalUnitId: "pu_test_4",
  state: "voided_stale",
});
assert.equal(releaseCalls.length, 1);

const expiringPark = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command({ item: "[material:mno]" }),
  basis: {},
  provenance: {
    gateDecision: "ask",
    sessionId: "session-e",
    requestId: "request-e",
  },
});
now = "2026-07-02T00:00:02.000Z";
const expired = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: expiringPark.proposalUnitId,
  decision: "confirm",
});
assert.deepEqual(okValue(expired), {
  proposalUnitId: "pu_test_5",
  state: "expired",
});
assert.equal(releaseCalls.length, 1);

now = "2026-07-02T00:00:03.000Z";
const scopedA = await store.park({
  ownerScope: "owner-a",
  frozenOwningCommand: command({ item: "[material:pqr]" }),
  basis: {},
  provenance: {
    gateDecision: "ask",
    sessionId: "session-f",
    requestId: "request-f",
  },
});
const scopedB = await store.park({
  ownerScope: "owner-b",
  frozenOwningCommand: command({ item: "[material:stu]" }),
  basis: {},
  provenance: {
    gateDecision: "ask",
    sessionId: "session-g",
    requestId: "request-g",
  },
});
now = "2026-07-02T00:00:05.000Z";
assert.deepEqual(await store.expire({ ownerScope: "owner-a" }), {
  expiredCount: 1,
});
const scopedAAfterExpire = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: scopedA.proposalUnitId,
  decision: "confirm",
});
assert.equal(scopedAAfterExpire.ok, false);
if (!scopedAAfterExpire.ok) {
  assert.equal(scopedAAfterExpire.error.code, "effect_boundary.proposal_unit_not_pending");
}
const scopedBAfterExpire = await store.recheckBasis({
  ownerScope: "owner-b",
  proposalUnitId: scopedB.proposalUnitId,
});
assert.deepEqual(okValue(scopedBAfterExpire), {
  proposalUnitId: scopedB.proposalUnitId,
  state: "pending",
});

const wrongOwner = await store.resolve({
  ownerScope: "owner-a",
  proposalUnitId: scopedB.proposalUnitId,
  decision: "confirm",
});
assert.equal(wrongOwner.ok, false);
if (!wrongOwner.ok) {
  assert.equal(wrongOwner.error.code, "effect_boundary.proposal_unit_not_found");
}

const restartedStore = createMemoryProposalUnitStore({
  ttlMs: 1_000,
  clock: () => now,
  proposalUnitIdFactory: () => "pu_after_restart",
  basisReader,
  release,
});
const afterRestart = await restartedStore.resolve({
  ownerScope: "owner-b",
  proposalUnitId: scopedB.proposalUnitId,
  decision: "confirm",
});
assert.equal(afterRestart.ok, false);
if (!afterRestart.ok) {
  assert.equal(afterRestart.error.code, "effect_boundary.proposal_unit_not_found");
}

function command(args: unknown): FrozenOwningCommand {
  return {
    descriptor: {
      name: "library.relation.save",
      instrumentId: "library.relation",
      label: "Save",
      ownerArea: "music_data_platform",
      description: "Save an item.",
      usage: {
        useWhen: "Save a material item.",
        doNotUseWhen: "Do not use for playback.",
        outputSemantics: "Returns compact relation state.",
      },
      examples: [
        {
          prompt: "save this",
          expects: "call",
        },
        {
          prompt: "play this",
          expects: "avoid",
        },
      ],
      sideEffect: {
        durableUserStateWrite: true,
        ownerCurationWrite: true,
        runtimeStateWrite: false,
        externalCall: false,
      },
      invocationPolicy: {
        defaultDecision: "auto",
        impactClass: "local-bounded",
        dataEgress: "none",
        readOnlyHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        type: "object",
      },
      outputSchema: {
        type: "object",
      },
      errors: [
        {
          code: "invalid_input",
          retryable: false,
          suggestedFixTemplate: "Retry with valid input.",
        },
      ],
    },
    arguments: args,
  };
}

function okValue<T>(result: Result<T>): T {
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected Result.ok true.");
  }
  return result.value;
}
