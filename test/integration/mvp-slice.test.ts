import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fixtureCanonicalRef,
  fixtureKnownMaterial,
  fixtureSourceOnlyPlayableMaterial,
  fixtureSourceRef,
  fixtureUnresolvedExplorationMaterial,
} from "../../fixtures/integration/mvp-fixture.js";
import type { MusicMaterial, Ref, Result, SourceEntity, SourceMaterial } from "../../src/contracts/index.js";
import { runRecommendationTranscript } from "../../src/app/index.js";
import { createFixtureMineMusicStageCoreHarness } from "../../src/stage_core/index.js";
import type { MineMusicStageCoreHarness } from "../../src/stage_core/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function provesGroundedRecommendationMvpSlice(): Promise<void> {
  const stageCoreDirectory = await mkdtemp(join(tmpdir(), "minemusic-stage-core-"));
  const stageCore = createFixtureMineMusicStageCoreHarness({
    session: {
      id: "session-integration",
      posture: "recommendation",
      activeInstruments: [],
      vibe: {
        text: "quiet but not sleepy coding music",
        tone: "focused",
        explanationDensity: "brief",
      },
    },
    sourceMaterials: [
      fixtureKnownMaterial,
      fixtureSourceOnlyPlayableMaterial,
      fixtureUnresolvedExplorationMaterial,
    ],
    handbookPath: join(stageCoreDirectory, "HANDBOOK.md"),
    canonicalRecords: [
      {
        ref: fixtureCanonicalRef,
        kind: "recording",
        label: "Quiet Coding Track",
        status: "active",
        sourceRefs: [fixtureSourceRef],
      },
    ],
  });

  try {
    await seedFixturePlayableSourceEntities(stageCore, [
      fixtureKnownMaterial,
      fixtureSourceOnlyPlayableMaterial,
    ]);
    const toolCalls = spyStageTools(stageCore, [
      "stage.materials.prepare",
      "stage.recommendation.present",
    ]);
    const transcript = await assertOk(
      runRecommendationTranscript(stageCore, {
        sessionId: "session-integration",
        request: "I need quiet but not sleepy coding music.",
        memoryText: "User likes quiet coding music that still has motion.",
        effectKind: "open_link",
      }),
    );

    assert(
      transcript.response.includes("Quiet Coding Track"),
      "response should recommend the fixture track",
    );
    assert(
      transcript.response.includes("https://fixture.example/play/quiet-coding-track"),
      "response should include source-backed playable link",
    );
    assert(
      transcript.response.includes("https://fixture.example/play/source-only-track"),
      "response should use links from returned presentation cards",
    );
    assert(
      !transcript.response.includes("https://fixture.example/play/unresolved-exploration"),
      "response should not surface unresolved exploration links without store-backed source state",
    );
    assert(
      transcript.presentedCards.every((card) => card.position > 0 && card.presentedAt.length > 0),
      "presentation cards should carry typed position and presentedAt fields",
    );
    assert(
      transcript.presentedMaterials.every((material) => material.materialRef.kind === "material" && material.identityState !== undefined),
      "presented materials should carry material identity projection fields",
    );
    assert(
      transcript.presentedMaterials[0]?.state === "confirmed_playable",
      "known canonical fixture should become confirmed_playable",
    );
    assert(
      transcript.presentedMaterials.some(
        (material) => material.id === fixtureSourceOnlyPlayableMaterial.id,
      ),
      "source-backed playable material should be considered through presentation cards, not the old prepare gate",
    );
    assert(
      transcript.presentedCards.some((card) =>
        card.materialId === transcript.presentedMaterials.find((material) => material.id === fixtureSourceOnlyPlayableMaterial.id)?.materialRef.id &&
        card.status === "playable_unverified" &&
        card.links?.some((link) => link.url === "https://fixture.example/play/source-only-track")
      ),
      "source-backed playable material should be surfaced as a typed playable_unverified card",
    );
    assert(
      !transcript.presentedCards.some((card) => card.title === fixtureUnresolvedExplorationMaterial.label),
      "unresolved exploration material without store-backed source state should not become a presented playable card",
    );
    assert(
      !toolCalls.includes("stage.materials.prepare"),
      "recommendation transcript should not call the legacy prepare gate",
    );
    assert(
      toolCalls.includes("stage.recommendation.present"),
      "recommendation transcript should call the presentation boundary",
    );
    const recommendationEvent = transcript.recordedEvents.find((event) => event.type === "recommendation.presented");
    assert(
      recommendationEvent !== undefined,
      "integration run should record the recommendation presentation event",
    );
    const recommendationPayload = recommendationEvent.payload as {
      cards?: Array<{
        materialId?: string;
        title?: string;
        links?: unknown;
        linkRefs?: Array<{ sourceRef?: Ref; url?: string }>;
        position?: number;
      }>;
      materialStates?: unknown;
    };
    assert(Array.isArray(recommendationPayload.cards), "recommendation event should carry typed presentation cards");
    assert(
      recommendationPayload.cards.every((card) => card.links === undefined),
      "recommendation event should persist compact feedback snapshots, not display links",
    );
    assert(
      recommendationPayload.cards.some((card) =>
        card.title === fixtureSourceOnlyPlayableMaterial.label &&
        card.linkRefs?.some((link) => link.url === "https://fixture.example/play/source-only-track")
      ),
      "recommendation event should retain source/link refs needed for later feedback binding",
    );
    assert(
      recommendationPayload.materialStates === undefined,
      "recommendation event should not carry legacy materialStates payload",
    );
    const contextResult = await assertOk(stageCore.stageInterface.tools["stage.context.read"]({}));
    const context = contextResult as {
      recentCards?: Array<{ eventId: string; materialId: string; position: number; title: string }>;
    };
    assert(
      context.recentCards?.some((card) => card.eventId === recommendationEvent.id && card.title === "Quiet Coding Track"),
      "stage context should expose recentCards from typed presentation payload",
    );
    const sourceOnlyRecentCard = context.recentCards?.find((card) => card.title === fixtureSourceOnlyPlayableMaterial.label);
    const sourceOnlyEventSnapshot = sourceOnlyRecentCard === undefined
      ? undefined
      : recommendationPayload.cards.find((card) =>
          card.position === sourceOnlyRecentCard.position &&
          card.materialId === sourceOnlyRecentCard.materialId
        );
    assert(
      sourceOnlyRecentCard !== undefined &&
        sourceOnlyRecentCard.eventId === recommendationEvent.id &&
        sourceOnlyEventSnapshot?.linkRefs?.some((link) => link.url === "https://fixture.example/play/source-only-track"),
      "feedback binding data should be recoverable from recentCards eventId plus card position",
    );
    const manualRecommendationEvent = await stageCore.stageInterface.tools["stage.events.record"]({
      event: {
        sessionId: "session-integration",
        actor: "llm",
        type: "recommendation.presented",
        payload: { cards: [] },
      },
    });
    assert(!manualRecommendationEvent.ok, "manual recommendation.presented event recording should remain rejected");
    assert(
      transcript.memoryProposal?.entry.text === "User likes quiet coding music that still has motion.",
      "memory update should remain inspectable as a proposal",
    );
    assert(
      transcript.memoryAccepted === null,
      "memory proposal should not become accepted durable memory during recommendation transcript",
    );
    assert(
      transcript.effectProposal?.kind === "open_link",
      "external action should remain represented as an effect proposal",
    );
    assert(
      (transcript.effectProposal?.target as { materialId?: string } | undefined)?.materialId ===
        transcript.presentedCards[0]?.materialId,
      "external action should target the presented material card by materialId",
    );
  } finally {
    await rm(stageCoreDirectory, { force: true, recursive: true });
  }
}

