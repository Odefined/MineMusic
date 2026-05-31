import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fixtureCanonicalRef,
  fixtureExplorationMaterial,
  fixtureKnownMaterial,
  fixtureSourceRef,
} from "../../fixtures/integration/mvp-fixture.js";
import type { Result } from "../../src/contracts/index.js";
import { runRecommendationTranscript } from "../../src/app/index.js";
import { createFixtureMineMusicStageCoreHarness } from "../../src/stage_core/index.js";

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
    sourceMaterials: [fixtureKnownMaterial, fixtureExplorationMaterial],
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
      transcript.response.includes("https://fixture.example/play/unconfirmed-track"),
      "response should use links from returned presentation cards",
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
        (material) => material.id === fixtureExplorationMaterial.id,
      ),
      "exploration material should be considered through presentation cards, not the old prepare gate",
    );
    assert(
      transcript.presentedCards.some((card) =>
        card.materialId === transcript.presentedMaterials.find((material) => material.id === fixtureExplorationMaterial.id)?.materialRef.id &&
        card.status === "playable_unverified" &&
        card.links?.some((link) => link.url === "https://fixture.example/play/unconfirmed-track")
      ),
      "source-only exploration should be surfaced as a typed playable_unverified card",
    );
    const recommendationEvent = transcript.recordedEvents.find((event) => event.type === "recommendation.presented");
    assert(
      recommendationEvent !== undefined,
      "integration run should record the recommendation presentation event",
    );
    const recommendationPayload = recommendationEvent.payload as { cards?: unknown[]; materialStates?: unknown };
    assert(Array.isArray(recommendationPayload.cards), "recommendation event should carry typed presentation cards");
    assert(
      recommendationPayload.materialStates === undefined,
      "recommendation event should not carry legacy materialStates payload",
    );
    const contextResult = await assertOk(stageCore.stageInterface.tools["stage.context.read"]({}));
    const context = contextResult as { recentCards?: Array<{ eventId: string; title: string }> };
    assert(
      context.recentCards?.some((card) => card.eventId === recommendationEvent.id && card.title === "Quiet Coding Track"),
      "stage context should expose recentCards from typed presentation payload",
    );
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

await provesGroundedRecommendationMvpSlice();
