import { z } from "zod/v4";

import type { Result, ToolName } from "../../src/contracts/index.js";
import type { ToolDispatchPort } from "../../src/ports/index.js";
import {
  agentToolDescriptors,
  canonicalReviewToolNames,
  createMineMusicStageInterface,
  handbookToolNames,
  knowledgeToolNames,
  libraryToolNames,
  memoryToolNames,
  musicToolNames,
  stableToolNames,
  stageInterfaceToolInputSchemas,
  stageToolNames,
} from "../../src/stage_interface/index.js";

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

async function exposesEveryStableToolNameThroughStageInterface(): Promise<void> {
  const calls: ToolName[] = [];
  const dispatch: ToolDispatchPort = {
    call: async ({ toolName, payload }) => {
      calls.push(toolName);
      return { ok: true, value: { toolName, payload } };
    },
  };
  const stageInterface = createMineMusicStageInterface({ sessionId: "session-1", dispatch });

  for (const toolName of stableToolNames) {
    assert(toolName in stageInterface.tools, `Stage Interface should expose ${toolName}`);
    await assertOk(stageInterface.tools[toolName]({}));
  }

  assert(calls.length === stableToolNames.length, "Stage Interface tools should delegate to ToolDispatchPort");
}

async function stableToolNamesRemainInPublishedOrder(): Promise<void> {
  const expectedOrder = [
    "stage.context.read",
    "handbook.overview.read",
    "handbook.instrument.read",
    "handbook.tool.read",
    "stage.materials.prepare",
    "stage.recommendation.present",
    "stage.session.update",
    "stage.events.record",
    "stage.effects.propose",
    "music.material.resolve",
    "knowledge.query",
    "music.material.resolve.cards",
    "music.material.query",
    "music.material.related",
    "music.material.select",
    "music.material.context.brief",
    "music.pools.list",
    "music.links.refresh",
    "music.collection.save",
    "music.collection.unsave",
    "music.collection.favorite",
    "music.collection.unfavorite",
    "music.collection.block",
    "music.collection.unblock",
    "music.collection.item.add",
    "music.collection.item.remove",
    "music.collection.create",
    "music.collection.update",
    "music.collection.delete",
    "music.collection.list",
    "library.source.list",
    "library.import.start",
    "library.import.continue",
    "library.update.start",
    "library.update.continue",
    "library.import.status",
    "library.import.summary",
    "library.import.items.list",
    "canonical.review.list",
    "canonical.review.inspect",
    "canonical.review.apply",
    "canonical.review.auto_update",
    "memory.feedback.record",
    "memory.propose",
  ] satisfies ToolName[];

  assert(
    stableToolNames.join("\n") === expectedOrder.join("\n"),
    "stable tool order should remain unchanged",
  );
}

async function stableToolNamesHaveMatchingSchemasAndDescriptors(): Promise<void> {
  const uniqueStableNames = new Set(stableToolNames);
  const descriptorNames = agentToolDescriptors.map((descriptor) => descriptor.name);
  const schemaNames = Object.keys(stageInterfaceToolInputSchemas);
  const groupedToolNames = [
    ...stageToolNames,
    ...handbookToolNames,
    ...musicToolNames,
    ...knowledgeToolNames,
    ...libraryToolNames,
    ...canonicalReviewToolNames,
    ...memoryToolNames,
  ];

  assert(uniqueStableNames.size === stableToolNames.length, "stable tool names should not contain duplicates");
  assert(
    new Set(groupedToolNames).size === groupedToolNames.length,
    "tool definition group names should not contain duplicates",
  );
  assert(
    groupedToolNames.every((toolName) => uniqueStableNames.has(toolName)),
    "every grouped tool name should be published as a stable tool",
  );
  assert(
    stableToolNames.every((toolName) => groupedToolNames.includes(toolName)),
    "every stable tool should come from a tool definition group",
  );
  assert(
    stableToolNames.every((toolName) => descriptorNames.includes(toolName)),
    "every stable tool should have an agent descriptor",
  );
  assert(
    descriptorNames.every((toolName) => uniqueStableNames.has(toolName)),
    "every agent descriptor should refer to a stable tool",
  );
  assert(
    stableToolNames.every((toolName) => schemaNames.includes(toolName)),
    "every stable tool should have an input schema",
  );
  assert(
    schemaNames.every((toolName) => uniqueStableNames.has(toolName as ToolName)),
    "every input schema should refer to a stable tool",
  );
}

