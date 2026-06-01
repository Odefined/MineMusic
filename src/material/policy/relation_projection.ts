import type {
  MaterialPolicyDropCode,
  MusicMaterial,
  MusicMaterialRelation,
  Ref,
} from "../../contracts/index.js";

export type MaterialRelationProjection =
  | {
      decision: "allow" | "degrade";
      material: MusicMaterial;
      warnings: string[];
    }
  | {
      decision: "drop";
      code: MaterialPolicyDropCode;
      reason: string;
    };

export type MaterialRelationProjectionInput = {
  material: MusicMaterial;
  relations: MusicMaterialRelation[];
  shouldApplyRelation: (relation: MusicMaterialRelation) => boolean;
  materialBlockedBehavior: "ignore" | "mark" | "drop";
  dropWhenNotPlayableLeavesNoLinks: boolean;
  dropWhenSourceRemovedToEmpty: boolean;
};

export function projectMaterialRelations({
  material,
  relations,
  shouldApplyRelation,
  materialBlockedBehavior,
  dropWhenNotPlayableLeavesNoLinks,
  dropWhenSourceRemovedToEmpty,
}: MaterialRelationProjectionInput): MaterialRelationProjection {
  let next = material;
  const warnings: string[] = [];

  for (const relation of relations) {
    if (!shouldApplyRelation(relation)) {
      continue;
    }

    if (relation.scope.level === "material") {
      if (relation.relationKind === "blocked") {
        if (materialBlockedBehavior === "drop") {
          return drop("blocked", "Material has an active blocked relation.");
        }

        if (materialBlockedBehavior === "mark") {
          next = { ...next, state: "blocked" };
        }
      }

      if (relation.relationKind === "bad_match") {
        return drop("bad_match", "Material has an active bad-match relation.");
      }

      continue;
    }

    if (relation.scope.level !== "source" || !hasSourceRef(next, relation.scope.sourceRef)) {
      continue;
    }

    if (relation.relationKind === "not_playable") {
      next = removePlayableLinksForSource(next, relation.scope.sourceRef);
      warnings.push("not_playable");

      if ((next.playableLinks?.length ?? 0) === 0 && dropWhenNotPlayableLeavesNoLinks) {
        return drop("not_playable", "The only known source link is marked not playable.");
      }

      continue;
    }

    if (relation.relationKind === "wrong_version" || relation.relationKind === "blocked") {
      next = removeSourceFromMaterial(next, relation.scope.sourceRef);
      const code: MaterialPolicyDropCode = relation.relationKind === "wrong_version" ? "wrong_version" : "blocked";
      warnings.push(code);

      if (
        dropWhenSourceRemovedToEmpty &&
        (next.sourceRefs?.length ?? 0) === 0 &&
        (next.playableLinks?.length ?? 0) === 0
      ) {
        return drop(code, `Material source is marked ${relation.relationKind}.`);
      }

      continue;
    }

    if (relation.relationKind === "bad_match") {
      return drop("bad_match", "Material source has an active bad-match relation.");
    }
  }

  return {
    decision: warnings.length === 0 ? "allow" : "degrade",
    material: next,
    warnings,
  };
}

function removePlayableLinksForSource(material: MusicMaterial, sourceRef: Ref): MusicMaterial {
  const playableLinks = (material.playableLinks ?? []).filter((link) => !sameRef(link.sourceRef, sourceRef));
  const state =
    playableLinks.length === 0 &&
    (material.state === "source_only_playable" || material.state === "confirmed_playable")
      ? "grounded"
      : material.state;

  return {
    ...material,
    state,
    ...(playableLinks.length === 0 ? { playableLinks: [] } : { playableLinks }),
  };
}

function removeSourceFromMaterial(material: MusicMaterial, sourceRef: Ref): MusicMaterial {
  const sourceRefs = (material.sourceRefs ?? []).filter((candidate) => !sameRef(candidate, sourceRef));
  const playableLinks = (material.playableLinks ?? []).filter((link) => !sameRef(link.sourceRef, sourceRef));
  const state =
    playableLinks.length === 0 &&
    (material.state === "source_only_playable" || material.state === "confirmed_playable")
      ? "grounded"
      : material.state;

  return {
    ...material,
    state,
    sourceRefs,
    playableLinks,
  };
}

function hasSourceRef(material: MusicMaterial, sourceRef: Ref): boolean {
  return (material.sourceRefs ?? []).some((candidate) => sameRef(candidate, sourceRef)) ||
    (material.playableLinks ?? []).some((link) => sameRef(link.sourceRef, sourceRef));
}

function drop(code: MaterialPolicyDropCode, reason: string): MaterialRelationProjection {
  return { decision: "drop", code, reason };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}
