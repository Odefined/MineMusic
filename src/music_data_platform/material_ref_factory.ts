import { randomUUID } from "node:crypto";

import {
  isRefComponentSafe,
  type MaterialEntityKind,
  type Ref,
} from "../contracts/index.js";
import { MusicDataPlatformError } from "./errors.js";

export type MaterialRefFactory = {
  createMaterialRef(kind: MaterialEntityKind): Ref;
};

export type CreateMaterialRefFactoryInput = {
  nextOpaqueId?: () => string;
};

export function createMaterialRefFactory(
  input: CreateMaterialRefFactoryInput = {},
): MaterialRefFactory {
  const nextOpaqueId = input.nextOpaqueId ?? defaultOpaqueId;

  return {
    createMaterialRef(kind) {
      const opaqueId = nextOpaqueId();
      const id = `m_${opaqueId}`;

      if (!isMaterialEntityKind(kind) || !isRefComponentSafe(id)) {
        throw new MusicDataPlatformError({
          code: "music_data.record_ref_key_mismatch",
          message: "Material ref factory produced an invalid material ref.",
        });
      }

      return {
        namespace: "material",
        kind,
        id,
      };
    },
  };
}

function defaultOpaqueId(): string {
  return randomUUID().replaceAll("-", "");
}

function isMaterialEntityKind(value: unknown): value is MaterialEntityKind {
  return value === "recording" ||
    value === "album" ||
    value === "artist" ||
    value === "work" ||
    value === "release";
}
