import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { createHash } from "node:crypto";
import type { MediaFileWriter } from "./download_to_file.js";
import type { LocalizeProviderSourceFileStore } from "./localize_provider_source_job.js";

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

export function createNodeLocalizeProviderSourceFileStore(): LocalizeProviderSourceFileStore {
  const writer = createNodeMediaFileWriter();

  return {
    ...writer,
    async md5(path) {
      const hash = createHash("md5");
      const stream = createReadStream(path);
      for await (const chunk of stream) {
        hash.update(chunk);
      }
      return hash.digest("hex");
    },
    move(fromPath, toPath) {
      renameSync(fromPath, toPath);
    },
  };
}
