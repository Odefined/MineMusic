import { createMaterialSearchService } from "../../src/material/index.js";
import {
  activeMaterial,
  assert,
  assertOk,
  collection,
  collectionItem,
  FakeMaterialSearchCollection,
  FakeMaterialSearchStore,
  materialRef,
  relation,
} from "./material-search-test-harness.js";

async function ordinarySearchExcludesBlockedButKeepsRepairableRelations(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const allowed = materialRef("allowed");
  const blockedRelation = materialRef("blocked-relation");
  const blockedCollection = materialRef("blocked-collection");
  const wrongVersion = materialRef("wrong-version");
  const notPlayable = materialRef("not-playable");

  for (const ref of [allowed, blockedRelation, blockedCollection, wrongVersion, notPlayable]) {
    store.putMaterial(activeMaterial(ref));
  }
  store.putRelation(relation(blockedRelation, "blocked"));
  store.putRelation(relation(wrongVersion, "wrong_version"));
  store.putRelation(relation(notPlayable, "not_playable"));
  collections.putCollection(collection({ id: "saved", relationKind: "saved" }));
  collections.putCollection(collection({ id: "blocked", relationKind: "blocked" }));
  for (const ref of [allowed, blockedRelation, blockedCollection, wrongVersion, notPlayable]) {
    collections.putItem(collectionItem("saved", ref));
  }
  collections.putItem(collectionItem("blocked", blockedCollection));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection" }],
  }));
  const hitIds = result.hits.map((hit) => hit.materialRef.id);

  assert(hitIds.includes(allowed.id), "ordinary collection search should include eligible positive membership");
  assert(!hitIds.includes(blockedRelation.id), "active material-level blocked relation should hard-exclude ordinary search");
  assert(!hitIds.includes(blockedCollection.id), "blocked Collection membership should override positive visibility");
  assert(hitIds.includes(wrongVersion.id), "wrong_version should remain a policy/repair concern, not Search hard exclusion");
  assert(hitIds.includes(notPlayable.id), "not_playable should remain a policy/repair concern, not Search hard exclusion");
}

async function explicitBlockedCollectionScopeIsAuditException(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const blocked = materialRef("blocked-audit");
  store.putMaterial(activeMaterial(blocked));
  store.putRelation(relation(blocked, "blocked"));
  collections.putCollection(collection({ id: "blocked", relationKind: "blocked" }));
  collections.putItem(collectionItem("blocked", blocked));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection", relation: "blocked" }],
  }));

  assert(result.hits.length === 1 && result.hits[0]?.materialRef.id === blocked.id, "explicit blocked collection scope should bypass ordinary blocked eligibility");
}

async function targetKindIsHardEligibilityFilter(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const recording = materialRef("target-recording");
  const release = materialRef("target-release");
  store.putMaterial(activeMaterial(recording, "recording"));
  store.putMaterial(activeMaterial(release, "release"));
  collections.putCollection(collection({ id: "saved", relationKind: "saved" }));
  collections.putItem(collectionItem("saved", recording));
  collections.putItem(collectionItem("saved", release));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection" }],
    targetKind: "release",
  }));

  assert(result.hits.length === 1 && result.hits[0]?.materialRef.id === release.id, "targetKind should be a hard material-kind filter");
}

await ordinarySearchExcludesBlockedButKeepsRepairableRelations();
await explicitBlockedCollectionScopeIsAuditException();
await targetKindIsHardEligibilityFilter();
