import {
  parseRefKey,
  refKey,
  type ConcernRevisionSet,
  type ConcernRevision,
  type Ref,
} from "../contracts/kernel.js";
import type {
  EvolvedPostureSnapshot,
  MusicExperiencePlaybackStatus,
  MusicExperienceQueueEditAuthority,
  MusicExperienceQueueItemProvenance,
  MusicExperienceQueueItemSnapshot,
  MusicExperienceQueueMutation,
  MusicExperienceQueueReplacementContext,
  MusicExperienceRadioTruthSnapshot,
  MusicExperienceRadioSessionOperation,
  MusicExperienceRadioSessionPlaybackEffect,
  MusicExperienceSnapshot,
  MusicExperienceWorkspaceKey,
  RadioWakeGateState,
  RadioDirectionScopeValue,
  RadioDirectionSnapshot,
  VariationItem,
} from "../contracts/music_experience.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
  MAX_RADIO_POSTURE_LEAN_ITEMS,
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
  append(input: {
    ownerScope: string;
    materialRefs: readonly Ref[];
    provenance: MusicExperienceQueueItemProvenance;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    appended: readonly MusicExperienceQueueItemSnapshot[];
    queueLength: number;
    queueRevision: ConcernRevision;
    queueMutation: MusicExperienceQueueMutation;
  }>;
  remove(input: {
    ownerScope: string;
    index: number;
    authority: MusicExperienceQueueEditAuthority;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    queueLength: number;
    queueRevision: ConcernRevision;
    queueMutation: MusicExperienceQueueMutation;
  }>;
  replace(input: MusicExperienceQueueReplacementContext & {
    ownerScope: string;
    index: number;
    materialRef: Ref;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    item: MusicExperienceQueueItemSnapshot;
    index: number;
    queueLength: number;
    queueRevision: ConcernRevision;
    queueMutation: MusicExperienceQueueMutation;
  }>;
  move(input: {
    ownerScope: string;
    from: number;
    to: number;
    authority: MusicExperienceQueueEditAuthority;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    queueLength: number;
    queueRevision: ConcernRevision;
    queueMutation: MusicExperienceQueueMutation;
  }>;
  clear(input: {
    ownerScope: string;
    authority: MusicExperienceQueueEditAuthority;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    queueLength: number;
    queueRevision: ConcernRevision;
    queueMutation: MusicExperienceQueueMutation;
  }>;
  playNow(input: {
    ownerScope: string;
    materialRef: Ref;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    materialRef: Ref;
    status: Extract<MusicExperiencePlaybackStatus, "playing">;
    playbackRevision: ConcernRevision;
  }>;
  transitionRadioSession(input: {
    ownerScope: string;
    operation: MusicExperienceRadioSessionOperation;
    now: string;
  }): Promise<{
    radioSessionRevision: ConcernRevision;
    lifecycle: RadioWakeGateState;
    playbackRevision: ConcernRevision;
    playbackStatus: MusicExperiencePlaybackStatus;
    playbackEffect: MusicExperienceRadioSessionPlaybackEffect;
  }>;
};

export type MusicExperienceRadioTruthRecords = {
  read(input: {
    ownerScope: string;
  }): Promise<MusicExperienceRadioTruthSnapshot>;
  readForPostureWrite(input: {
    ownerScope: string;
    now: string;
  }): Promise<MusicExperienceRadioTruthSnapshot>;
  setDirection(input: {
    ownerScope: string;
    direction: RadioDirectionSnapshot;
    basis?: ConcernRevisionSet;
    now: string;
  }): Promise<{
    radioDirectionRevision: ConcernRevision;
    direction: RadioDirectionSnapshot;
  }>;
  writePosture(input: {
    ownerScope: string;
    lean: readonly VariationItem[];
    commandedRevisionStamp: ConcernRevision;
    now: string;
  }): Promise<{
    radioDirectionRevision: ConcernRevision;
    posture: EvolvedPostureSnapshot;
  }>;
  readQueuedMaterialRefs(input: {
    ownerScope: string;
  }): Promise<readonly Ref[]>;
};

type StateRow = {
  queue_revision: number;
  radio_direction_revision: number;
  radio_session_revision: number;
  radio_session_lifecycle: RadioWakeGateState;
  playback_revision: number;
  queue_next_position: number;
  now_playing_material_ref_key: string | null;
  now_playing_material_ref_json: string | Ref | null;
  playback_status: MusicExperiencePlaybackStatus;
};

// Columns surfaced by every state-row read (SELECT) and write (RETURNING).
// Centralized so the three call sites cannot drift when a column is added.
const STATE_ROW_COLUMNS = [
  "queue_revision",
  "radio_direction_revision",
  "radio_session_revision",
  "radio_session_lifecycle",
  "playback_revision",
  "queue_next_position",
  "now_playing_material_ref_key",
  "now_playing_material_ref_json",
  "playback_status",
].join(", ");

type QueueItemRow = {
  position: number;
  material_ref_key: string;
  material_ref_json: string | Ref;
  provenance: MusicExperienceQueueItemProvenance;
};

type RadioTruthRow = {
  motif_json: string | VariationItem | null;
  active_variations_json: string | readonly VariationItem[];
  evolved_lean_json: string | readonly VariationItem[];
  posture_commanded_revision_stamp: number | null;
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

      const radioTruth = await readRadioTruth({
        db,
        key,
        radioDirectionRevision: state.radio_direction_revision,
      });

      return {
        queueRevision: state.queue_revision,
        radioDirectionRevision: state.radio_direction_revision,
        radioSessionRevision: state.radio_session_revision,
        radioSessionLifecycle: state.radio_session_lifecycle,
        playbackRevision: state.playback_revision,
        queue: rows.map(queueItemFromRow),
        playback: playbackFromRow(state),
        radio: radioTruth,
      };
    },
    async append(appendInput) {
      if (appendInput.materialRefs.length === 0) {
        throw new Error("MusicExperienceQueueCommand.append requires at least one materialRef.");
      }

      const key = workspaceKey(appendInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: appendInput.now });
      await lockStateForUpdate({ db, key });

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

      const firstPosition = countBeforeInsert + 1;
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
      await updateQueueNextPosition({
        db,
        key,
        nextPosition: countBeforeInsert + appended.length + 1,
        now: appendInput.now,
      });

      return {
        appended,
        queueLength: countBeforeInsert + appended.length,
        queueRevision: state.queue_revision,
        queueMutation: {
          kind: "append",
          affectedCount: appended.length,
        },
      };
    },
    async remove(removeInput) {
      const key = workspaceKey(removeInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: removeInput.now });
      await lockStateForUpdate({ db, key });
      const rows = await readQueueItems({ db, key });
      assertEditableQueueItem(rows, removeInput.index, removeInput.authority);

      const removed = rows[removeInput.index];
      if (removed === undefined) {
        throw new Error("Music Experience queue remove item disappeared after index validation.");
      }
      const nextRows = rows
        .filter((_row, index) => index !== removeInput.index)
        .map((item, index) => ({ ...item, position: index + 1 }));

      const state = await updateQueueRevision({
        db,
        key,
        now: removeInput.now,
        ...(removeInput.basis === undefined ? {} : { basis: removeInput.basis }),
      });
      await deleteQueueItemsAtPositions({ db, key, positions: [removed.position] });
      await shiftQueuePositions({
        db,
        key,
        start: removed.position + 1,
        end: rows.length,
        delta: -1,
        now: removeInput.now,
      });
      await updateQueueNextPosition({ db, key, nextPosition: nextRows.length + 1, now: removeInput.now });

      return {
        queueLength: nextRows.length,
        queueRevision: state.queue_revision,
        queueMutation: {
          kind: "remove",
          affectedCount: 1,
        },
      };
    },
    async replace(replaceInput) {
      const key = workspaceKey(replaceInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: replaceInput.now });
      const lockedState = await lockStateForUpdate({ db, key });
      const rows = await readQueueItems({ db, key });
      assertEditableQueueItem(rows, replaceInput.index, replaceInput.authority);

      const target = rows[replaceInput.index];
      if (target === undefined) {
        throw new Error("Music Experience queue replace item disappeared after index validation.");
      }
      const item = {
        position: target.position,
        materialRef: replaceInput.materialRef,
        provenance: replaceInput.replacementProvenance,
      };
      assertRevisionBasis({
        state: lockedState,
        basis: replaceInput.basis,
      });
      if (
        refKey(target.materialRef) === refKey(replaceInput.materialRef) &&
        target.provenance === replaceInput.replacementProvenance
      ) {
        throw new QueueNoopError("Replacement is identical to the current queue item.");
      }

      const state = await updateQueueRevision({
        db,
        key,
        now: replaceInput.now,
      });
      await updateQueueItemMaterial({
        db,
        key,
        position: target.position,
        materialRef: replaceInput.materialRef,
        provenance: replaceInput.replacementProvenance,
        now: replaceInput.now,
      });

      return {
        item,
        index: replaceInput.index,
        queueLength: rows.length,
        queueRevision: state.queue_revision,
        queueMutation: {
          kind: "replace",
          affectedCount: 1,
        },
      };
    },
    async move(moveInput) {
      const key = workspaceKey(moveInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: moveInput.now });
      const lockedState = await lockStateForUpdate({ db, key });
      const rows = await readQueueItems({ db, key });
      assertEditableQueueItem(rows, moveInput.from, moveInput.authority);
      assertExistingQueueIndex(moveInput.to, rows.length);

      const nextRows = rows.slice();
      const [item] = nextRows.splice(moveInput.from, 1);
      if (item === undefined) {
        throw new Error("Music Experience queue move source disappeared after index validation.");
      }
      nextRows.splice(moveInput.to, 0, item);
      const positionedRows = nextRows.map((row, index) => ({ ...row, position: index + 1 }));
      assertRevisionBasis({
        state: lockedState,
        basis: moveInput.basis,
      });
      if (moveInput.from === moveInput.to) {
        throw new QueueNoopError("Move source and destination indexes are the same.");
      }

      const state = await updateQueueRevision({
        db,
        key,
        now: moveInput.now,
      });
      await moveQueueItem({
        db,
        key,
        from: rows[moveInput.from]!.position,
        to: moveInput.to + 1,
        now: moveInput.now,
      });
      await updateQueueNextPosition({ db, key, nextPosition: positionedRows.length + 1, now: moveInput.now });

      return {
        queueLength: positionedRows.length,
        queueRevision: state.queue_revision,
        queueMutation: {
          kind: "move",
          affectedCount: 1,
        },
      };
    },
    async clear(clearInput) {
      const key = workspaceKey(clearInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: clearInput.now });
      const lockedState = await lockStateForUpdate({ db, key });
      const rows = await readQueueItems({ db, key });
      const removedRows = rows.filter((row) => canEditQueueItem(row, clearInput.authority));
      const nextRows = rows
        .filter((row) => !canEditQueueItem(row, clearInput.authority))
        .map((item, index) => ({ ...item, position: index + 1 }));
      const positionUpdates = rows
        .filter((row) => !canEditQueueItem(row, clearInput.authority))
        .map((item, index) => ({ from: item.position, to: index + 1 }));
      assertRevisionBasis({
        state: lockedState,
        basis: clearInput.basis,
      });
      if (removedRows.length === 0) {
        throw new QueueNoopError("No queued items are editable by this clear command.");
      }

      const state = await updateQueueRevision({
        db,
        key,
        now: clearInput.now,
      });
      await deleteQueueItemsAtPositions({
        db,
        key,
        positions: removedRows.map((row) => row.position),
      });
      await updateQueueItemPositions({ db, key, moves: positionUpdates, now: clearInput.now });
      await updateQueueNextPosition({ db, key, nextPosition: nextRows.length + 1, now: clearInput.now });

      return {
        queueLength: nextRows.length,
        queueRevision: state.queue_revision,
        queueMutation: {
          kind: "clear",
          affectedCount: removedRows.length,
        },
      };
    },
    async playNow(playInput) {
      const key = workspaceKey(playInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: playInput.now });
      const lockedState = await lockStateForUpdate({ db, key });
      assertRevisionBasis({
        state: lockedState,
        basis: playInput.basis,
      });
      const currentPlayback = playbackFromRow(lockedState);
      if (
        currentPlayback.status === "playing" &&
        currentPlayback.materialRef !== undefined &&
        refKey(currentPlayback.materialRef) === refKey(playInput.materialRef)
      ) {
        throw new PlaybackNoopError("Playback already points to that playing material item.");
      }
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
    async transitionRadioSession(sessionInput) {
      const key = workspaceKey(sessionInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: sessionInput.now });
      const previous = await lockStateForUpdate({ db, key });
      const playbackEffect = radioSessionPlaybackEffect({
        operation: sessionInput.operation,
        previous,
      });
      const state = await updateRadioSession({
        db,
        key,
        operation: sessionInput.operation,
        playbackEffect,
        now: sessionInput.now,
      });

      return {
        radioSessionRevision: state.radio_session_revision,
        lifecycle: state.radio_session_lifecycle,
        playbackRevision: state.playback_revision,
        playbackStatus: state.playback_status,
        playbackEffect,
      };
    },
  };
}

