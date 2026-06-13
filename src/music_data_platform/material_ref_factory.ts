import { randomUUID } from "node:crypto";

import {
  type MaterialEntityKind,
  type Ref,
} from "../contracts/index.js";
import { assertMaterialRef } from "./material_ref.js";

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
      const materialRef = {
        namespace: "material",
        kind,
        id: `m_${nextOpaqueId()}`,
      };

      assertMaterialRef(materialRef);
      return materialRef;
    },
  };
}

function defaultOpaqueId(): string {
  return randomUUID().replaceAll("-", "");
}
