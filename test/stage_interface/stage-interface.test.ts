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
    "stage.session.update",
    "stage.events.record",
    "stage.effects.propose",
    "music.material.resolve",
    "knowledge.query",
    "music.material.resolve.cards",
    "music.material.query",
    "music.material.related",
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

await exposesEveryStableToolNameThroughStageInterface();
await stableToolNamesRemainInPublishedOrder();
await stableToolNamesHaveMatchingSchemasAndDescriptors();