export function createMusicExperienceRadioTruthRecords(
  input: CreateMusicExperienceQueuePlaybackRecordsInput,
): MusicExperienceRadioTruthRecords {
  const workspaceId = input.workspaceId ?? DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID;
  const { db } = input;

  return {
    async read(readInput) {
      const key = workspaceKey(readInput.ownerScope, workspaceId);
      const state = await readState({ db, key });
      if (state === undefined) {
        return emptyRadioTruthSnapshot(0);
      }

      return readRadioTruth({
        db,
        key,
        radioDirectionRevision: state.radio_direction_revision,
      });
    },
    async readForPostureWrite(readInput) {
      const key = workspaceKey(readInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: readInput.now });
      const state = await lockStateForUpdate({ db, key });
      return readRadioTruth({
        db,
        key,
        radioDirectionRevision: state.radio_direction_revision,
      });
    },
    async setDirection(setInput) {
      const key = workspaceKey(setInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: setInput.now });
      const lockedState = await lockStateForUpdate({ db, key });
      assertRevisionBasis({
        state: lockedState,
        basis: setInput.basis,
      });
      const current = await readRadioTruth({
        db,
        key,
        radioDirectionRevision: lockedState.radio_direction_revision,
      });
      if (sameRadioDirection(current.direction, setInput.direction)) {
        throw new RadioTruthNoopError("Radio direction is already set to that value.");
      }

      const state = await updateRadioDirectionRevision({
        db,
        key,
        now: setInput.now,
      });
      await writeRadioDirection({
        db,
        key,
        direction: setInput.direction,
        now: setInput.now,
      });

      return {
        radioDirectionRevision: state.radio_direction_revision,
        direction: setInput.direction,
      };
    },
    async writePosture(writeInput) {
      if (writeInput.lean.length > MAX_RADIO_POSTURE_LEAN_ITEMS) {
        throw new RadioTruthValidationError(
          `Radio evolved posture lean is capped at ${MAX_RADIO_POSTURE_LEAN_ITEMS} item(s).`,
        );
      }

      const key = workspaceKey(writeInput.ownerScope, workspaceId);
      await ensureState({ db, key, now: writeInput.now });
      const state = await lockStateForUpdate({ db, key });
      const current = await readRadioTruth({
        db,
        key,
        radioDirectionRevision: state.radio_direction_revision,
      });
      if (
        sameVariationItems(current.posture.lean, writeInput.lean) &&
        current.posture.commandedRevisionStamp === writeInput.commandedRevisionStamp
      ) {
        throw new RadioTruthNoopError("Radio posture lean is already set to that value.");
      }

      await writeRadioPosture({
        db,
        key,
        lean: writeInput.lean,
        commandedRevisionStamp: writeInput.commandedRevisionStamp,
        now: writeInput.now,
      });

      return {
        radioDirectionRevision: state.radio_direction_revision,
        posture: postureSnapshot({
          lean: writeInput.lean,
          commandedRevisionStamp: writeInput.commandedRevisionStamp,
          currentRadioDirectionRevision: state.radio_direction_revision,
        }),
      };
    },
    async readQueuedMaterialRefs(readInput) {
      const key = workspaceKey(readInput.ownerScope, workspaceId);
      const rows = await db.all<{ material_ref_key: string; material_ref_json: string | Ref }>(
        `
          SELECT material_ref_key, material_ref_json
          FROM music_experience_queue_items
          WHERE owner_scope = ?
            AND workspace_id = ?
          ORDER BY position ASC
        `,
        [key.ownerScope, key.workspaceId],
      );

      const refsByKey = new Map<string, Ref>();
      for (const row of rows) {
        const materialRef = materialRefFromStoredJson(row.material_ref_json);
        if (refKey(materialRef) !== row.material_ref_key) {
          throw new Error("Music Experience queue item material ref key does not match stored material ref JSON.");
        }
        refsByKey.set(row.material_ref_key, materialRef);
      }
      return [...refsByKey.values()];
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

async function deleteQueueItemsAtPositions(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  positions: readonly number[];
}): Promise<void> {
  if (input.positions.length === 0) {
    return;
  }

  await input.db.run(
    `
      DELETE FROM music_experience_queue_items
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position IN (${input.positions.map(() => "?").join(", ")})
    `,
    [input.key.ownerScope, input.key.workspaceId, ...input.positions],
  );
}

