import type {
  CanonicalRecord,
  EffectProposal,
  MemoryEntry,
  Ref,
  StageEvent,
  StageSession,
} from "../../src/contracts/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryMemoryRepository,
  createInMemorySessionRepository,
  refToStorageKey,
} from "../../src/storage/index.js";

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

async function storesEachRepositoryType(): Promise<void> {
  const session: StageSession = {
    id: "session-1",
    posture: "recommendation",
    activeInstruments: ["source"],
  };
  const sessionRepo = createInMemorySessionRepository();
  await assertOk(sessionRepo.put(session));
  const storedSession = await assertOk(sessionRepo.get(session.id));
  assert(storedSession?.id === session.id, "session repository should get by session id");

  const canonicalRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "canonical-1",
  };
  const canonical: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "Quiet Track",
    status: "provisional",
  };
  const canonicalRepo = createInMemoryCanonicalRecordRepository();
  await assertOk(canonicalRepo.put(canonical));
  const storedCanonical = await assertOk(canonicalRepo.get(canonicalRef));
  assert(storedCanonical?.label === canonical.label, "canonical repository should get by Ref");
  assert(
    refToStorageKey(canonicalRef) === "minemusic:recording:canonical-1",
    "Ref storage key should be stable and readable",
  );

  const event: StageEvent = {
    id: "event-1",
    time: "2026-05-17T00:00:00.000Z",
    sessionId: session.id,
    actor: "stage",
    type: "recommendation_presented",
    payload: { materialState: "confirmed_playable" },
  };
  const eventRepo = createInMemoryEventRepository();
  await assertOk(eventRepo.put(event));
  const events = await assertOk(eventRepo.list());
  assert(events.length === 1 && events[0]?.id === event.id, "event repository should list events");

  const memoryEntry: MemoryEntry = {
    id: "memory-1",
    text: "Likes calm coding music.",
    kind: "contextual_preference",
    evidenceEventIds: [event.id],
    confidence: 0.8,
    undoable: true,
  };
  const memoryRepo = createInMemoryMemoryRepository();
  await assertOk(memoryRepo.put(memoryEntry));
  const storedMemory = await assertOk(memoryRepo.get(memoryEntry.id));
  assert(storedMemory?.text === memoryEntry.text, "memory repository should get by memory id");

  const effectProposal: EffectProposal = {
    id: "effect-1",
    kind: "memory_update",
    preview: "Save calm coding music preference.",
    requiresConfirmation: true,
    reversible: true,
  };
  const effectRepo = createInMemoryEffectProposalRepository();
  await assertOk(effectRepo.put(effectProposal));
  const storedEffect = await assertOk(effectRepo.get(effectProposal.id));
  assert(storedEffect?.kind === effectProposal.kind, "effect proposal repository should get by id");
}

async function repositoriesAreInstanceIsolatedAndReturnCopies(): Promise<void> {
  const firstRepo = createInMemorySessionRepository();
  const secondRepo = createInMemorySessionRepository();
  const session: StageSession = {
    id: "session-2",
    posture: "recommendation",
    activeInstruments: ["source"],
  };

  await assertOk(firstRepo.put(session));
  session.activeInstruments.push("mutated-after-put");

  const firstRead = await assertOk(firstRepo.get(session.id));
  assert(firstRead !== null, "first repository should contain the session");
  assert(
    firstRead.activeInstruments.length === 1,
    "repository should not retain caller mutations after put",
  );

  firstRead.activeInstruments.push("mutated-after-get");
  const secondRead = await assertOk(firstRepo.get(session.id));
  assert(secondRead !== null, "first repository should still contain the session");
  assert(
    secondRead.activeInstruments.length === 1,
    "repository should return copies rather than stored object references",
  );

  const isolatedRead = await assertOk(secondRepo.get(session.id));
  assert(isolatedRead === null, "separate repository instances should not share records");
}

await storesEachRepositoryType();
await repositoriesAreInstanceIsolatedAndReturnCopies();
