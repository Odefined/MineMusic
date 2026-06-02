import type { SourceMaterial } from "../contracts/index.js";

export function sourceKindToMaterialKind(kind: "track" | "release" | "artist"): string {
  switch (kind) {
    case "track":
      return "recording";
    case "release":
      return "release";
    case "artist":
      return "artist";
  }
}

export function materialKindForMaterial(material: SourceMaterial): string {
  if (material.kind === "track" || material.kind === "song") {
    return "recording";
  }

  if (material.kind === "album") {
    return "release_group";
  }

  return material.kind;
}