async function updateQueueItemMaterial(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  position: number;
  materialRef: Ref;
  provenance: MusicExperienceQueueItemProvenance;
  now: string;
}): Promise<void> {
  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET material_ref_key = ?,
          material_ref_json = ?::jsonb,
          provenance = ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position = ?
    `,
    [
      refKey(input.materialRef),
      JSON.stringify(input.materialRef),
      input.provenance,
      input.now,
      input.key.ownerScope,
      input.key.workspaceId,
      input.position,
    ],
  );
}

async function updateQueueNextPosition(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  nextPosition: number;
  now: string;
}): Promise<void> {
  await input.db.run(
    `
      UPDATE music_experience_state
      SET queue_next_position = ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.nextPosition, input.now, input.key.ownerScope, input.key.workspaceId],
  );
}

async function moveQueueItem(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  from: number;
  to: number;
  now: string;
}): Promise<void> {
  if (input.from === input.to) {
    return;
  }

  const offset = await temporaryQueuePositionOffset({ db: input.db, key: input.key });
  const temporaryPosition = input.from + offset;
  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET position = ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position = ?
    `,
    [temporaryPosition, input.now, input.key.ownerScope, input.key.workspaceId, input.from],
  );

  if (input.from < input.to) {
    await shiftQueuePositions({
      db: input.db,
      key: input.key,
      start: input.from + 1,
      end: input.to,
      delta: -1,
      now: input.now,
    });
  } else {
    await shiftQueuePositions({
      db: input.db,
      key: input.key,
      start: input.to,
      end: input.from - 1,
      delta: 1,
      now: input.now,
    });
  }

  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET position = ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position = ?
    `,
    [input.to, input.now, input.key.ownerScope, input.key.workspaceId, temporaryPosition],
  );
}

