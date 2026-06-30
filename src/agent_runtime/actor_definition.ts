import type {
  AgentActorKind,
  ConcernRevisionChangeActor,
  ConcernRevisionSet,
} from "../contracts/kernel.js";
import type { ToolDeclaration } from "../contracts/stage_interface.js";
import { toPiToolName } from "./stage_tool_bridge.js";

export type ActorName = "main" | "radio";

export type WorkspaceContextSectionName = "listening" | "radio";

export type ActorIdentity = {
  role: string;
  job: string;
  persona: string;
};

export type ActorInstruction = {
  responsibilities: string;
  operatingRules: string;
  prohibitions: string;
};

export type ActorDefinition = {
  name: ActorName;
  runtimePolicy: {
    actorKind: AgentActorKind;
    cascadePriority: number;
    additionalToolPreconditionBasis: Readonly<
      Partial<Record<ToolDeclaration["name"], readonly (keyof ConcernRevisionSet)[]>>
    >;
  };
  identity: ActorIdentity;
  instruction: ActorInstruction;
  declaredWorkspaceSections: readonly WorkspaceContextSectionName[];
  toolPack: {
    stageToolNames: readonly ToolDeclaration["name"][];
  };
};

export function actorKindForDefinition(actor: ActorDefinition): AgentActorKind {
  return actor.runtimePolicy.actorKind;
}

export const radioDefinition: ActorDefinition = {
  name: "radio",
  runtimePolicy: {
    actorKind: "radio_agent",
    cascadePriority: 1,
    additionalToolPreconditionBasis: {
      "playback.queue.append": ["radioDirectionRevision", "radioSessionRevision"],
      "playback.queue.remove": ["radioDirectionRevision", "radioSessionRevision"],
      "playback.queue.replace": ["radioDirectionRevision", "radioSessionRevision"],
      "playback.queue.move": ["radioDirectionRevision", "radioSessionRevision"],
      "playback.queue.clear": ["radioDirectionRevision", "radioSessionRevision"],
    },
  },
  identity: {
    role: "Radio presence for the current listening direction.",
    job: "Keep the listening flow alive with choices that feel intentional, fresh, and connected, never on autopilot.",
    persona:
      "Late-night DJ energy: reads the room, quietly playful, hates dead air, and would rather play something slightly unexpected than the obvious pick.",
  },
  instruction: {
    responsibilities:
      "Keep the current direction stocked with fitting tracks so the flow does not run dry. Match the direction and the listener's taste; lean fresh over obvious.",
    operatingRules:
      "Work from current state: `radio` gives the direction and posture, `listening` gives what is queued and playing. " +
      "In the direction, the `motif` is the main theme and the active variations are layered on it: keep the motif primary; variations shade it, they do not compete with it or override it. " +
      "When the run wake reason is 'direction_changed', first review queued items marked 'added by radio' against the latest direction; correct only those future items with the queue remove, replace, move, or clear tools, append only when it improves the transition, and leave the queue unchanged when it already fits. " +
      "Use `radio_lean_add`, `radio_lean_replace`, `radio_lean_remove`, `radio_lean_move`, or `radio_lean_clear` when your current musical posture needs to evolve under the same commanded direction. " +
      "Interpret the direction aesthetically, then find candidates with `music_discovery_lookup`, or browse the listener's library with `library_catalog_browse` and `library_catalog_sample` when the direction points there. " +
      "For a 'low_watermark' run, add roughly the run's suggestedAppendCount; for a 'direction_changed' run, treat that count as available refill room rather than a requirement, then stop. " +
      "Let `userTasteHint` guide toward the listener's taste, append with `playback_queue_append`, and use `playback_queue_remove`, `playback_queue_replace`, `playback_queue_move`, or `playback_queue_clear` only to correct queue items you added.",
    prohibitions:
      "Do not repeat what is already queued or playing. " +
      "Do not search the direction literally: a motif like 'night' does not mean songs with 'night' in the title; think about what actually carries a night feeling or fits night listening, then look that up. " +
      "Do not treat `userTasteHint` as something the listener explicitly said. " +
      "Your scope is selecting music and correcting only your own future queue additions; direction, now-playing, and other actors' queued items are not yours to change.",
  },
  declaredWorkspaceSections: ["listening", "radio"],
  toolPack: {
    stageToolNames: [
      "music.discovery.list_scopes",
      "music.discovery.lookup",
      "library.catalog.list_scopes",
      "library.catalog.browse",
      "library.catalog.sample",
      "library.catalog.summary",
      "playback.queue.append",
      "playback.queue.remove",
      "playback.queue.replace",
      "playback.queue.move",
      "playback.queue.clear",
      "radio.lean.add",
      "radio.lean.remove",
      "radio.lean.replace",
      "radio.lean.move",
      "radio.lean.clear",
    ],
  },
};

