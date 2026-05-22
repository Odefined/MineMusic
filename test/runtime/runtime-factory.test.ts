import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MaterialResolveResult,
  MusicMaterial,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/runtime/index.js";

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
  id: "runtime-factory-session",
  posture: "recommendation",
  activeInstruments: ["minemusic.mvp"],
};

async function createsStageCoreWithInjectedSourceProvider(): Promise<void> {
  const calls: string[] = [];
  const material: MusicMaterial = {
    id: "provider:track:1",
    kind: "recording",
    label: "Provider Coding Track",
    state: "grounded",
    playableLinks: [
      {
        url: "https://provider.example/play/1",
        sourceRef: {
          namespace: "source:provider",
          kind: "track",
          id: "1",
        },
      },
    ],
    sourceRefs: [
      {
        namespace: "source:provider",
        kind: "track",
        id: "1",
      },
    ],
  };
  const sourceProvider: SourceProvider = {
    id: "runtime-test-provider",

    async search() {
      calls.push("provider.search");
      return { ok: true, value: [material] };
    },

    async getPlayableLinks() {
      calls.push("provider.getPlayableLinks");
      return { ok: true, value: material.playableLinks ?? [] };
    },
  };

  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageCore.ready;

  const resolveResult = await assertOk(
    stageCore.stageInterface.tools["music.material.resolve"]({
      kind: "single",
      candidate: {
        id: "coding",
        label: "Coding Track",
        query: {
          text: "coding",
          limit: 1,
        },
      },
    }) as Promise<Result<MaterialResolveResult>>,
  );
  assert(resolveResult.kind === "single", "Stage Core should return a single resolve result");
  const materials = resolveResult.result.materials;

  assert(calls.includes("provider.search"), "Stage Core should route material resolve to injected provider");
  assert(materials[0]?.label === "Provider Coding Track", "Stage Core should return provider material through Stage Interface");
  assert(
    materials[0]?.state === "source_only_playable",
    "Stage Core should preserve source-backed playability normalization",
  );
}

async function writesInstrumentHandbookOnStageCoreReady(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-handbook-"));
  const handbookPath = join(directory, "HANDBOOK.md");
  const sourceProvider: SourceProvider = {
    id: "runtime-test-provider",
    async search() {
      return { ok: true, value: [] };
    },
    async getPlayableLinks() {
      return { ok: true, value: [] };
    },
  };

  try {
    const stageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      handbookPath,
    });
    await stageCore.ready;

    const content = await readFile(handbookPath, "utf8");

    assert(content.includes("# MineMusic Instrument Handbook"), "Stage Core should write the handbook overview file");
    assert(content.includes("`handbook.tool.read`"), "handbook should document precise handbook lookup");
    assert(content.includes("`music.material.resolve`"), "handbook should document music tools from the catalog");
    assert(!content.includes("runtime-test-provider"), "handbook should not expose provider implementation names");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await createsStageCoreWithInjectedSourceProvider();
await writesInstrumentHandbookOnStageCoreReady();
