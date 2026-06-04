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
  sourceRef,
} from "./material-search-test-harness.js";

async function ordinarySearchExcludesOnlyMaterialLevelBlockedRelations(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const allowed = materialRef("allowed");
  const materialBlocked = materialRef("material-blocked");
  const sourceBlocked = materialRef("source-blocked");
  const blockedCollectionMember = materialRef("blocked-collection-member");
  const wrongVersion = materialRef("wrong-version");
  const notPlayable = materialRef("not-playable");
  const blockedSource = sourceRef("track", "source-blocked-source");

  for (const ref of [allowed, materialBlocked, sourceBlocked, blockedCollectionMember, wrongVersion, notPlayable]) {
    store.putMaterial(activeMaterial(ref));
  }
  store.putRelation(relation(materialBlocked, "blocked"));
  store.putRelation(relation(sourceBlocked, "blocked", "local_profile:default", { level: "source", sourceRef: blockedSource }));
  store.putRelation(relation(wrongVersion, "wrong_version"));
  store.putRelation(relation(notPlayable, "not_playable"));
  collections.putCollection(collection({ id: "saved", relationKind: "saved" }));
  collections.putCollection(collection({ id: "blocked", relationKind: "blocked" }));
  for (const ref of [allowed, materialBlocked, sourceBlocked, blockedCollectionMember, wrongVersion, notPlayable]) {
    collections.putItem(collectionItem("saved", ref));
  }
  collections.putItem(collectionItem("blocked", blockedCollectionMember));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection" }],
  }));
  const hitIds = result.hits.map((hit) => hit.materialRef.id);

  assert(hitIds.includes(allowed.id), "ordinary collection search should include eligible positive membership");
  assert(!hitIds.includes(materialBlocked.id), "active material-level blocked relation should hard-exclude ordinary search");
  assert(hitIds.includes(sourceBlocked.id), "source-level blocked relation should not exclude the whole material from Search");
  assert(hitIds.includes(blockedCollectionMember.id), "blocked Collection membership should not globally post-filter Search candidates");
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

await ordinarySearchExcludesOnlyMaterialLevelBlockedRelations();
await explicitBlockedCollectionScopeIsAuditException();
await targetKindIsHardEligibilityFilter();