export const mainDefinition: ActorDefinition = {
  name: "main",
  runtimePolicy: {
    actorKind: "main_agent",
    cascadePriority: 2,
    additionalToolPreconditionBasis: {},
  },
  identity: {
    role: "Music partner inside the MineMusic workspace.",
    job: "Help the user turn scattered music, moods, references, and half-formed choices into grounded next moves.",
    persona:
      "Warm, sharp-eared, genuinely opinionated when it helps - the friend who actually knows the records, not the one who namedrops. Allergic to ceremony.",
  },
  instruction: {
    responsibilities:
      "Help the listener shape their music: find and explain things, build the queue and collections, start radio or playback. Be a real partner, not a search box.",
    operatingRules:
      "Turn what the listener describes - a mood, a reference, a half-formed idea - into the actual music behind it before reaching for a tool: think about what really carries that feeling, then look it up, rather than matching their words literally. " +
      "Ground your suggestions: find real candidates with `music_discovery_lookup` or `library_catalog_browse`, and show a settled pick with `music_experience_present`. " +
      "Check `listening` for what is playing and queued before suggesting next steps. " +
      "When the radio direction comes up, its `motif` is the main theme and active variations are secondary shading on it. " +
      "Use `radio_motif_set` or `radio_motif_clear` for the single motif slot, and `radio_variations_add`, `radio_variations_remove`, `radio_variations_replace`, `radio_variations_move`, or `radio_variations_clear` for the ordered active-variation list. " +
      "Use `playback_queue_append`, `playback_queue_remove`, `playback_queue_replace`, `playback_queue_move`, or `playback_queue_clear` to edit the current queue when the listener asks for queue changes. " +
      "Let `userTasteHint` align you with the listener's taste as a hint, not a rule. " +
      "Use the collection and relation tools for library housekeeping, and the import tools to bring in outside music. " +
      "Prefer a few well-chosen moves over long tool chains; ask only when intent is genuinely unclear.",
    prohibitions:
      "Do not present or queue anything you have not actually found via a tool. " +
      "Do not search the listener's words literally: 'something for a rainy night' or 'sad songs' does not mean titles containing those words; think about what actually carries that feeling, then look it up. " +
      "Do not treat `userTasteHint` as something the listener explicitly said. " +
      "For a large import or deleting a collection, confirm intent first.",
  },
  declaredWorkspaceSections: ["listening", "radio"],
  toolPack: {
    stageToolNames: [
      "music.discovery.list_scopes",
      "music.discovery.lookup",
      "library.catalog.list_scopes",
      "library.catalog.browse",
      "library.catalog.sample",
      "library.catalog.summary",
      "library.collection.get",
      "library.collection.create",
      "library.collection.add",
      "library.collection.move",
      "library.collection.rename",
      "library.collection.remove",
      "library.collection.delete",
      "library.relation.get",
      "library.import.list_sources",
      "library.import.start",
      "library.import.status",
      "music.experience.present",
      "playback.queue.append",
      "playback.queue.remove",
      "playback.queue.replace",
      "playback.queue.move",
      "playback.queue.clear",
      "music.experience.playback.play",
      "radio.motif.set",
      "radio.motif.clear",
      "radio.variations.add",
      "radio.variations.remove",
      "radio.variations.replace",
      "radio.variations.move",
      "radio.variations.clear",
      "stage.runtime.status",
    ],
  },
};

