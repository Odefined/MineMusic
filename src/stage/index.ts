import type {
  Handbook,
  MusicMaterial,
  Result,
  SessionHandbook,
  StageContext,
  StageError,
  StageSession,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MemoryPort,
  SessionHandbookStorePort,
  SourceResolutionPort,
  StageKernelPort,
} from "../ports/index.js";
import { createFileSessionHandbookStore } from "./session-handbook-store.js";

type StageKernelOptions = {
  sessions?: StageSession[];
  instruments: InstrumentCatalogPort;
  memory: MemoryPort;
  events: EventPort;
  effects: EffectBoundaryPort;
  source: SourceResolutionPort;
  canonical: CanonicalStorePort;
  handbookStore?: SessionHandbookStorePort;
};

export function createStageKernel({
  sessions = [],
  instruments,
  memory,
  events,
  effects: _effects,
  source: _source,
  canonical: _canonical,
  handbookStore = createFileSessionHandbookStore({
    baseDirectory: ".minemusic/stage/sessions",
  }),
}: StageKernelOptions): StageKernelPort {
  const sessionsById = new Map(sessions.map((session) => [session.id, cloneSession(session)]));
  const getSession: StageKernelPort["getSession"] = async ({ sessionId }) => {
    const session = sessionsById.get(sessionId);

    if (session === undefined) {
      return sessionNotFound(sessionId);
    }

    return ok(cloneSession(session));
  };

  return {
    getSession,

    async readContext({ sessionId }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const session = sessionResult.value;
      const memoryResult = await memory.summarizeForSession({ sessionId });

      if (!memoryResult.ok) {
        return memoryResult;
      }

      const handbookRefResult = await ensureSessionHandbook(session);

      if (!handbookRefResult.ok) {
        return handbookRefResult;
      }

      const context: StageContext = {
        session,
        handbookRef: handbookRefResult.value,
        memorySummaries: memoryResult.value,
      };

      return ok(context);
    },

    async readSessionHandbook({ sessionId }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const ensureResult = await ensureSessionHandbook(sessionResult.value);

      if (!ensureResult.ok) {
        return ensureResult;
      }

      const handbookResult = await handbookStore.read({ sessionId });

      if (!handbookResult.ok) {
        return handbookResult;
      }

      if (handbookResult.value === null) {
        return fail({
          code: "storage.unavailable",
          message: `Session handbook for '${sessionId}' could not be read after creation.`,
          module: "storage",
          retryable: true,
        });
      }

      return ok(handbookResult.value);
    },

    async updateSession({ sessionId, patch }) {
      const session = sessionsById.get(sessionId);

      if (session === undefined) {
        return sessionNotFound(sessionId);
      }

      const updatedSession: StageSession = {
        ...session,
        ...patch,
        id: session.id,
      };

      sessionsById.set(sessionId, cloneSession(updatedSession));
      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.session.updated",
          payload: { patch },
        },
      });

      return ok(cloneSession(updatedSession));
    },

    async compileHandbook({ sessionId }) {
      const handbookResult = await buildHandbook({ sessionId });

      if (!handbookResult.ok) {
        return handbookResult;
      }

      const handbook = handbookResult.value;

      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.handbook.compiled",
          payload: { instrumentCount: handbook.availableInstruments.length },
        },
      });

      return ok(handbook);
    },

    async prepareMaterials({ sessionId, materials, purpose }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const preparedMaterials = materials.map((material) => gateMaterialForPurpose(material, purpose));

      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.materials.prepared",
          payload: {
            purpose,
            count: preparedMaterials.length,
          },
        },
      });

      return ok(preparedMaterials);
    },
  };

  async function ensureSessionHandbook(
    session: StageSession,
  ): Promise<Result<SessionHandbook["ref"]>> {
    const existing = await handbookStore.read({ sessionId: session.id });

    if (!existing.ok) {
      return existing;
    }

    if (existing.value !== null) {
      return ok(existing.value.ref);
    }

    const handbookResult = await buildHandbook({ sessionId: session.id });

    if (!handbookResult.ok) {
      return handbookResult;
    }

    const refResult = await handbookStore.ensure({
      sessionId: session.id,
      content: renderSessionHandbook(handbookResult.value),
    });

    if (!refResult.ok) {
      return refResult;
    }

    await events.record({
      event: {
        sessionId: session.id,
        actor: "stage",
        type: "stage.handbook.created",
        payload: {
          path: refResult.value.path,
          revision: refResult.value.revision,
        },
      },
    });

    return refResult;
  }

  async function buildHandbook({ sessionId }: { sessionId: string }): Promise<Result<Handbook>> {
    const sessionResult = await getSession({ sessionId });

    if (!sessionResult.ok) {
      return sessionResult;
    }

    const session = sessionResult.value;
    const [instrumentResult, memoryResult] = await Promise.all([
      instruments.list({ session }),
      memory.summarizeForSession({ sessionId }),
    ]);

    if (!instrumentResult.ok) {
      return instrumentResult;
    }

    if (!memoryResult.ok) {
      return memoryResult;
    }

    return ok({
      sessionId,
      rules: [
        "Only present playable links when material state is confirmed_playable or source_only_playable.",
        "Normal playable-link display is not playback.",
        "Do not turn weak guesses into durable memory.",
      ],
      ...(session.vibe === undefined ? {} : { stageVibe: session.vibe }),
      availableInstruments: instrumentResult.value,
      permissionBoundaries: [
        "open_link, play, queue_add, playlist_write, source_writeback, memory_update, and notification require effect proposals.",
      ],
      memorySummaries: memoryResult.value,
      pluginGuidance: ["Provider internals stay behind public capability slots."],
    });
  }
}

