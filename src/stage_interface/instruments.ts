import type { Result } from "../contracts/index.js";
import type { InstrumentCatalogPort } from "../ports/index.js";
import { handbookToolDescriptors, mvpToolDescriptors } from "./tools.js";

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

      if (
        session.activeInstruments.length === 0 ||
        session.activeInstruments.includes("minemusic.mvp")
      ) {
        instruments.push({
          id: "minemusic.mvp",
          label: "MineMusic MVP",
          tools: mvpToolDescriptors,
        });
      }

      return ok(instruments);
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
