import { parseRefKey, type Ref, type Result } from "../../contracts/kernel.js";
import type { StageToolContext } from "../../contracts/stage_interface.js";

// Shared material-handle -> materialRef resolution for library.* edit tools.
// Both collection_edit and relation_edit resolve a durable material item handle
// to its underlying materialRef; no new handle is minted and no internal ref
// leaks. The invalid-input suggestedFix is caller-supplied because each tool
// family names its own next-step (collection scope handle vs music.experience).
// stageEditFail hardcodes area "music_data_platform" (owning area of both
// library.collection and library.relation).

export async function resolveMaterialItemRef(
  ctx: StageToolContext,
  publicId: string,
  invalidInputSuggestedFix: string,
): Promise<Result<Ref>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "material",
    publicId,
  });

  if (resolved === undefined) {
    return stageEditFail({
      code: "item_not_found",
      message: "Material item handle is unknown or no longer available.",
      retryable: true,
      suggestedFix: "Retry with a current material handle, or look up and present the item again.",
    });
  }

  const materialRef = refFromResolvedAnchor(resolved);
  if (materialRef === undefined || !isPresentableMaterialRef(materialRef)) {
    return stageEditFail({
      code: "invalid_input",
      message: "Material item handle did not resolve to a valid material.",
      retryable: false,
      suggestedFix: invalidInputSuggestedFix,
    });
  }

  return { ok: true, value: materialRef };
}

export function stageEditFail(input: {
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
      area: "music_data_platform",
      retryable: input.retryable,
      suggestedFix: input.suggestedFix,
    },
  };
}

function refFromResolvedAnchor(anchor: unknown): Ref | undefined {
  if (!isRecord(anchor)) {
    return undefined;
  }
  const value = anchor.materialRef;
  if (typeof value !== "string") {
    return undefined;
  }
  return parseRefKey(value);
}

function isPresentableMaterialRef(ref: Ref): boolean {
  return (
    ref.namespace === "material" &&
    (ref.kind === "recording" || ref.kind === "album" || ref.kind === "artist")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
