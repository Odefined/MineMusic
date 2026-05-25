import type { Result } from "../contracts/index.js";
import type { InstrumentCatalogPort } from "../ports/index.js";
import {
  handbookToolDescriptors,
  libraryToolDescriptors,
  memoryToolDescriptors,
  musicToolDescriptors,
  stageToolDescriptors,
} from "./tools.js";

export function createInstrumentCatalog(): InstrumentCatalogPort {
  return {
    async list({ session }) {
      const instruments = [
        {
          id: "minemusic.handbook",
          label: "MineMusic Handbook",
          tools: handbookToolDescriptors,
        },
      ];
      const domainInstruments = [
        {
          id: "minemusic.stage",
          label: "MineMusic Stage",
          tools: stageToolDescriptors,
        },
        {
          id: "minemusic.music",
          label: "MineMusic Music",
          tools: musicToolDescriptors,
        },
        {
          id: "minemusic.library",
          label: "MineMusic Library",
          tools: libraryToolDescriptors,
        },
        {
          id: "minemusic.memory",
          label: "MineMusic Memory",
          tools: memoryToolDescriptors,
        },
      ];
      const activeDomainInstruments =
        session.activeInstruments.length === 0
          ? domainInstruments
          : domainInstruments.filter((instrument) => session.activeInstruments.includes(instrument.id));

      instruments.push(...activeDomainInstruments);

      return ok(instruments);
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
