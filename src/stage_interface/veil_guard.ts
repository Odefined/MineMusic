import type { JsonSchema } from "../contracts/stage_interface.js";

export const INTERNAL_ANCHOR_PROPERTY_NAMES = [
  "materialRef",
  "materialRefs",
  "materialRefKey",
  "materialCandidateRef",
  "materialCandidateRefs",
  "materialCandidateRefKey",
  "sourceRef",
  "sourceRefs",
  "canonicalRef",
  "canonicalRefs",
  "resultSetId",
  "providerEntityId",
  "provider_entity_id",
  "providerAccountId",
  "provider_account_id",
  "rawProviderKey",
  "raw_provider_key",
  "providerRawKey",
  "provider_raw_key",
] as const;

const internalAnchorPropertyNames = new Set<string>(INTERNAL_ANCHOR_PROPERTY_NAMES);

const internalAnchorStringPatterns = [
  /(?:^|[^A-Za-z0-9_])(?:material|material_candidate|canonical_[a-z0-9_]*|source_[a-z0-9_]*):[a-z][a-z0-9_]*:[^\s"']+/u,
  /(?:^|[^A-Za-z0-9_])rs_[0-9a-f][0-9a-f-]{7,}(?:$|[^A-Za-z0-9_-])/u,
  /(?:^|[^A-Za-z0-9_])provider_entity:[^\s"']+/u,
  /(?:^|[^A-Za-z0-9_])provider_account:[^\s"']+/u,
  /(?:^|[^A-Za-z0-9_])raw_provider_key:[^\s"']+/u,
] as const;

export type StageInterfaceVeilViolation = {
  path: string;
  reason: string;
};

export function findOutputSchemaVeilViolations(
  schema: JsonSchema,
): readonly StageInterfaceVeilViolation[] {
  const violations: StageInterfaceVeilViolation[] = [];

  scanSchemaNode(schema, "$", violations);

  return violations;
}

export function assertOutputSchemaHasNoInternalAnchors(input: {
  toolName: string;
  schema: JsonSchema;
}): void {
  const violations = findOutputSchemaVeilViolations(input.schema);

  if (violations.length > 0) {
    throw new Error(
      `Tool '${input.toolName}' outputSchema exposes internal anchor fields: ${formatViolations(violations)}.`,
    );
  }
}

export function findSampleOutputVeilViolations(
  output: unknown,
): readonly StageInterfaceVeilViolation[] {
  const violations: StageInterfaceVeilViolation[] = [];

  scanOutputNode(output, "$", violations);

  return violations;
}

export function assertSampleOutputHasNoInternalAnchors(input: {
  label: string;
  output: unknown;
}): void {
  const violations = findSampleOutputVeilViolations(input.output);

  if (violations.length > 0) {
    throw new Error(
      `Sample output '${input.label}' exposes internal anchors: ${formatViolations(violations)}.`,
    );
  }
}

export function textContainsInternalAnchor(value: string): boolean {
  return internalAnchorStringPatterns.some((pattern) => pattern.test(value));
}

export function freeTextContainsInternalAnchor(value: string): boolean {
  return textContainsInternalAnchor(value) ||
    INTERNAL_ANCHOR_PROPERTY_NAMES.some((propertyName) => value.includes(propertyName));
}

function scanSchemaNode(
  value: unknown,
  path: string,
  violations: StageInterfaceVeilViolation[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string" && internalAnchorPropertyNames.has(item)) {
        violations.push({
          path: `${path}[${index}]`,
          reason: `schema references banned property '${item}'`,
        });
      }

      scanSchemaNode(item, `${path}[${index}]`, violations);
    });
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (internalAnchorPropertyNames.has(key)) {
      violations.push({
        path: `${path}.${key}`,
        reason: `schema declares banned property '${key}'`,
      });
    }

    if (key === "properties" && isPlainObject(child)) {
      for (const propertyName of Object.keys(child)) {
        if (internalAnchorPropertyNames.has(propertyName)) {
          violations.push({
            path: `${path}.properties.${propertyName}`,
            reason: `output property '${propertyName}' is an internal anchor`,
          });
        }
      }
    }

    scanSchemaNode(child, `${path}.${key}`, violations);
  }
}

function scanOutputNode(
  value: unknown,
  path: string,
  violations: StageInterfaceVeilViolation[],
): void {
  if (typeof value === "string") {
    if (textContainsInternalAnchor(value)) {
      violations.push({
        path,
        reason: "string value looks like an internal anchor",
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanOutputNode(item, `${path}[${index}]`, violations);
    });
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (internalAnchorPropertyNames.has(key)) {
      violations.push({
        path: `${path}.${key}`,
        reason: `output key '${key}' is an internal anchor`,
      });
    }

    scanOutputNode(child, `${path}.${key}`, violations);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatViolations(violations: readonly StageInterfaceVeilViolation[]): string {
  return violations.map((violation) => `${violation.path} (${violation.reason})`).join("; ");
}