async function shiftQueuePositions(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  start: number;
  end: number;
  delta: -1 | 1;
  now: string;
}): Promise<void> {
  if (input.start > input.end) {
    return;
  }

  const offset = await temporaryQueuePositionOffset({ db: input.db, key: input.key });
  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET position = position + ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position BETWEEN ? AND ?
    `,
    [offset, input.now, input.key.ownerScope, input.key.workspaceId, input.start, input.end],
  );
  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET position = position - ? + ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position BETWEEN ? AND ?
    `,
    [
      offset,
      input.delta,
      input.now,
      input.key.ownerScope,
      input.key.workspaceId,
      input.start + offset,
      input.end + offset,
    ],
  );
}

async function updateQueueItemPositions(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  moves: readonly { from: number; to: number }[];
  now: string;
}): Promise<void> {
  const moves = input.moves.filter((move) => move.from !== move.to);
  if (moves.length === 0) {
    return;
  }

  const offset = await temporaryQueuePositionOffset({ db: input.db, key: input.key });
  await input.db.run(
    `
      UPDATE music_experience_queue_items
      SET position = position + ?,
          updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        AND position IN (${moves.map(() => "?").join(", ")})
    `,
    [offset, input.now, input.key.ownerScope, input.key.workspaceId, ...moves.map((move) => move.from)],
  );

  for (const move of moves) {
    await input.db.run(
      `
        UPDATE music_experience_queue_items
        SET position = ?,
            updated_at = ?
        WHERE owner_scope = ?
          AND workspace_id = ?
          AND position = ?
      `,
      [move.to, input.now, input.key.ownerScope, input.key.workspaceId, move.from + offset],
    );
  }
}