function spyStageTools(
  stageCore: MineMusicStageCoreHarness,
  toolNames: string[],
): string[] {
  const calls: string[] = [];
  const tools = stageCore.stageInterface.tools as Record<
    string,
    (payload: unknown) => Promise<Result<unknown>> | Result<unknown>
  >;

  for (const toolName of toolNames) {
    const original = tools[toolName];
    assert(original !== undefined, `${toolName} should be registered`);
    tools[toolName] = async (payload: unknown) => {
      calls.push(toolName);
      return original(payload);
    };
  }

  return calls;
}

async function seedFixturePlayableSourceEntities(
  stageCore: MineMusicStageCoreHarness,
  materials: SourceMaterial[],
): Promise<void> {
  for (const material of materials) {
    for (const link of material.playableLinks ?? []) {
      await assertOk(Promise.resolve(stageCore.materialStore.upsertSourceEntity({
        entity: sourceEntityFromPlayableLink(material, link),
      })));
    }
  }
}

function sourceEntityFromPlayableLink(
  material: SourceMaterial | MusicMaterial,
  link: NonNullable<MusicMaterial["playableLinks"]>[number],
): SourceEntity {
  const timestamp = "2026-05-31T00:00:00.000Z";
  const base = {
    sourceRef: link.sourceRef,
    providerId: "fixture",
    label: material.label,
    providerUrl: link.url,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (link.sourceRef.kind === "artist") {
    return {
      ...base,
      kind: "artist",
      name: material.label,
    };
  }

  if (link.sourceRef.kind === "release") {
    return {
      ...base,
      kind: "release",
      title: material.label,
    };
  }

  return {
    ...base,
    kind: "track",
    title: material.label,
  };
}

await provesGroundedRecommendationMvpSlice();
