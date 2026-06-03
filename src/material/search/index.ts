import type {
  MaterialSearchOutput,
  Result,
  StageError,
} from "../../contracts/index.js";
import type {
  MaterialSearchCollectionPort,
  MaterialSearchPort,
  MaterialSearchStorePort,
} from "../../ports/index.js";

export type MaterialSearchServiceOptions = {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
};

export function createMaterialSearchService(
  options: MaterialSearchServiceOptions,
): MaterialSearchPort {
  void options;

  return {
    async search(): Promise<Result<MaterialSearchOutput>> {
      return fail({
        code: "material_search.invalid_scope",
        message: "Material Search is not wired yet.",
        module: "material_search",
        retryable: false,
      });
    },
  };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