async function temporaryQueuePositionOffset(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<number> {
  const row = await input.db.get<{ queue_next_position: number }>(
    `
      SELECT queue_next_position
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );
  if (row === undefined) {
    throw new Error("Music Experience state row disappeared before queue position update.");
  }
  return row.queue_next_position + MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH + 1;
}

async function readQueueItems(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<readonly MusicExperienceQueueItemSnapshot[]> {
  const rows = await input.db.all<QueueItemRow>(
    `
      SELECT position, material_ref_key, material_ref_json, provenance
      FROM music_experience_queue_items
      WHERE owner_scope = ?
        AND workspace_id = ?
      ORDER BY position ASC
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );
  return rows.map(queueItemFromRow);
}

function assertEditableQueueItem(
  rows: readonly MusicExperienceQueueItemSnapshot[],
  index: number,
  authority: MusicExperienceQueueEditAuthority,
): void {
  assertExistingQueueIndex(index, rows.length);
  const item = rows[index];
  if (item === undefined) {
    throw new Error("Music Experience queue item disappeared after index validation.");
  }
  if (!canEditQueueItem(item, authority)) {
    throw new QueueEditPermissionError();
  }
}

function assertExistingQueueIndex(index: number, length: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new QueueIndexError(`Queue index ${index} is outside 0..${Math.max(0, length - 1)}.`);
  }
}

function canEditQueueItem(
  item: MusicExperienceQueueItemSnapshot,
  authority: MusicExperienceQueueEditAuthority,
): boolean {
  switch (authority.kind) {
    case "all_queued_items":
      return true;
    case "radio_owned_queued_items":
      return item.provenance === "radio_agent";
  }
}

async function ensureState(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  now: string;
}): Promise<void> {
  // INSERT ... ON CONFLICT DO NOTHING guarantees the state row exists after
  // this call (freshly inserted or pre-existing). Callers re-assert existence
  // via their own UPDATE ... RETURNING, so a redundant SELECT here would only
  // add a round-trip on every append/playNow.
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
}

