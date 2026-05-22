import type {
  CanonicalRecord,
  MusicMaterial,
  Result,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
import { join } from "node:path";
import { createCanonicalStore } from "../canonical/index.js";
import { createEffectBoundary } from "../effects/index.js";
import { createEventService } from "../events/index.js";
import { writeInstrumentHandbookFile } from "../handbook/index.js";
import { createMemoryService } from "../memory/index.js";
import { createPluginRegistry } from "../plugins/index.js";
import type {
  CanonicalStorePort,
  EffectBoundaryPort,
  EventPort,
  MaterialGatePort,
  MemoryPort,
  PluginRegistryPort,
  SessionContextPort,
  SourceResolutionPort,
  ToolDispatchPort,
} from "../ports/index.js";
import { createSourceResolutionService } from "../source/index.js";
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
  type MineMusicStageInterface,
} from "../stage_interface/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryMemoryRepository,
} from "../storage/index.js";

export type MineMusicStageCore = {
  ready: Promise<void>;
  stageInterface: MineMusicStageInterface;
  dispatch: ToolDispatchPort;
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  canonical: CanonicalStorePort;
  source: SourceResolutionPort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
  plugins: PluginRegistryPort;
};

export type MineMusicStageCoreOptions = {
  session: StageSession;
  sourceMaterials: MusicMaterial[];
  canonicalRecords?: CanonicalRecord[];
  handbookPath?: string;
};

export type MineMusicStageCoreWithSourceProviderOptions = {
  session: StageSession;
  sourceProvider: SourceProvider;
  canonicalRecords?: CanonicalRecord[];
  handbookPath?: string;
};

export function createMineMusicStageCore({
  session,
  sourceMaterials,
  canonicalRecords = [],
  handbookPath,
}: MineMusicStageCoreOptions): MineMusicStageCore {
  return createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider: createFixtureSourceProvider(sourceMaterials),
    canonicalRecords,
    ...(handbookPath === undefined ? {} : { handbookPath }),
  });
}

export function createMineMusicStageCoreWithSourceProvider({
  session,
  sourceProvider,
  canonicalRecords = [],
  handbookPath = join(process.cwd(), "plugins/minemusic/skills/minemusic/HANDBOOK.md"),
}: MineMusicStageCoreWithSourceProviderOptions): MineMusicStageCore {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const memoryRepository = createInMemoryMemoryRepository();
  const effectRepository = createInMemoryEffectProposalRepository();

  const plugins = createPluginRegistry();
  const canonical = createCanonicalStore({ repository: canonicalRepository });
  const source = createSourceResolutionService({
    canonicalStore: canonical,
    pluginRegistry: plugins,
  });
  const events = createEventService({ repository: eventRepository });
  const effects = createEffectBoundary({ repository: effectRepository });
  const instruments = createInstrumentCatalog();
  const memory = createMemoryService({
    repository: memoryRepository,
    events,
    effects,
  });
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });
  const materialGate = createMaterialGate({
    sessionContext,
    events,
  });
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
    instruments,
    source,
    events,
    memory,
    effects,
  });
  const stageInterface = createMineMusicStageInterface({
    sessionId: session.id,
    dispatch,
  });
  const ready = seedRuntime({
    canonicalRecords,
    canonicalRepository,
    handbookPath,
    instruments,
    session,
    plugins,
    sourceProvider,
  });

  return {
    ready,
    stageInterface,
    dispatch,
    sessionContext,
    materialGate,
    canonical,
    source,
    events,
    memory,
    effects,
    plugins,
  };
}

function createFixtureSourceProvider(sourceMaterials: MusicMaterial[]): SourceProvider {
  return {
    id: "fixture-source",

    async search({ query }) {
      const limit = query.limit ?? sourceMaterials.length;
      const normalizedQuery = query.text?.toLocaleLowerCase();
      const matches =
        normalizedQuery === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              material.label.toLocaleLowerCase().includes("coding") ||
              normalizedQuery.includes("coding") ||
              normalizedQuery.includes("quiet"),
            );

      return ok(matches.slice(0, limit).map((material) => structuredClone(material)));
    },

    async getPlayableLinks({ material }) {
      return ok(structuredClone(material.playableLinks ?? []));
    },
  };
}

async function seedRuntime({
  canonicalRecords,
  canonicalRepository,
  handbookPath,
  instruments,
  session,
  plugins,
  sourceProvider,
}: {
  canonicalRecords: CanonicalRecord[];
  canonicalRepository: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
  handbookPath: string;
  instruments: ReturnType<typeof createInstrumentCatalog>;
  session: StageSession;
  plugins: PluginRegistryPort;
  sourceProvider: SourceProvider;
}): Promise<void> {
  for (const record of canonicalRecords) {
    const putResult = await canonicalRepository.put(record);
    throwIfFailed(putResult);
  }

  const registerResult = await plugins.registerProvider({
    slot: "source",
    providerId: sourceProvider.id,
    provider: sourceProvider,
  });
  throwIfFailed(registerResult);

  const instrumentsResult = await instruments.list({ session });
  const handbookResult = await writeInstrumentHandbookFile({
    path: handbookPath,
    instruments: throwIfFailed(instrumentsResult),
  });
  throwIfFailed(handbookResult);
}

function throwIfFailed<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
