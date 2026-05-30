import type { Result, SourceMaterial, SourceProvider } from "../contracts/index.js";

export function createFixtureSourceProvider(sourceMaterials: SourceMaterial[]): SourceProvider {
  return {
    id: "fixture-source",

    async search({ query }) {
      const limit = query.limit ?? sourceMaterials.length;
      const normalizedQuery = query.text?.toLocaleLowerCase();
      const matches =
        normalizedQuery === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              material.label.toLocaleLowerCase().includes("coding") ||
              normalizedQuery.includes("coding") ||
              normalizedQuery.includes("quiet"),
            );

      return ok(matches.slice(0, limit).map((material) => structuredClone(material)));
    },

    async getPlayableLinks({ material }) {
      return ok(structuredClone(material.playableLinks ?? []));
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
