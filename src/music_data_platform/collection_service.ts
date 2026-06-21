import type { Ref } from "../contracts/kernel.js";
import type { MusicDatabase, MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  createCollectionRecords,
  type CollectionItemRecord,
  type CollectionRecord,
} from "./collection_records.js";
import {
  assertCollectionRef,
  type CollectionKind,
} from "./collection_ref.js";
import { DEFAULT_OWNER_SCOPE, assertOwnerScope } from "./owner_scope.js";
import { runSourceOfTruthWrite } from "./source_of_truth_write_commands.js";
import type { ProjectionMaintenanceDispatcher } from "./projection_maintenance_dispatcher.js";

// Invariant 3 + D9: the service is the agent-facing surface (consumed by the
// library.collection.* stage adapter in 24D). getCollection reads the fact
// table (Invariant 3); every edit runs through runSourceOfTruthWrite and
// returns the post-edit collection state. assertWorkflowFacingOwnerScope gates
// every method (Invariant 6).
export type LibraryCollectionServiceState = {
  collection: CollectionRecord;
  items: readonly CollectionItemRecord[];
};

export type CreateLibraryCollectionServiceInput = {
  database: MusicDatabase;
  projectionMaintenanceDispatcher?: ProjectionMaintenanceDispatcher;
};

type CollectionEditBase = {
  ownerScope: string;
  collectionRef: Ref;
  now: string;
};

export type LibraryCollectionService = {
  getCollection(input: {
    ownerScope: string;
    collectionRef: Ref;
  }): Promise<LibraryCollectionServiceState>;
  createCollection(input: {
    ownerScope: string;
    collectionKind: CollectionKind;
    name: string;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  renameCollection(
    input: CollectionEditBase & { name: string },
  ): Promise<LibraryCollectionServiceState>;
  addCollectionItem(
    input: CollectionEditBase & { materialRef: Ref },
  ): Promise<LibraryCollectionServiceState>;
  removeCollectionItem(
    input: CollectionEditBase & { materialRef: Ref },
  ): Promise<LibraryCollectionServiceState>;
  moveCollectionItem(
    input: CollectionEditBase & { materialRef: Ref; toPosition: number },
  ): Promise<LibraryCollectionServiceState>;
  deleteCollection(
    input: CollectionEditBase,
  ): Promise<LibraryCollectionServiceState>;
};

export function createLibraryCollectionService(
  input: CreateLibraryCollectionServiceInput,
): LibraryCollectionService {
  return {
    async getCollection(readInput) {
      assertWorkflowFacingOwnerScope(readInput.ownerScope);
      // Invariant 3: read the fact table directly so a get immediately after an
      // add returns the added item without waiting for the pg-boss rebuild.
      return readCollectionState({
        db: input.database.context(),
        ownerScope: readInput.ownerScope,
        collectionRef: readInput.collectionRef,
      });
    },
    async createCollection(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      const collectionRef = await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          const created = await writes.collections.createCollection({
            ownerScope: editInput.ownerScope,
            collectionKind: editInput.collectionKind,
            name: editInput.name,
          });
          return created.collectionRef;
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef,
      });
    },
    async renameCollection(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          await writes.collections.renameCollection({
            ownerScope: editInput.ownerScope,
            collectionRef: editInput.collectionRef,
            name: editInput.name,
          });
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef: editInput.collectionRef,
      });
    },
    async addCollectionItem(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          await writes.collections.addCollectionItem({
            ownerScope: editInput.ownerScope,
            collectionRef: editInput.collectionRef,
            materialRef: editInput.materialRef,
          });
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef: editInput.collectionRef,
      });
    },
    async removeCollectionItem(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          await writes.collections.removeCollectionItem({
            ownerScope: editInput.ownerScope,
            collectionRef: editInput.collectionRef,
            materialRef: editInput.materialRef,
          });
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef: editInput.collectionRef,
      });
    },
    async moveCollectionItem(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          await writes.collections.moveCollectionItem({
            ownerScope: editInput.ownerScope,
            collectionRef: editInput.collectionRef,
            materialRef: editInput.materialRef,
            toPosition: editInput.toPosition,
          });
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef: editInput.collectionRef,
      });
    },
    async deleteCollection(editInput) {
      assertWorkflowFacingOwnerScope(editInput.ownerScope);
      await runSourceOfTruthWrite({
        database: input.database,
        now: editInput.now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (_db, writes) => {
          await writes.collections.deleteCollection({
            ownerScope: editInput.ownerScope,
            collectionRef: editInput.collectionRef,
          });
        },
      });
      return readCollectionState({
        db: input.database.context(),
        ownerScope: editInput.ownerScope,
        collectionRef: editInput.collectionRef,
      });
    },
  };
}

async function readCollectionState(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  collectionRef: Ref;
}): Promise<LibraryCollectionServiceState> {
  assertOwnerScope(input.ownerScope);
  assertCollectionRef(input.collectionRef);

  const records = createCollectionRecords({ db: input.db });
  // The two reads are independent (listCollectionItems filters on
  // collection_ref_key and yields [] for a missing collection), so they run in
  // parallel; the not-found check still gates the return.
  const [collection, items] = await Promise.all([
    records.getCollection({
      ownerScope: input.ownerScope,
      collectionRef: input.collectionRef,
    }),
    records.listCollectionItems({
      ownerScope: input.ownerScope,
      collectionRef: input.collectionRef,
    }),
  ]);
  if (collection === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.collection_not_found",
      message: "Library collection was not found.",
    });
  }
  return { collection, items };
}

function assertWorkflowFacingOwnerScope(ownerScope: string): void {
  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: `Workflow-facing library collection operations currently support only owner scope '${DEFAULT_OWNER_SCOPE}'.`,
    });
  }
}
