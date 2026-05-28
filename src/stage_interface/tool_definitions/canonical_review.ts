import { z } from "zod/v4";

import type {
  ProvisionalReviewApplyInput,
  ProvisionalReviewAutoUpdateInput,
  ProvisionalReviewInspectInput,
  ProvisionalReviewListInput,
  Ref,
  Result,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  CanonicalMaintenancePort,
} from "../../ports/index.js";
import {
  compactReviewAutoUpdate,
  compactReviewApply,
  compactReviewInspect,
  compactReviewList,
  reviewSubjectRef,
} from "../outputs.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const canonicalReviewToolNames = [
  "canonical.review.list",
  "canonical.review.inspect",
  "canonical.review.apply",
  "canonical.review.auto_update",
] as const;

export type CanonicalReviewToolName = (typeof canonicalReviewToolNames)[number];

export type CanonicalReviewToolGroupContext = {
  canonicalMaintenance?: CanonicalMaintenancePort;
};

const reviewRefTokenSchema = z.object({
  kind: z.enum(["recording", "release"]),
  id: z.string(),
});

export const canonicalReviewToolDefinitions = [
  {
    name: "canonical.review.list",
    description: "List current provisional recordings for Canonical Maintenance review; default batch use hides cannot-confirm review-state subjects, and includeCannotConfirm true opts in.",
    inputSchemaRef: "ProvisionalReviewListInput",
    outputSchemaRef: "ProvisionalReviewListOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
      includeCannotConfirm: z.boolean().optional(),
    },
    async handler({ context, sessionId, payload }) {
      const availableMaintenance = readCanonicalMaintenance(context.canonicalMaintenance);

      if (!availableMaintenance.ok) {
        return availableMaintenance;
      }

      const result = await availableMaintenance.value.reviewList({
        ...readPayload<Omit<ProvisionalReviewListInput, "sessionId">>(payload),
        sessionId,
      });

      return result.ok ? ok(compactReviewList(result.value)) : result;
    },
  },
  {
    name: "canonical.review.inspect",
    description: "Inspect one provisional recording: summary is default; detail requires the latest inspectionId plus recordingRefToken, and releaseTrackPositions also requires releaseRefTokens.",
    inputSchemaRef: "ProvisionalReviewInspectInput",
    outputSchemaRef: "ProvisionalReviewInspection",
    availability: "requires_active_instrument",
    inputSchema: {
      subjectId: z.string(),
      view: z.enum(["summary", "detail"]).optional(),
      inspectionId: z.string().optional(),
      recordingRefToken: reviewRefTokenSchema.optional(),
      include: z.array(z.enum(["releaseAppearances", "releaseTrackPositions"])).optional(),
      releaseRefTokens: z.array(reviewRefTokenSchema).optional(),
      knowledgeFactLimit: z.number().int().positive().optional(),
    },
    async handler({ context, sessionId, payload }) {
      const availableMaintenance = readCanonicalMaintenance(context.canonicalMaintenance);

      if (!availableMaintenance.ok) {
        return availableMaintenance;
      }

      const input = readPayload<
        Omit<ProvisionalReviewInspectInput, "sessionId" | "subjectRef"> & {
          subjectId?: string;
          subjectRef?: Ref;
        }
      >(payload);
      const { subjectId, subjectRef: inputSubjectRef, ...inspectInput } = input;
      const subjectRef = subjectId === undefined
        ? inputSubjectRef
        : reviewSubjectRef(subjectId);

      if (subjectRef === undefined) {
        return fail({
          code: "stage_interface.invalid_payload",
          message: "canonical.review.inspect requires subjectId.",
          module: "stage_interface",
          retryable: false,
        });
      }

      const result = await availableMaintenance.value.reviewInspect({
        ...inspectInput,
        subjectRef,
        sessionId,
      });

      return result.ok
        ? ok(compactReviewInspect(result.value, { knowledgeFactLimit: input.knowledgeFactLimit }))
        : result;
    },
  },
  {
    name: "canonical.review.apply",
    description: "Apply an inspected manual decision: update only when inspected facts establish the recording identity and version, or use cannot_confirm as a normal safe outcome with a short reason; do not pass v1 refs or citation fields.",
    inputSchemaRef: "ProvisionalReviewApplyInput",
    outputSchemaRef: "ProvisionalReviewApplyOutput",
    effectKind: "canonical_maintenance",
    availability: "requires_active_instrument",
    inputSchema: {
      inspectionId: z.string(),
      subjectId: z.string(),
      action: z.enum(["update", "cannot_confirm"]),
      selectedProviderRefToken: reviewRefTokenSchema.optional(),
      reason: z.string(),
    },
    async handler({ context, sessionId, payload }) {
      const availableMaintenance = readCanonicalMaintenance(context.canonicalMaintenance);

      if (!availableMaintenance.ok) {
        return availableMaintenance;
      }

      const input = readPayload<
        Omit<ProvisionalReviewApplyInput, "sessionId" | "subjectRef"> & {
          subjectId?: string;
          subjectRef?: Ref;
        }
      >(payload);
      const { subjectId, subjectRef: inputSubjectRef, ...applyInput } = input;
      const subjectRef = subjectId === undefined
        ? inputSubjectRef
        : reviewSubjectRef(subjectId);

      if (subjectRef === undefined) {
        return fail({
          code: "stage_interface.invalid_payload",
          message: "canonical.review.apply requires subjectId.",
          module: "stage_interface",
          retryable: false,
        });
      }

      const result = await availableMaintenance.value.reviewApply({
        ...applyInput,
        subjectRef,
        sessionId,
      } as ProvisionalReviewApplyInput);

      return result.ok ? ok(compactReviewApply(result.value)) : result;
    },
  },
  {
    name: "canonical.review.auto_update",
    description: "Automatically update only when Canonical Maintenance can strictly qualify exactly one inspected MusicBrainz recording identity.",
    inputSchemaRef: "ProvisionalReviewAutoUpdateInput",
    outputSchemaRef: "ProvisionalReviewAutoUpdateOutput",
    effectKind: "canonical_maintenance",
    availability: "requires_active_instrument",
    inputSchema: {
      subjectId: z.string().optional(),
      limit: z.number().int().positive().optional(),
      runId: z.string().optional(),
      includeCannotConfirm: z.boolean().optional(),
    },
    async handler({ context, sessionId, payload }) {
      const availableMaintenance = readCanonicalMaintenance(context.canonicalMaintenance);

      if (!availableMaintenance.ok) {
        return availableMaintenance;
      }

      const input = readPayload<
        Omit<ProvisionalReviewAutoUpdateInput, "sessionId" | "subjectRef"> & {
          subjectId?: string;
          subjectRef?: Ref;
        }
      >(payload);
      const { subjectId, subjectRef: inputSubjectRef, ...autoUpdateInput } = input;
      const subjectRef = subjectId === undefined
        ? inputSubjectRef
        : reviewSubjectRef(subjectId);
      const result = await availableMaintenance.value.reviewAutoUpdate({
        ...autoUpdateInput,
        ...(subjectRef === undefined ? {} : { subjectRef }),
        sessionId,
      } as ProvisionalReviewAutoUpdateInput);

      return result.ok ? ok(compactReviewAutoUpdate(result.value)) : result;
    },
  },
] satisfies readonly StageInterfaceToolDefinition<CanonicalReviewToolName, CanonicalReviewToolGroupContext>[];

export const canonicalReviewToolDescriptors = canonicalReviewToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: CanonicalReviewToolName }>;

export const canonicalReviewToolInputSchemas = Object.fromEntries(
  canonicalReviewToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<CanonicalReviewToolName, StageInterfaceToolInputSchema>;

function readCanonicalMaintenance(
  canonicalMaintenance: CanonicalMaintenancePort | undefined,
): Result<CanonicalMaintenancePort> {
  if (canonicalMaintenance === undefined) {
    return canonicalMaintenanceUnavailable();
  }

  return ok(canonicalMaintenance);
}

function canonicalMaintenanceUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Canonical Maintenance tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function readPayload<TPayload extends object>(payload: unknown): TPayload {
  return typeof payload === "object" && payload !== null ? (payload as TPayload) : ({} as TPayload);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
