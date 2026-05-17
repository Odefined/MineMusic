import type { MusicMaterial, Result, SourceProvider, StageSession } from "../../src/contracts/index.js";
import { createMineMusicRuntimeWithSourceProvider } from "../../src/runtime/index.js";

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

async function createsRuntimeWithInjectedSourceProvider(): Promise<void> {
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

  const runtime = createMineMusicRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await runtime.ready;

  const materials = await assertOk(
    runtime.toolApi.tools["music.material.ground"]({
      query: {
        text: "coding",
        limit: 1,
      },
    }) as Promise<Result<MusicMaterial[]>>,
  );

  assert(calls.includes("provider.search"), "runtime should route source grounding to injected provider");
  assert(materials[0]?.label === "Provider Coding Track", "runtime should return provider material through tool API");
  assert(
    materials[0]?.state === "source_only_playable",
    "runtime should preserve source-backed playability normalization",
  );
}

await createsRuntimeWithInjectedSourceProvider();
