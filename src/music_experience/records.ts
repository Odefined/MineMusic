import {
  parseRefKey,
  refKey,
  type CommandPreconditionSet,
  type ConcernRevision,
  type Ref,
} from "../contracts/kernel.js";
import type {
  MusicExperiencePlaybackStatus,
  MusicExperienceQueueItemProvenance,
  MusicExperienceQueueItemSnapshot,
  MusicExperienceSnapshot,
  MusicExperienceWorkspaceKey,
} from "../contracts/music_experience.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../contracts/music_experience.js";
import type { MusicDatabaseContext, MusicDatabaseParameter } from "../storage/database.js";
import { DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID } from "./schema.js";

export type CreateMusicExperienceQueuePlaybackRecordsInput = {
  db: MusicDatabaseContext;
  workspaceId?: string;
};

export type MusicExperienceQueuePlaybackRecords = {
  read(input: {
    ownerScope: string;
  }): Promise<MusicExperienceSnapshot>;
  countQueue(input: {
    ownerScope: string;
  }): Promise<number>;
  append(input: {
    ownerScope: string;
    materialRefs: readonly Ref[];
    provenance: MusicExperienceQueueItemProvenance;
    basis?: CommandPreconditionSet;
    now: string;
  }): Promise<{
    appended: readonly MusicExperienceQueueItemSnapshot[];
    queueLength: number;
    queueRevision: ConcernRevision;
  }>;
  playNow(input: {
    ownerScope: string;
    materialRef: Ref;
    now: string;
  }): Promise<{
    materialRef: Ref;
    status: Extract<MusicExperiencePlaybackStatus, "playing">;
    playbackRevision: ConcernRevision;
  }>;
};

type StateRow = {
  queue_revision: number;
  radio_direction_revision: number;
  radio_session_revision: number;
  playback_revision: number;
  queue_next_position: number;
  now_playing_material_ref_key: string | null;
  now_playing_material_ref_json: string | Ref | null;
  playback_status: MusicExperiencePlaybackStatus;
};

type QueueItemRow = {
  position: number;
  material_ref_key: string;
  material_ref_json: string | Ref;
  provenance: MusicExperienceQueueItemProvenance;
};

export function createMusicExperienceQueuePlaybackRecords(
  input: CreateMusicExperienceQueuePlaybackRecordsInput,
): MusicExperienceQueuePlaybackRecords {
  const workspaceId = input.workspaceId ?? DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID;
  const { db } = input;

  return {
    async read(readInput) {
      const key = workspaceKey(readInput.ownerScope, workspaceId);
      const state = await readState({ db, key });
      const rows = await db.all<QueueItemRow>(
        `
          SELECT position, material_ref_key, material_ref_json, provenance
          FROM music_experience_queue_items
          WHERE owner_scope = ?
            AND workspace_id = ?
          ORDER BY position ASC
        `,
        [key.ownerScope, key.workspaceId],
      );

      if (state === undefined) {
        if (rows.length !== 0) {
          throw new Error("Music Experience queue rows exist without a state row.");
        }

        return emptySnapshot();
      }

      return {
        queueRevision: state.queue_revision,
        playbackRevision: state.playback_revision,
        queue: rows.map(queueItemFromRow),
        playback: playbackFromRow(state),
      };
    },
    async countQueue(countInput) {
      const key = workspaceKey(countInput.ownerScope, workspaceId);
      const row = await db.get<{ queue_length: number }>(
        `
          SELECT COUNT(*)::int AS queue_length
          FROM music_experience_queue_items
          WHERE owner_scope = ?
            AND workspace_id = ?
        `,
        [key.ownerScope, key.workspaceId],
      );
      return row?.queue_length ?? 0;
    },
    async append(appendInput) {
      if (appendInput.materialRefs.length === 0) {
        throw new Error("MusicExperienceQueueCommand.append requires at least one materialRef.");
      }

      const key = workspaceKey(appendInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: appendInput.now });

      const mintRow = await db.get<{ base_position: number }>(
        `
          UPDATE music_experience_state
          SET queue_next_position = queue_next_position + ?
          WHERE owner_scope = ?
            AND workspace_id = ?
          RETURNING queue_next_position - ? AS base_position
        `,
        [appendInput.materialRefs.length, key.ownerScope, key.workspaceId, appendInput.materialRefs.length],
      );

      if (mintRow === undefined) {
        throw new Error("Music Experience queue position mint did not return a state row.");
      }

      const state = await updateQueueRevision({
        db,
        key,
        now: appendInput.now,
        ...(appendInput.basis === undefined ? {} : { basis: appendInput.basis }),
      });

      const countBeforeInsert = await countQueueRows({ db, key });
      if (countBeforeInsert + appendInput.materialRefs.length > MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH) {
        throw new QueueFullError();
      }

      const firstPosition = mintRow.base_position;
      const appended = appendInput.materialRefs.map((materialRef, index) => ({
        position: firstPosition + index,
        materialRef,
        provenance: appendInput.provenance,
      }));

      await insertQueueItems({
        db,
        key,
        items: appended,
        now: appendInput.now,
      });

      return {
        appended,
        queueLength: countBeforeInsert + appended.length,
        queueRevision: state.queue_revision,
      };
    },
    async playNow(playInput) {
      const key = workspaceKey(playInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: playInput.now });
      const state = await updatePlayback({
        db,
        key,
        materialRef: playInput.materialRef,
        now: playInput.now,
      });

      return {
        materialRef: playInput.materialRef,
        status: "playing",
        playbackRevision: state.playback_revision,
      };
    },
  };
}

