import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CanonicalRecord,
  MaterialResolveResult,
  MusicMaterial,
  Ref,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/stage_core/index.js";

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
  const canonicalMaterial: MusicMaterial = {
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
  const sourceOnlyMaterial: MusicMaterial = {
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
    const firstStageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      materialStoreDatabasePath: databasePath,
      canonicalRecords: [canonicalRecord],
      handbookPath: join(directory, "first-HANDBOOK.md"),
    });
    await firstStageCore.ready;

    const firstResolve = await resolveSingleCandidate(firstStageCore, {
      id: "first",
      label: "Persisted Canonical Track",
      sourceRef,
    });
    assert(
      firstResolve.result.materials[0]?.state === "confirmed_playable",
      "seeded canonical identity should confirm playability before restart",
    );

    const recreatedStageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      materialStoreDatabasePath: databasePath,
      handbookPath: join(directory, "second-HANDBOOK.md"),
    });
    await recreatedStageCore.ready;

    const persistedResolve = await resolveSingleCandidate(recreatedStageCore, {
      id: "persisted",
      label: "Persisted Canonical Track",
      sourceRef,
    });
    const persistedMaterial = persistedResolve.result.materials[0];

    assert(
      persistedResolve.result.canonicalRef?.id === canonicalRecord.ref.id,
      "recreated Stage Core should resolve the same persisted canonical ref",
    );
    assert(
      persistedMaterial?.canonicalRef?.id === canonicalRecord.ref.id,
      "material should carry the persisted canonical ref after recreation",
    );
    assert(
      persistedMaterial?.state === "confirmed_playable",
      "canonical identity plus source-backed playable link should be confirmed playable after recreation",
    );

    const sourceOnlyResolve = await resolveSingleCandidate(recreatedStageCore, {
      id: "source-only",
      label: "Source Only Track",
      sourceRef: unknownSourceRef,
    });
    const sourceOnly = sourceOnlyResolve.result.materials[0];

    assert(
      sourceOnlyResolve.result.canonicalRef === undefined,
      "unknown source ref should not invent canonical identity",
    );
    assert(
      sourceOnly?.canonicalRef === undefined,
      "source-only material should not carry a canonical ref",
    );
    assert(
      sourceOnly?.state === "source_only_playable",
      "source-only playable material should remain source_only_playable",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function createStaticSourceProvider(materials: MusicMaterial[]): SourceProvider {
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
  stageCore: ReturnType<typeof createMineMusicStageCoreWithSourceProvider>,
  candidate: {
    id: string;
    label: string;
    sourceRef: Ref;
  },
): Promise<Extract<MaterialResolveResult, { kind: "single" }>> {
  const resolveResult = await assertOk(
    stageCore.stageInterface.tools["music.material.resolve"]({
      kind: "single",
      candidate,
    }) as Promise<Result<MaterialResolveResult>>,
  );

  assert(resolveResult.kind === "single", "resolve result should be single-kind");

  return resolveResult;
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await survivesStageCoreRecreationWithSqliteCanonicalStorage();