async function readState(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<StateRow | undefined> {
  return input.db.get<StateRow>(
    `
      SELECT ${STATE_ROW_COLUMNS}
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );
}

async function lockStateForUpdate(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
}): Promise<StateRow> {
  const row = await input.db.get<StateRow>(
    `
      SELECT ${STATE_ROW_COLUMNS}
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = ?
      FOR UPDATE
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );

  if (row === undefined) {
    throw new Error("Music Experience state row was not available for update after ensureState.");
  }

  return row;
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

// Bumps a single revision column with optimistic-concurrency gating on the
// supplied basis. A missing RETURNING row means the basis did not match the
// current state, which is a stale precondition. Shared by queue and radio
// direction revision advances so the CAS plumbing cannot drift between them.
async function advanceRevision(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  basis?: ConcernRevisionSet;
  now: string;
  setClause: string;
  setParams?: readonly (string | number)[];
}): Promise<StateRow> {
  const conditions: string[] = [];
  const params: (string | number)[] = [
    ...(input.setParams ?? []),
    input.now,
    input.key.ownerScope,
    input.key.workspaceId,
  ];
  const basisConditions: Array<[fragment: string, revision: ConcernRevision | undefined]> = [
    ["AND radio_direction_revision = ?", input.basis?.radioDirectionRevision],
    ["AND queue_revision = ?", input.basis?.queueRevision],
    ["AND radio_session_revision = ?", input.basis?.radioSessionRevision],
    ["AND playback_revision = ?", input.basis?.playbackRevision],
  ];
  for (const [fragment, revision] of basisConditions) {
    if (revision !== undefined) {
      conditions.push(fragment);
      params.push(revision);
    }
  }

  const row = await input.db.get<StateRow>(
    `
      UPDATE music_experience_state
      SET ${input.setClause},
        updated_at = ?
      WHERE owner_scope = ?
        AND workspace_id = ?
        ${conditions.join("\n        ")}
      RETURNING ${STATE_ROW_COLUMNS}
    `,
    params,
  );

  if (row === undefined) {
    throw new StaleCommandPreconditionError();
  }

  return row;
}

function assertRevisionBasis(input: {
  state: StateRow;
  basis: ConcernRevisionSet | undefined;
}): void {
  if (input.basis?.radioDirectionRevision !== undefined &&
    input.basis.radioDirectionRevision !== input.state.radio_direction_revision) {
    throw new StaleCommandPreconditionError();
  }
  if (input.basis?.queueRevision !== undefined &&
    input.basis.queueRevision !== input.state.queue_revision) {
    throw new StaleCommandPreconditionError();
  }
  if (input.basis?.radioSessionRevision !== undefined &&
    input.basis.radioSessionRevision !== input.state.radio_session_revision) {
    throw new StaleCommandPreconditionError();
  }
  if (input.basis?.playbackRevision !== undefined &&
    input.basis.playbackRevision !== input.state.playback_revision) {
    throw new StaleCommandPreconditionError();
  }
}

async function updateQueueRevision(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  basis?: ConcernRevisionSet;
  now: string;
}): Promise<StateRow> {
  return advanceRevision({ ...input, setClause: "queue_revision = queue_revision + 1" });
}

async function updatePlayback(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  materialRef: Ref;
  basis?: ConcernRevisionSet;
  now: string;
}): Promise<StateRow> {
  return advanceRevision({
    db: input.db,
    key: input.key,
    ...(input.basis === undefined ? {} : { basis: input.basis }),
    now: input.now,
    setClause: [
      "playback_revision = playback_revision + 1",
      "now_playing_material_ref_key = ?",
      "now_playing_material_ref_json = ?::jsonb",
      "playback_status = 'playing'",
    ].join(",\n        "),
    setParams: [
      refKey(input.materialRef),
      JSON.stringify(input.materialRef),
    ],
  });
}

async function updateRadioSession(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  operation: MusicExperienceRadioSessionOperation;
  playbackEffect: MusicExperienceRadioSessionPlaybackEffect;
  now: string;
}): Promise<StateRow> {
  const playbackSetClause = (() => {
    switch (input.playbackEffect) {
      case "paused_existing":
        return [
          "playback_revision = playback_revision + 1",
          "playback_status = 'paused'",
        ];
      case "resumed_existing":
        return [
          "playback_revision = playback_revision + 1",
          "playback_status = 'playing'",
        ];
      case "unchanged":
        return [];
    }
  })();

  return advanceRevision({
    db: input.db,
    key: input.key,
    now: input.now,
    setClause: [
      "radio_session_revision = radio_session_revision + 1",
      "radio_session_lifecycle = ?",
      ...playbackSetClause,
    ].join(",\n        "),
    setParams: [radioSessionLifecycleForOperation(input.operation)],
  });
}