export function validateActorDefinition(actor: ActorDefinition): void {
  validateRuntimePolicy(actor);
  validateActorIdentity(actor);
  validateDeclaredSections(actor);
  validateInstructionToolReferences(actor);
}

export function actorCascadePriority(actor: ConcernRevisionChangeActor): number {
  return actorCascadePriorities[actor];
}

export function selectActorStageToolDeclarations(input: {
  actor: ActorDefinition;
  tools: readonly ToolDeclaration[];
}): readonly ToolDeclaration[] {
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  return input.actor.toolPack.stageToolNames.map((name) => {
    const tool = toolsByName.get(name);
    if (tool === undefined) {
      throw new Error(`Actor '${input.actor.name}' requires Stage tool '${name}'.`);
    }
    return tool;
  });
}

function validateActorIdentity(actor: ActorDefinition): void {
  for (const [field, value] of Object.entries(actor.identity)) {
    if (value.trim().length === 0) {
      throw new Error(`Actor '${actor.name}' identity.${field} must be non-empty.`);
    }
  }
}

function validateRuntimePolicy(actor: ActorDefinition): void {
  if (actor.runtimePolicy.actorKind !== `${actor.name}_agent`) {
    throw new Error(`Actor '${actor.name}' runtimePolicy.actorKind does not match its name.`);
  }
  if (!Number.isSafeInteger(actor.runtimePolicy.cascadePriority) || actor.runtimePolicy.cascadePriority <= 0) {
    throw new Error(`Actor '${actor.name}' runtimePolicy.cascadePriority must be a positive safe integer.`);
  }
  const declaredTools = new Set(actor.toolPack.stageToolNames);
  for (const [toolName, concerns] of Object.entries(actor.runtimePolicy.additionalToolPreconditionBasis)) {
    if (concerns === undefined) {
      continue;
    }
    if (!declaredTools.has(toolName)) {
      throw new Error(`Actor '${actor.name}' runtime policy references tool '${toolName}' outside its tool pack.`);
    }
    if (new Set(concerns).size !== concerns.length) {
      throw new Error(`Actor '${actor.name}' runtime policy repeats a precondition concern for '${toolName}'.`);
    }
    for (const concern of concerns) {
      if (!concernRevisionKeys.has(concern)) {
        throw new Error(`Actor '${actor.name}' runtime policy references unknown precondition concern '${concern}'.`);
      }
    }
  }
}

function validateDeclaredSections(actor: ActorDefinition): void {
  const seen = new Set<WorkspaceContextSectionName>();
  for (const section of actor.declaredWorkspaceSections) {
    if (seen.has(section)) {
      throw new Error(`Actor '${actor.name}' declares Workspace Context section '${section}' more than once.`);
    }
    seen.add(section);
  }
}

function validateInstructionToolReferences(actor: ActorDefinition): void {
  const allowedModelToolNames = new Set(actor.toolPack.stageToolNames.map(toPiToolName));
  const instructionText = [
    actor.instruction.responsibilities,
    actor.instruction.operatingRules,
    actor.instruction.prohibitions,
  ].join("\n");

  for (const token of backtickedTokens(instructionText)) {
    if (!isModelVisibleToolReference(token)) {
      continue;
    }
    if (!allowedModelToolNames.has(token)) {
      throw new Error(
        `Actor '${actor.name}' instruction references tool '${token}' outside its ActorDefinition tool pack.`,
      );
    }
  }
}

function backtickedTokens(text: string): readonly string[] {
  return [...text.matchAll(/`([^`\r\n]+)`/gu)].map((match) => match[1] ?? "");
}

function isModelVisibleToolReference(token: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u.test(token);
}

const actorCascadePriorities: Readonly<Record<ConcernRevisionChangeActor, number>> = {
  user: 3,
  main_agent: mainDefinition.runtimePolicy.cascadePriority,
  radio_agent: radioDefinition.runtimePolicy.cascadePriority,
};

const concernRevisionKeys = new Set<keyof ConcernRevisionSet>([
  "radioDirectionRevision",
  "queueRevision",
  "radioSessionRevision",
  "playbackRevision",
]);
