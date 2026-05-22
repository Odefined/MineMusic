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
import { createMineMusicStageCore } from "../../src/stage_core/index.js";

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
  const runtimeDirectory = await mkdtemp(join(tmpdir(), "minemusic-runtime-"));
  const stageCore = createMineMusicStageCore({
    session: {
      id: "session-integration",
      posture: "recommendation",
      activeInstruments: ["minemusic.mvp"],
      vibe: {
        text: "quiet but not sleepy coding music",
        tone: "focused",
        explanationDensity: "brief",
      },
    },
    sourceMaterials: [fixtureKnownMaterial, fixtureExplorationMaterial],
    handbookPath: join(runtimeDirectory, "HANDBOOK.md"),
    canonicalRecords: [
      {
        ref: fixtureCanonicalRef,
        kind: "recording",
        label: "Quiet Coding Track",
        status: "active",
        externalKeys: [fixtureSourceRef],
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
      !transcript.response.includes("https://fixture.example/play/unconfirmed-track"),
      "response should not include unconfirmed exploration links",
    );
    assert(
      transcript.presentedMaterials.every((material) =>
        material.playableLinks === undefined ||
        material.state === "confirmed_playable" ||
        material.state === "source_only_playable",
      ),
      "playable links should appear only on source-backed playable states",
    );
    assert(
      transcript.presentedMaterials[0]?.state === "confirmed_playable",
      "known canonical fixture should become confirmed_playable",
    );
    assert(
      transcript.presentedMaterials.some(
        (material) => material.id === fixtureExplorationMaterial.id && material.playableLinks === undefined,
      ),
      "exploration material should be presentable only without playable links",
    );
    assert(
      transcript.recordedEvents.some((event) => event.type === "recommendation.presented"),
      "integration run should record the recommendation presentation event",
    );
    assert(
      transcript.memoryProposal.entry.text === "User likes quiet coding music that still has motion.",
      "memory update should remain inspectable as a proposal",
    );
    assert(
      transcript.memoryAccepted === null,
      "memory proposal should not become accepted durable memory during recommendation transcript",
    );
    assert(
      transcript.effectProposal.kind === "open_link",
      "external action should remain represented as an effect proposal",
    );
  } finally {
    await rm(runtimeDirectory, { force: true, recursive: true });
  }
}

await provesGroundedRecommendationMvpSlice();