async function insertQueueItems(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  items: readonly MusicExperienceQueueItemSnapshot[];
  now: string;
}): Promise<void> {
  if (input.items.length === 0) {
    throw new Error("Music Experience queue insert requires at least one item.");
  }

  const valuesSql = input.items.map(() => "(?, ?, ?, ?, ?::jsonb, ?, ?, ?)").join(", ");
  const params: MusicDatabaseParameter[] = [];
  for (const item of input.items) {
    params.push(
      input.key.ownerScope,
      input.key.workspaceId,
      item.position,
      refKey(item.materialRef),
      JSON.stringify(item.materialRef),
      item.provenance,
      input.now,
      input.now,
    );
  }

  await input.db.run(
    `
      INSERT INTO music_experience_queue_items (
        owner_scope,
        workspace_id,
        position,
        material_ref_key,
        material_ref_json,
        provenance,
        created_at,
        updated_at
      )
      VALUES ${valuesSql}
    `,
    params,
  );
}

async function ensureState(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  now: string;
}): Promise<StateRow> {
  await input.db.run(
    `
      INSERT INTO music_experience_state (
        owner_scope,
        workspace_id,
        queue_revision,
        playback_revision,
        playback_status,
        created_at,
        updated_at
      )
      VALUES (?, ?, 0, 0, 'paused', ?, ?)
      ON CONFLICT(owner_scope, workspace_id) DO NOTHING
    `,
    [input.key.ownerScope, input.key.workspaceId, input.now, input.now],
  );

  const row = await readState(input);

  if (row === undefined) {
    throw new Error("Music Experience state row was not created.");
  }

  return row;
}

async function readState(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<StateRow | undefined> {
  return input.db.get<StateRow>(
    `
      SELECT queue_revision, playback_revision, now_playing_material_ref_key,
        radio_direction_revision, radio_session_revision, queue_next_position,
        now_playing_material_ref_json, playback_status
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );
}

async function countQueueRows(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<number> {
  const row = await input.db.get<{ queue_length: number }>(
    `
      SELECT COUNT(*)::int AS queue_length
      FROM music_experience_queue_items
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );
  return row?.queue_length ?? 0;
}

async function updateQueueRevision(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  basis?: CommandPreconditionSet;
  now: string;
}): Promise<StateRow> {
  const conditions: string[] = [];
  const params: (string | number)[] = [input.now, input.key.ownerScope, input.key.workspaceId];
  if (input.basis?.radioDirectionRevision !== undefined) {
    conditions.push("AND radio_direction_revision = ?");
    params.push(input.basis.radioDirectionRevision);
  }
  if (input.basis?.queueRevision !== undefined) {
    conditions.push("AND queue_revision = ?");
    params.push(input.basis.queueRevision);
  }
  if (input.basis?.radioSessionRevision !== undefined) {
    conditions.push("AND radio_session_revision = ?");
    params.push(input.basis.radioSessionRevision);
  }
  if (input.basis?.playbackRevision !== undefined) {
    conditions.push("AND playback_revision = ?");
    params.push(input.basis.playbackRevision);
  }

  const row = await input.db.get<StateRow>(
    `
      UPDATE music_experience_state
      SET queue_revision = queue_revision + 1,
        updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        ${conditions.join("\n        ")}
      RETURNING queue_revision, radio_direction_revision, radio_session_revision,
        playback_revision, queue_next_position, now_playing_material_ref_key,
        now_playing_material_ref_json, playback_status
    `,
    params,
  );

  if (row === undefined) {
    throw new StaleCommandPreconditionError();
  }

  return row;
}