function radioSessionLifecycleForOperation(
  operation: MusicExperienceRadioSessionOperation,
): RadioWakeGateState {
  switch (operation) {
    case "start":
    case "resume":
      return "Running";
    case "pause":
      return "Paused";
    case "shutdown":
      return "Shutdown";
  }
}

function radioSessionPlaybackEffect(input: {
  operation: MusicExperienceRadioSessionOperation;
  previous: StateRow;
}): MusicExperienceRadioSessionPlaybackEffect {
  switch (input.operation) {
    case "start":
      return "unchanged";
    case "resume":
      return input.previous.playback_status === "paused" &&
        input.previous.now_playing_material_ref_key !== null
        ? "resumed_existing"
        : "unchanged";
    case "pause":
    case "shutdown":
      return input.previous.playback_status === "playing"
        ? "paused_existing"
        : "unchanged";
  }
}

async function updateRadioDirectionRevision(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  basis?: ConcernRevisionSet;
  now: string;
}): Promise<StateRow> {
  return advanceRevision({ ...input, setClause: "radio_direction_revision = radio_direction_revision + 1" });
}

async function readRadioTruth(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  radioDirectionRevision: ConcernRevision;
}): Promise<MusicExperienceRadioTruthSnapshot> {
  const row = await input.db.get<RadioTruthRow>(
    `
      SELECT
        motif_json,
        active_variations_json,
        evolved_lean_json,
        posture_commanded_revision_stamp
      FROM music_experience_radio_truth
      WHERE owner_scope = ?
        AND workspace_id = ?
    `,
    [input.key.ownerScope, input.key.workspaceId],
  );

  if (row === undefined) {
    return emptyRadioTruthSnapshot(input.radioDirectionRevision);
  }

  return radioTruthFromRow(row, input.radioDirectionRevision);
}

async function writeRadioDirection(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  direction: RadioDirectionSnapshot;
  now: string;
}): Promise<void> {
  await input.db.run(
    `
      INSERT INTO music_experience_radio_truth (
        owner_scope,
        workspace_id,
        motif_json,
        active_variations_json,
        evolved_lean_json,
        posture_commanded_revision_stamp,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?::jsonb, ?::jsonb, '[]'::jsonb, NULL, ?, ?)
      ON CONFLICT(owner_scope, workspace_id) DO UPDATE SET
        motif_json = excluded.motif_json,
        active_variations_json = excluded.active_variations_json,
        updated_at = excluded.updated_at
    `,
    [
      input.key.ownerScope,
      input.key.workspaceId,
      input.direction.motif === undefined ? null : JSON.stringify(input.direction.motif),
      JSON.stringify(input.direction.activeVariations),
      input.now,
      input.now,
    ],
  );
}

async function writeRadioPosture(input: {
  db: MusicDatabaseContext;
  key: MusicExperienceWorkspaceKey;
  lean: readonly VariationItem[];
  commandedRevisionStamp: ConcernRevision;
  now: string;
}): Promise<void> {
  await input.db.run(
    `
      INSERT INTO music_experience_radio_truth (
        owner_scope,
        workspace_id,
        motif_json,
        active_variations_json,
        evolved_lean_json,
        posture_commanded_revision_stamp,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, '[]'::jsonb, ?::jsonb, ?, ?, ?)
      ON CONFLICT(owner_scope, workspace_id) DO UPDATE SET
        evolved_lean_json = excluded.evolved_lean_json,
        posture_commanded_revision_stamp = excluded.posture_commanded_revision_stamp,
        updated_at = excluded.updated_at
    `,
    [
      input.key.ownerScope,
      input.key.workspaceId,
      JSON.stringify(input.lean),
      input.commandedRevisionStamp,
      input.now,
      input.now,
    ],
  );
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

export class QueueIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueIndexError";
  }
}

export class QueueEditPermissionError extends Error {
  constructor() {
    super("Music Experience queue item cannot be edited by this actor.");
    this.name = "QueueEditPermissionError";
  }
}

export class QueueNoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueNoopError";
  }
}

export class PlaybackNoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackNoopError";
  }
}

export class RadioTruthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadioTruthValidationError";
  }
}

export class RadioTruthNoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadioTruthNoopError";
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

function radioTruthFromRow(
  row: RadioTruthRow,
  currentRadioDirectionRevision: ConcernRevision,
): MusicExperienceRadioTruthSnapshot {
  const direction = {
    ...(row.motif_json === null ? {} : { motif: variationItemFromStoredJson(row.motif_json) }),
    activeVariations: variationItemsFromStoredJson(row.active_variations_json),
  };

  return {
    radioDirectionRevision: currentRadioDirectionRevision,
    direction,
    posture: postureSnapshot({
      lean: variationItemsFromStoredJson(row.evolved_lean_json),
      commandedRevisionStamp: row.posture_commanded_revision_stamp ?? undefined,
      currentRadioDirectionRevision,
    }),
  };
}