function renderSessionHandbook(handbook: Handbook): string {
  const lines = [
    "# MineMusic Session Handbook",
    "",
    `Session: \`${handbook.sessionId}\``,
    "",
    "## Rules",
    ...asBulletList(handbook.rules),
    "",
    "## Available Instruments",
    ...handbook.availableInstruments.flatMap((instrument) => [
      `- ${instrument.label} (\`${instrument.id}\`)`,
      ...instrument.tools.map((tool) => `  - \`${tool.name}\`: ${tool.description}`),
    ]),
    "",
    "## Permission Boundaries",
    ...asBulletList(handbook.permissionBoundaries),
    "",
    "## Memory Summaries",
    ...asBulletList(handbook.memorySummaries, "No session memory summaries are available yet."),
    "",
    "## Plugin Guidance",
    ...asBulletList(handbook.pluginGuidance),
    "",
  ];

  if (handbook.stageVibe !== undefined) {
    lines.splice(
      4,
      0,
      "## Stage Vibe",
      `- ${handbook.stageVibe.text}`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function asBulletList(items: string[], fallback = "None."): string[] {
  return items.length === 0 ? [`- ${fallback}`] : items.map((item) => `- ${item}`);
}

function gateMaterialForPurpose(
  material: MusicMaterial,
  purpose: "recommendation" | "memory" | "effect" | "conversation",
): MusicMaterial {
  if (purpose === "conversation") {
    return cloneMaterial(material);
  }

  if (material.state === "confirmed_playable" || material.state === "source_only_playable") {
    return cloneMaterial(material);
  }

  return withoutPlayableLinks(material);
}

function withoutPlayableLinks(material: MusicMaterial): MusicMaterial {
  const { playableLinks: _playableLinks, ...materialWithoutPlayableLinks } = material;

  return cloneMaterial(materialWithoutPlayableLinks);
}

function sessionNotFound(sessionId: string): Result<never> {
  return fail({
    code: "stage.session_not_found",
    message: `Stage session '${sessionId}' was not found.`,
    module: "stage",
    retryable: false,
  });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function cloneSession(session: StageSession): StageSession {
  return structuredClone(session);
}

function cloneMaterial(material: MusicMaterial): MusicMaterial {
  return structuredClone(material);
}
