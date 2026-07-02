import { randomUUID } from "node:crypto";

import type {
  ConcernRevisionSet,
  Result,
  StageError,
} from "../contracts/kernel.js";
import type {
  ExpireProposalUnitsInput,
  ExpireProposalUnitsOutput,
  ParkProposalUnitInput,
  ParkProposalUnitOutput,
  ProposalUnit,
  ProposalUnitBasisReader,
  ProposalUnitParkingPort,
  ProposalUnitReleasePort,
  ProposalUnitStore,
  ProposalUnitState,
  RecheckProposalUnitBasisInput,
  RecheckProposalUnitBasisOutput,
  ResolveProposalUnitInput,
  ResolveProposalUnitOutput,
} from "../contracts/effect_boundary.js";

export type CreateMemoryProposalUnitStoreInput = {
  ttlMs?: number;
  clock?: () => string;
  proposalUnitIdFactory?: () => string;
  basisReader?: ProposalUnitBasisReader;
  release?: ProposalUnitReleasePort;
};

export const DEFAULT_PROPOSAL_UNIT_TTL_MS = 15 * 60 * 1000;

export function createMemoryProposalUnitStore(
  input: CreateMemoryProposalUnitStoreInput = {},
): ProposalUnitStore {
  const ttlMs = input.ttlMs ?? DEFAULT_PROPOSAL_UNIT_TTL_MS;
  assertPositiveTtl(ttlMs);

  const clock = input.clock ?? (() => new Date().toISOString());
  const proposalUnitIdFactory = input.proposalUnitIdFactory ?? randomProposalUnitId;
  const basisReader = input.basisReader ?? emptyBasisReader;
  const release = input.release ?? unavailableReleasePort;
  const units = new Map<string, ProposalUnit>();

  const store: ProposalUnitStore = {
    async park(parkInput) {
      assertParkInput(parkInput);
      const now = assertComparableClock(clock());
      const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
      const proposalUnitId = createUniqueProposalUnitId({
        units,
        proposalUnitIdFactory,
      });

      units.set(proposalUnitId, {
        proposalUnitId,
        ownerScope: parkInput.ownerScope,
        frozenOwningCommand: cloneOpaque(parkInput.frozenOwningCommand),
        basis: cloneConcernRevisionSet(parkInput.basis),
        state: "pending",
        provenance: cloneOpaque(parkInput.provenance),
        createdAt: now,
        expiresAt,
      });

      return {
        proposalUnitId,
        state: "pending",
        expiresAt,
      };
    },
    async resolve(resolveInput) {
      assertResolveInput(resolveInput);
      const now = assertComparableClock(clock());
      const unit = units.get(resolveInput.proposalUnitId);
      const pending = pendingUnitOrFailure(unit, resolveInput.ownerScope, resolveInput.proposalUnitId);
      if (!pending.ok) {
        return pending;
      }

      if (pending.value.expiresAt <= now) {
        return terminal({
          unit: pending.value,
          state: "expired",
          now,
        });
      }

      if (resolveInput.decision === "reject") {
        return terminal({
          unit: pending.value,
          state: "rejected",
          now,
        });
      }

      const fresh = await recheckPendingBasis({
        basisReader,
        unit: pending.value,
      });
      if (!fresh.ok) {
        return fresh;
      }
      if (!fresh.value) {
        return terminal({
          unit: pending.value,
          state: "voided_stale",
          now,
        });
      }

      const released = await release.release({
        ownerScope: pending.value.ownerScope,
        proposalUnitId: pending.value.proposalUnitId,
        frozenOwningCommand: cloneOpaque(pending.value.frozenOwningCommand),
      });

      if (!released.ok) {
        return released;
      }

      return terminal({
        unit: pending.value,
        state: "confirmed",
        now,
      });
    },
    async expire(expireInput: ExpireProposalUnitsInput = {}) {
      const now = assertComparableClock(clock());
      if (expireInput.ownerScope !== undefined) {
        assertOwnerScope(expireInput.ownerScope);
      }

      let expiredCount = 0;
      for (const unit of units.values()) {
        if (
          unit.state === "pending" &&
          unit.expiresAt <= now &&
          (expireInput.ownerScope === undefined || unit.ownerScope === expireInput.ownerScope)
        ) {
          unit.state = "expired";
          unit.resolvedAt = now;
          expiredCount += 1;
        }
      }

      return { expiredCount };
    },
    async recheckBasis(recheckInput) {
      assertRecheckInput(recheckInput);
      const now = assertComparableClock(clock());
      const unit = units.get(recheckInput.proposalUnitId);
      const pending = pendingUnitOrFailure(unit, recheckInput.ownerScope, recheckInput.proposalUnitId);
      if (!pending.ok) {
        return pending;
      }

      const fresh = await recheckPendingBasis({
        basisReader,
        unit: pending.value,
      });
      if (!fresh.ok) {
        return fresh;
      }
      if (!fresh.value) {
        pending.value.state = "voided_stale";
        pending.value.resolvedAt = now;
        return {
          ok: true,
          value: {
            proposalUnitId: pending.value.proposalUnitId,
            state: "voided_stale",
          },
        };
      }

      return {
        ok: true,
        value: {
          proposalUnitId: pending.value.proposalUnitId,
          state: "pending",
        },
      };
    },
  };

  return store;
}

