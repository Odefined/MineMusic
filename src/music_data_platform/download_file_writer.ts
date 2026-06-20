import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import type { MediaFileWriter } from "./download_to_file.js";

// Production MediaFileWriter over node:fs. Writes stream asynchronously
// (createWriteStream + backpressure via 'drain') so a large download never
// blocks the event loop the way writeFileSync would. Tests inject an in-memory
// sink instead of touching the real filesystem.
export function createNodeMediaFileWriter(): MediaFileWriter {
  return {
    exists(path) {
      return existsSync(path);
    },
    ensureDir(dir) {
      mkdirSync(dir, { recursive: true });
    },
    remove(path) {
      rmSync(path, { force: true });
    },
    openSink(path) {
      const stream = createWriteStream(path);
      let closed = false;

      return {
        async append(chunk) {
          if (closed) {
            return;
          }
          if (!stream.write(chunk)) {
            await once(stream, "drain");
          }
        },
        async close() {
          if (closed) {
            return;
          }
          closed = true;
          stream.end();
          await finished(stream);
        },
      };
    },
  };
}