async function updatePlayback(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  materialRef: Ref;
  now: string;
}): Promise<StateRow> {
  const row = await input.db.get<StateRow>(
    `
      UPDATE music_experience_state
      SET playback_revision = playback_revision + 1,
        now_playing_material_ref_key = ?,
        now_playing_material_ref_json = ?::jsonb,
        playback_status = 'playing',
        updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
      RETURNING queue_revision, radio_direction_revision, radio_session_revision,
        playback_revision, queue_next_position, now_playing_material_ref_key,
        now_playing_material_ref_json, playback_status
    `,
    [
      refKey(input.materialRef),
      JSON.stringify(input.materialRef),
      input.now,
      input.key.ownerScope,
      input.key.workspaceId,
    ],
  );

  if (row === undefined) {
    throw new Error("Music Experience playback update did not return a state row.");
  }

  return row;
}

export class StaleCommandPreconditionError extends Error {
  constructor() {
    super("Music Experience command precondition was stale at commit time.");
    this.name = "StaleCommandPreconditionError";
  }
}

export class QueueFullError extends Error {
  constructor() {
    super("Music Experience queue is full.");
    this.name = "QueueFullError";
  }
}

function playbackFromRow(row: StateRow): MusicExperienceSnapshot["playback"] {
  if (row.now_playing_material_ref_key === null && row.now_playing_material_ref_json === null) {
    return { status: row.playback_status };
  }
  if (row.now_playing_material_ref_key === null || row.now_playing_material_ref_json === null) {
    throw new Error("Music Experience playback row has inconsistent now-playing material fields.");
  }

  const materialRef = materialRefFromStoredJson(row.now_playing_material_ref_json);
  if (refKey(materialRef) !== row.now_playing_material_ref_key) {
    throw new Error("Music Experience playback material ref key does not match stored material ref JSON.");
  }

  return {
    status: row.playback_status,
    materialRef,
  };
}

function queueItemFromRow(row: QueueItemRow): MusicExperienceQueueItemSnapshot {
  const materialRef = materialRefFromStoredJson(row.material_ref_json);
  if (refKey(materialRef) !== row.material_ref_key) {
    throw new Error("Music Experience queue item material ref key does not match stored material ref JSON.");
  }

  return {
    position: row.position,
    materialRef,
    provenance: row.provenance,
  };
}

function materialRefFromStoredJson(value: string | Ref): Ref {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (
    !isRecord(parsed) ||
    typeof parsed.namespace !== "string" ||
    typeof parsed.kind !== "string" ||
    typeof parsed.id !== "string"
  ) {
    throw new Error("Stored Music Experience material ref JSON is not an object.");
  }
  const materialRef = {
    namespace: parsed.namespace,
    kind: parsed.kind,
    id: parsed.id,
  };
  const ref = parseRefKey(refKey(materialRef));
  if (ref === undefined || ref.namespace !== "material") {
    throw new Error("Stored Music Experience material ref JSON is not a material ref.");
  }
  return ref;
}

function workspaceKey(ownerScope: string, workspaceId: string): MusicExperienceWorkspaceKey {
  if (ownerScope.trim().length === 0 || workspaceId.trim().length === 0) {
    throw new Error("Music Experience workspace key requires non-empty ownerScope and workspaceId.");
  }

  return { ownerScope, workspaceId };
}

function emptySnapshot(): MusicExperienceSnapshot {
  return {
    queueRevision: 0,
    playbackRevision: 0,
    queue: [],
    playback: {
      status: "paused",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
