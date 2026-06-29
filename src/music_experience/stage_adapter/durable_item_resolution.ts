import { parseRefKey, refKey, type Ref, type Result } from "../../contracts/kernel.js";
import type { MusicMaterial } from "../../contracts/music_data_platform.js";
import type {
  MaterialMusicItemHandle,
  MusicItemHandle,
  StageToolContext,
} from "../../contracts/stage_interface.js";
import {
  formatMusicItemHandle,
  parseMusicItemHandle,
} from "../../contracts/stage_interface.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";

export type ResolveDurableMusicItemPorts = {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
};

export async function resolveDurableMusicItem(
  ctx: StageToolContext,
  item: MusicItemHandle,
  ports: ResolveDurableMusicItemPorts,
): Promise<Result<Ref>> {
  const material = await resolveDurableMusicMaterial(ctx, item, ports);
  if (!material.ok) {
    return material;
  }

  return {
    ok: true,
    value: material.value.materialRef,
  };
}

export async function resolveDurableMusicMaterial(
  ctx: StageToolContext,
  item: MusicItemHandle,
  ports: ResolveDurableMusicItemPorts,
): Promise<Result<MusicMaterial>> {
  const parsed = parseMusicItemHandle(item);
  switch (parsed.kind) {
    case "candidate":
      return resolveCandidate(ctx, parsed.id, ports);
    case "material":
      return resolveMaterial(ctx, parsed.id, ports);
  }
}

export async function mintMaterialItemHandle(
  ctx: StageToolContext,
  materialRef: Ref,
): Promise<MaterialMusicItemHandle> {
  const publicId = await ctx.handleMinting.mint({
    ownerScope: ctx.ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(materialRef),
    },
  });

  return formatMusicItemHandle({
    kind: "material",
    id: publicId,
  });
}

export function musicExperienceFail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix: string;
}): Result<never> {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      area: "music_experience",
      retryable: input.retryable,
      suggestedFix: input.suggestedFix,
    },
  };
}

// Shared abort guard for Music Experience stage tools: returns the public
// operation_aborted Result when the call was aborted before it could safely
// commit, otherwise undefined so the handler proceeds. Both the queue/playback
// and radio-truth adapters honor this at their owned Stage Interface boundary.
export function failIfAborted(signal: AbortSignal | undefined): Result<never> | undefined {
  if (signal?.aborted !== true) {
    return undefined;
  }

  return musicExperienceFail({
    code: "operation_aborted",
    message: "Music Experience operation was aborted before it could safely commit.",
    retryable: true,
    suggestedFix: "Retry the action if it is still desired.",
  });
}

async function resolveCandidate(
  ctx: StageToolContext,
  publicId: string,
  ports: ResolveDurableMusicItemPorts,
): Promise<Result<MusicMaterial>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "candidate",
    publicId,
  });

  if (resolved === undefined) {
    return candidateNotFound("Candidate handle is unknown or no longer available.");
  }

  const materialCandidateRef = refFromResolvedAnchor(resolved, "materialCandidateRef");
  if (materialCandidateRef === undefined || !isProviderMaterialCandidateRef(materialCandidateRef)) {
    return invalidInput("Candidate handle did not resolve to a valid material candidate.");
  }

  const abortedBeforeCommit = failIfAborted(ctx.abortSignal);
  if (abortedBeforeCommit !== undefined) {
    return abortedBeforeCommit;
  }

  const committed = await ports.candidateCommit.commitCandidate({
    materialCandidateRef,
  });

  if (!committed.ok) {
    return translateCandidateCommitFailure(committed.error.code);
  }

  const material = await ports.materialProjection.projectMusicMaterial({
    materialRef: committed.value.materialRef,
  });
  if (material === undefined) {
    return materialNotFound("Music material is not available.");
  }

  return {
    ok: true,
    value: material,
  };
}

async function resolveMaterial(
  ctx: StageToolContext,
  publicId: string,
  ports: ResolveDurableMusicItemPorts,
): Promise<Result<MusicMaterial>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "material",
    publicId,
  });

  if (resolved === undefined) {
    return materialNotFound("Material item handle is unknown or no longer available.");
  }

  const materialRef = refFromResolvedAnchor(resolved, "materialRef");
  if (materialRef === undefined || !isPresentableMaterialRef(materialRef)) {
    return invalidInput("Material item handle did not resolve to a valid material.");
  }

  const material = await ports.materialProjection.projectMusicMaterial({ materialRef });
  if (material === undefined) {
    return materialNotFound("Music material is not available.");
  }

  return {
    ok: true,
    value: material,
  };
}

function refFromResolvedAnchor(
  anchor: unknown,
  fieldName: "materialCandidateRef" | "materialRef",
): Ref | undefined {
  if (!isRecord(anchor)) {
    return undefined;
  }

  const value = anchor[fieldName];
  if (typeof value !== "string") {
    return undefined;
  }

  return parseRefKey(value);
}

function translateCandidateCommitFailure(code: string): Result<never> {
  switch (code) {
    case "music_data.material_candidate_expired":
      return candidateExpired("Candidate handle has expired.");
    case "music_data.material_candidate_not_found":
      return candidateNotFound("Candidate handle is unknown or no longer available.");
    default:
      throw new Error(`Music Experience received unsupported Candidate Commit error code: ${code}`);
  }
}

function candidateExpired(message: string): Result<never> {
  return musicExperienceFail({
    code: "candidate_expired",
    message,
    retryable: true,
    suggestedFix: "Start a fresh music.discovery.lookup call and retry with a current candidate handle.",
  });
}

function candidateNotFound(message: string): Result<never> {
  return musicExperienceFail({
    code: "candidate_not_found",
    message,
    retryable: true,
    suggestedFix: "Start a fresh music.discovery.lookup call and retry with one of the returned candidate handles.",
  });
}

export function materialNotFound(message: string): Result<never> {
  return musicExperienceFail({
    code: "material_not_found",
    message,
    retryable: true,
    suggestedFix: "Retry with a current material handle or look up the item again.",
  });
}

function invalidInput(message: string): Result<never> {
  return musicExperienceFail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with item as a full [material:...] or [candidate:...] handle.",
  });
}

function isProviderMaterialCandidateRef(ref: Ref): boolean {
  return ref.namespace === "material_candidate" &&
    ref.kind === "provider_candidate" &&
    ref.id.startsWith("mc_");
}

function isPresentableMaterialRef(ref: Ref): boolean {
  return ref.namespace === "material" &&
    (ref.kind === "recording" || ref.kind === "album" || ref.kind === "artist");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