export function createUnavailableProposalUnitParkingPort(): ProposalUnitParkingPort {
  return {
    async park() {
      throw new Error("Proposal Unit parking port is not available in this Stage Tool Context.");
    },
  };
}

function createUniqueProposalUnitId(input: {
  units: ReadonlyMap<string, ProposalUnit>;
  proposalUnitIdFactory: () => string;
}): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const proposalUnitId = input.proposalUnitIdFactory();
    assertNonEmptyString(proposalUnitId, "proposalUnitId");
    if (!input.units.has(proposalUnitId)) {
      return proposalUnitId;
    }
  }

  throw new Error("Could not mint a unique Proposal Unit id.");
}

function terminal(input: {
  unit: ProposalUnit;
  state: Exclude<ProposalUnitState, "pending">;
  now: string;
}): Result<ResolveProposalUnitOutput> {
  input.unit.state = input.state;
  input.unit.resolvedAt = input.now;
  return {
    ok: true,
    value: {
      proposalUnitId: input.unit.proposalUnitId,
      state: input.state,
    },
  };
}

async function recheckPendingBasis(input: {
  basisReader: ProposalUnitBasisReader;
  unit: ProposalUnit;
}): Promise<Result<boolean>> {
  const current = await input.basisReader.currentBasis({
    ownerScope: input.unit.ownerScope,
  });
  if (!current.ok) {
    return current;
  }

  assertConcernRevisionSet(current.value);

  return {
    ok: true,
    value: basisMatches(input.unit.basis, current.value),
  };
}

function basisMatches(frozen: ConcernRevisionSet, current: ConcernRevisionSet): boolean {
  return basisKeyMatches(frozen, current, "radioDirectionRevision") &&
    basisKeyMatches(frozen, current, "queueRevision") &&
    basisKeyMatches(frozen, current, "radioSessionRevision") &&
    basisKeyMatches(frozen, current, "playbackRevision");
}

function basisKeyMatches(
  frozen: ConcernRevisionSet,
  current: ConcernRevisionSet,
  key: keyof ConcernRevisionSet,
): boolean {
  const frozenRevision = frozen[key];
  return frozenRevision === undefined || current[key] === frozenRevision;
}

function pendingUnitOrFailure(
  unit: ProposalUnit | undefined,
  ownerScope: string,
  proposalUnitId: string,
): Result<ProposalUnit> {
  if (unit === undefined || unit.ownerScope !== ownerScope) {
    return effectBoundaryFailure(
      "effect_boundary.proposal_unit_not_found",
      "Proposal Unit is unknown for this owner.",
      true,
    );
  }

  if (unit.state !== "pending") {
    return effectBoundaryFailure(
      "effect_boundary.proposal_unit_not_pending",
      `Proposal Unit is already ${unit.state}.`,
      false,
    );
  }

  return {
    ok: true,
    value: unit,
  };
}

const emptyBasisReader: ProposalUnitBasisReader = {
  async currentBasis() {
    return {
      ok: true,
      value: {},
    };
  },
};

const unavailableReleasePort: ProposalUnitReleasePort = {
  async release() {
    throw new Error("Proposal Unit release port is not available.");
  },
};

