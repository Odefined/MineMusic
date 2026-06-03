import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CanonicalRecord,
  Ref,
  Result,
  SourceMaterial,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/stage_core/index.js";
import type { CompactPublicMaterialResolveOutput } from "../../src/stage_interface/outputs/index.js";

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

const session: StageSession = {
  id: "canonical-persistence-session",
  posture: "recommendation",
  activeInstruments: [],
};

async function survivesStageCoreRecreationWithSqliteCanonicalStorage(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-stage-core-"));
  const databasePath = join(directory, "material-store.sqlite");
  const sourceRef: Ref = {
    namespace: "source:provider",
    kind: "track",
    id: "persisted-track",
  };
  const unknownSourceRef: Ref = {
    namespace: "source:provider",
    kind: "track",
    id: "source-only-track",
  };
  const canonicalRecord: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "persisted-canonical",
      label: "Persisted Canonical Track",
    },
    kind: "recording",
    label: "Persisted Canonical Track",
    status: "active",
    sourceRefs: [sourceRef],
  };
  const canonicalMaterial: SourceMaterial = {
    id: "provider:track:persisted-track",
    kind: "recording",
    label: "Persisted Canonical Track",
    state: "grounded",
    sourceRefs: [sourceRef],
    playableLinks: [
      {
        url: "https://provider.example/play/persisted-track",
        sourceRef,
      },
    ],
  };
  const sourceOnlyMaterial: SourceMaterial = {
    id: "provider:track:source-only-track",
    kind: "recording",
    label: "Source Only Track",
    state: "grounded",
    sourceRefs: [unknownSourceRef],
    playableLinks: [
      {
        url: "https://provider.example/play/source-only-track",
        sourceRef: unknownSourceRef,
      },
    ],
  };
  const sourceProvider = createStaticSourceProvider([
    canonicalMaterial,
    sourceOnlyMaterial,
  ]);

  try {
    const firstStageRuntime = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      materialStoreDatabasePath: databasePath,
      canonicalRecords: [canonicalRecord],
      handbookPath: join(directory, "first-HANDBOOK.md"),
    });
    await firstStageRuntime.ready;
    await assertOk(firstStageRuntime.materialStore.putConfirmedCanonicalBinding({
      binding: {
        sourceRef,
        canonicalRef: canonicalRecord.ref,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }));
    const firstBoundRecord = await assertOk(firstStageRuntime.materialStore.findMaterialBySourceRef({ sourceRef }));

    assert(firstBoundRecord !== null, "confirmed binding should immediately materialize a durable material record");
    assert(
      firstBoundRecord.identityState === "canonical_confirmed",
      "confirmed binding should immediately promote the material to canonical-confirmed",
    );
    assert(
      firstBoundRecord.canonicalRef !== undefined && sameRef(firstBoundRecord.canonicalRef, canonicalRecord.ref),
      "confirmed binding material should keep the canonical ref before restart",
    );
    assert(
      firstBoundRecord.sourceRefs.some((candidate) => sameRef(candidate, sourceRef)),
      "confirmed binding material should keep the source ref before restart",
    );

    const firstResolve = await resolveSingleCandidate(firstStageRuntime, "Persisted Canonical Track");
    assert(
      firstResolve.items[0]?.state === "confirmed_playable",
      "confirmed binding should confirm playability before restart",
    );

    const recreatedStageRuntime = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      materialStoreDatabasePath: databasePath,
      handbookPath: join(directory, "second-HANDBOOK.md"),
    });
    await recreatedStageRuntime.ready;
    const recreatedBoundRecord = await assertOk(recreatedStageRuntime.materialStore.findMaterialBySourceRef({ sourceRef }));

    assert(recreatedBoundRecord !== null, "confirmed binding material should persist across restart");
    assert(
      recreatedBoundRecord.identityState === "canonical_confirmed",
      "confirmed binding material should stay canonical-confirmed after restart",
    );
    assert(
      recreatedBoundRecord.canonicalRef !== undefined && sameRef(recreatedBoundRecord.canonicalRef, canonicalRecord.ref),
      "confirmed binding material should keep the canonical ref after restart",
    );
    assert(
      recreatedBoundRecord.sourceRefs.some((candidate) => sameRef(candidate, sourceRef)),
      "confirmed binding material should keep the source ref after restart",
    );

    const persistedResolve = await resolveSingleCandidate(recreatedStageRuntime, "Persisted Canonical Track");

    assert(
      persistedResolve.items[0]?.materialId !== undefined,
      "material should carry a material ref after recreation",
    );
    assert(
      persistedResolve.items[0]?.state === "confirmed_playable",
      "persisted confirmed binding plus source-backed playable link should be confirmed playable after recreation",
    );

    const sourceOnlyResolve = await resolveSingleCandidate(recreatedStageRuntime, "Source Only Track");

    assert(
      sourceOnlyResolve.items[0]?.materialId !== undefined,
      "source-only material should carry a material ref",
    );
    assert(
      sourceOnlyResolve.items[0]?.state === "source_only_playable",
      "source-only playable material should remain source_only_playable",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function createStaticSourceProvider(materials: SourceMaterial[]): SourceProvider {
  return {
    id: "canonical-persistence-provider",

    async search({ query }) {
      const sourceRef = query.sourceRef;

      if (sourceRef !== undefined) {
        return {
          ok: true,
          value: materials
            .filter((material) =>
              (material.sourceRefs ?? []).some((candidate) => sameRef(candidate, sourceRef)),
            )
            .map((material) => structuredClone(material)),
        };
      }

      const text = query.text?.toLowerCase();

      return {
        ok: true,
        value: materials
          .filter((material) => text === undefined || material.label.toLowerCase().includes(text))
          .map((material) => structuredClone(material)),
      };
    },

    async getPlayableLinks({ material }) {
      return {
        ok: true,
        value: structuredClone(material.playableLinks ?? []),
      };
    },
  };
}

async function resolveSingleCandidate(
  stageRuntime: ReturnType<typeof createMineMusicStageCoreWithSourceProvider>,
  text: string,
): Promise<CompactPublicMaterialResolveOutput> {
  const resolveResult = await assertOk(
    stageRuntime.stageInterface.tools["music.material.resolve"]({
      queries: [{ text, kind: "recording" }],
    }) as Promise<Result<CompactPublicMaterialResolveOutput>>,
  );

  return resolveResult;
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await survivesStageCoreRecreationWithSqliteCanonicalStorage();