async function materialQuerySchemasHideExperimentalPreferenceHints(): Promise<void> {
  const querySchema = stageInterfaceToolInputSchemas["music.material.query"];
  const relatedSchema = stageInterfaceToolInputSchemas["music.material.related"];
  const selectSchema = stageInterfaceToolInputSchemas["music.material.select"];
  const queryPayloadSchema = z.object(querySchema).passthrough();
  const relatedPayloadSchema = z.object(relatedSchema).passthrough();
  const selectPayloadSchema = z.object(selectSchema).passthrough();

  assert(
    !Object.prototype.hasOwnProperty.call(querySchema, "preferenceHints"),
    "material query public schema should not advertise experimental preferenceHints",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(relatedSchema, "preferenceHints"),
    "material related public schema should not advertise experimental preferenceHints",
  );
  assert(
    !queryPayloadSchema.safeParse({ order: "library_order" }).success,
    "material query public schema should not advertise library_order",
  );
  assert(
    queryPayloadSchema.safeParse({ order: "recently_added" }).success,
    "material query public schema should keep supported ordering options",
  );
  assert(
    !relatedPayloadSchema.safeParse({ materialId: "seed", relation: "same_release" }).success,
    "material related public schema should not advertise same_release",
  );
  assert(
    !relatedPayloadSchema.safeParse({ materialId: "seed", relation: "same_release_group" }).success,
    "material related public schema should not advertise same_release_group",
  );
  assert(
    relatedPayloadSchema.safeParse({ materialId: "seed", relation: "same_artist" }).success &&
      relatedPayloadSchema.safeParse({ materialId: "seed", relation: "same_album" }).success &&
      relatedPayloadSchema.safeParse({ materialId: "seed", relation: "similar" }).success,
    "material related public schema should keep supported relation options",
  );
  assert(
    Object.prototype.hasOwnProperty.call(selectSchema, "candidates") &&
      Object.prototype.hasOwnProperty.call(selectSchema, "policy") &&
      Object.prototype.hasOwnProperty.call(selectSchema, "sort"),
    "material select public schema should expose compact candidate, policy, and sort inputs",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(selectSchema, "material"),
    "material select public schema should not expose internal material snapshots",
  );
  assert(
    selectPayloadSchema.safeParse({
      candidates: [{ materialId: "material-1", reason: "fits the request" }],
      policy: { purpose: "candidate_selection", freshness: { recommended: "session", mode: "hard" } },
      sort: { order: "least_recently_recommended" },
      limit: 5,
    }).success,
    "material select public schema should accept compact materialId candidates",
  );
  assert(
    selectPayloadSchema.safeParse({
      candidates: [{ materialId: "material-1" }],
      policy: { freshness: { recommended: "session", mode: "hard" } },
    }).success,
    "material select public schema should default policy purpose to candidate_selection",
  );
  assert(
    !selectPayloadSchema.safeParse({
      candidates: [{ materialId: "material-1" }],
      policy: { purpose: "recommendation_presentation" },
    }).success,
    "material select public schema should not expose recommendation presentation policy purpose",
  );
  assert(
    !selectPayloadSchema.safeParse({
      candidates: [{ materialId: "material-1" }],
      policy: { purpose: "feedback_target" },
    }).success,
    "material select public schema should not expose feedback target policy purpose",
  );
  assert(
    !queryPayloadSchema.safeParse({
      pool: { kind: "related", materialId: "seed", relation: "same_release" },
    }).success,
    "material query related pool public schema should not advertise same_release",
  );
}

async function collectionSchemasHideAdvancedMaterialTargetFields(): Promise<void> {
  const systemAddSchema = stageInterfaceToolInputSchemas["music.collection.favorite"];
  const systemRemoveSchema = stageInterfaceToolInputSchemas["music.collection.unfavorite"];
  const customAddSchema = stageInterfaceToolInputSchemas["music.collection.item.add"];
  const customRemoveSchema = stageInterfaceToolInputSchemas["music.collection.item.remove"];
  const hiddenFields = ["materialRef", "materialSnapshot", "relationScope", "identityRequirement"];

  for (const field of hiddenFields) {
    assert(
      !Object.prototype.hasOwnProperty.call(systemAddSchema, field),
      `system collection add public schema should not advertise ${field}`,
    );
    assert(
      !Object.prototype.hasOwnProperty.call(customAddSchema, field),
      `custom collection add public schema should not advertise ${field}`,
    );
  }
  assert(
    !Object.prototype.hasOwnProperty.call(systemRemoveSchema, "materialRef"),
    "system collection remove public schema should not advertise materialRef",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(customRemoveSchema, "materialRef"),
    "custom collection remove public schema should not advertise materialRef",
  );
  assert(
    Object.prototype.hasOwnProperty.call(systemAddSchema, "materialId") &&
      Object.prototype.hasOwnProperty.call(customAddSchema, "materialId"),
    "collection public schemas should expose materialId inputs",
  );
}

await exposesEveryStableToolNameThroughStageInterface();
await stableToolNamesRemainInPublishedOrder();
await stableToolNamesHaveMatchingSchemasAndDescriptors();
await materialQuerySchemasHideExperimentalPreferenceHints();
await collectionSchemasHideAdvancedMaterialTargetFields();