function postureSnapshot(input: {
  lean: readonly VariationItem[];
  commandedRevisionStamp: ConcernRevision | undefined;
  currentRadioDirectionRevision: ConcernRevision;
}): EvolvedPostureSnapshot {
  return {
    lean: input.lean,
    ...(input.commandedRevisionStamp === undefined ? {} : { commandedRevisionStamp: input.commandedRevisionStamp }),
    stale: input.commandedRevisionStamp !== undefined &&
      input.commandedRevisionStamp !== input.currentRadioDirectionRevision,
  };
}

function emptyRadioTruthSnapshot(radioDirectionRevision: ConcernRevision): MusicExperienceRadioTruthSnapshot {
  return {
    radioDirectionRevision,
    direction: {
      activeVariations: [],
    },
    posture: {
      lean: [],
      stale: false,
    },
  };
}

function variationItemsFromStoredJson(value: string | readonly VariationItem[]): readonly VariationItem[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(parsed)) {
    throw new Error("Stored Music Experience radio variation list JSON is not an array.");
  }
  return parsed.map(variationItemFromStoredJson);
}

function variationItemFromStoredJson(value: string | VariationItem | unknown): VariationItem {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!isRecord(parsed) || typeof parsed.kind !== "string") {
    throw new Error("Stored Music Experience radio variation item JSON is not an object.");
  }

  switch (parsed.kind) {
    case "text": {
      if (typeof parsed.text !== "string") {
        throw new Error("Stored Music Experience radio text variation has no text.");
      }
      return { kind: "text", text: parsed.text };
    }
    case "material": {
      if (!("materialRef" in parsed)) {
        throw new Error("Stored Music Experience radio material variation has no materialRef.");
      }
      return { kind: "material", materialRef: materialRefFromStoredJson(parsed.materialRef as string | Ref) };
    }
    case "scope": {
      if (!isRecord(parsed.scope) || typeof parsed.scope.kind !== "string") {
        throw new Error("Stored Music Experience radio scope variation has no scope.");
      }
      return { kind: "scope", scope: radioScopeFromStoredJson(parsed.scope) };
    }
    default:
      throw new Error("Stored Music Experience radio variation item kind is not supported.");
  }
}

function sameRadioDirection(
  left: RadioDirectionSnapshot,
  right: RadioDirectionSnapshot,
): boolean {
  if (left.motif === undefined || right.motif === undefined) {
    if (left.motif !== right.motif) {
      return false;
    }
  } else if (!sameVariationItem(left.motif, right.motif)) {
    return false;
  }
  return sameVariationItems(left.activeVariations, right.activeVariations);
}

function sameVariationItems(
  left: readonly VariationItem[],
  right: readonly VariationItem[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => sameVariationItem(item, right[index]!));
}

function sameVariationItem(left: VariationItem, right: VariationItem): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "text":
      return left.text === (right as Extract<VariationItem, { kind: "text" }>).text;
    case "material":
      return refKey(left.materialRef) === refKey((right as Extract<VariationItem, { kind: "material" }>).materialRef);
    case "scope":
      return sameRadioScope(left.scope, (right as Extract<VariationItem, { kind: "scope" }>).scope);
  }
}

function sameRadioScope(
  left: RadioDirectionScopeValue,
  right: RadioDirectionScopeValue,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "all":
    case "library":
      return true;
    case "source_library":
    case "relation":
    case "collection":
      return left.id === (right as Extract<RadioDirectionScopeValue, { kind: typeof left.kind }>).id;
    case "provider":
      return left.providerId === (right as Extract<RadioDirectionScopeValue, { kind: "provider" }>).providerId;
  }
}

function radioScopeFromStoredJson(value: Record<string, unknown>): RadioDirectionScopeValue {
  switch (value.kind) {
    case "all":
    case "library":
      return { kind: value.kind };
    case "source_library":
    case "relation":
    case "collection": {
      if (typeof value.id !== "string") {
        throw new Error("Stored Music Experience radio scope id is invalid.");
      }
      return { kind: value.kind, id: value.id };
    }
    case "provider": {
      if (typeof value.providerId !== "string") {
        throw new Error("Stored Music Experience radio provider scope id is invalid.");
      }
      return { kind: "provider", providerId: value.providerId };
    }
    default:
      throw new Error("Stored Music Experience radio scope kind is not supported.");
  }
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
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    radioSessionLifecycle: "Shutdown",
    playbackRevision: 0,
    queue: [],
    playback: {
      status: "paused",
    },
    radio: emptyRadioTruthSnapshot(0),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