function randomProposalUnitId(): string {
  return `pu_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function assertParkInput(input: ParkProposalUnitInput): void {
  assertOwnerScope(input.ownerScope);
  assertFrozenOwningCommand(input.frozenOwningCommand);
  assertConcernRevisionSet(input.basis);
  assertNonEmptyString(input.provenance.sessionId, "provenance.sessionId");
  assertNonEmptyString(input.provenance.requestId, "provenance.requestId");
  if (input.provenance.gateDecision !== "ask" && input.provenance.gateDecision !== "raise-to-conversation") {
    throw new Error("provenance.gateDecision must be ask or raise-to-conversation.");
  }
  if (input.provenance.actor !== undefined && input.provenance.actor !== "main_agent" && input.provenance.actor !== "radio_agent") {
    throw new Error("provenance.actor must be main_agent or radio_agent when present.");
  }
  if (input.provenance.issuedFromUserActionId !== undefined) {
    assertNonEmptyString(input.provenance.issuedFromUserActionId, "provenance.issuedFromUserActionId");
  }
}

function assertResolveInput(input: ResolveProposalUnitInput): void {
  assertOwnerScope(input.ownerScope);
  assertNonEmptyString(input.proposalUnitId, "proposalUnitId");
  if (input.decision !== "confirm" && input.decision !== "reject") {
    throw new Error("decision must be confirm or reject.");
  }
}

function assertRecheckInput(input: RecheckProposalUnitBasisInput): void {
  assertOwnerScope(input.ownerScope);
  assertNonEmptyString(input.proposalUnitId, "proposalUnitId");
}

function assertFrozenOwningCommand(command: ParkProposalUnitInput["frozenOwningCommand"]): void {
  assertNonEmptyString(command.descriptor.name, "frozenOwningCommand.descriptor.name");
  assertNonEmptyString(command.descriptor.instrumentId, "frozenOwningCommand.descriptor.instrumentId");
  assertNonEmptyString(command.descriptor.label, "frozenOwningCommand.descriptor.label");
  assertNonEmptyString(command.descriptor.description, "frozenOwningCommand.descriptor.description");
  assertJsonRecord(command.descriptor.inputSchema, "frozenOwningCommand.descriptor.inputSchema");
  assertJsonRecord(command.descriptor.outputSchema, "frozenOwningCommand.descriptor.outputSchema");
}

function assertConcernRevisionSet(value: ConcernRevisionSet): void {
  for (const key of Object.keys(value)) {
    if (!concernRevisionKeys.has(key as keyof ConcernRevisionSet)) {
      throw new Error(`Unknown concern revision key: ${key}.`);
    }
  }

  assertRevision(value.radioDirectionRevision, "radioDirectionRevision");
  assertRevision(value.queueRevision, "queueRevision");
  assertRevision(value.radioSessionRevision, "radioSessionRevision");
  assertRevision(value.playbackRevision, "playbackRevision");
}

function assertRevision(value: number | undefined, fieldName: string): void {
  if (value !== undefined && !Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a safe integer when present.`);
  }
}

const concernRevisionKeys = new Set<keyof ConcernRevisionSet>([
  "radioDirectionRevision",
  "queueRevision",
  "radioSessionRevision",
  "playbackRevision",
]);

function assertJsonRecord(value: Readonly<Record<string, unknown>>, fieldName: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }
}

function cloneConcernRevisionSet(value: ConcernRevisionSet): ConcernRevisionSet {
  return cloneOpaque(value) as ConcernRevisionSet;
}

function cloneOpaque<T>(value: T): T {
  return structuredClone(value);
}

function assertPositiveTtl(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Proposal Unit ttlMs must be a positive safe integer.");
  }
}

function assertOwnerScope(ownerScope: string): void {
  assertNonEmptyString(ownerScope, "ownerScope");
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

const COMPARABLE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function assertComparableClock(now: string): string {
  if (!COMPARABLE_TIMESTAMP_PATTERN.test(now) || Number.isNaN(Date.parse(now))) {
    throw new Error(
      "Proposal Unit clock must return a fixed-width UTC ISO timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).",
    );
  }

  return now;
}

function effectBoundaryFailure<T>(
  code: string,
  message: string,
  retryable: boolean,
): Result<T> {
  const error: StageError = {
    code,
    message,
    area: "effect_boundary",
    retryable,
  };

  return {
    ok: false,
    error,
  };
}
