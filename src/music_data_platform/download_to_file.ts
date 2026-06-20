import { createHash } from "node:crypto";

import type { DownloadSource } from "../contracts/music_data_platform.js";

// Asynchronous, backpressured write sink. Streaming the body chunk-by-chunk
// keeps large downloads from blocking the event loop or buffering the whole
// file in memory.
export type MediaFileSink = {
  append(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

// Narrow filesystem write port. Production wraps node:fs streams; tests inject
// an in-memory sink. Download helpers never touch the filesystem directly.
export type MediaFileWriter = {
  exists(path: string): boolean;
  ensureDir(dir: string): void;
  remove(path: string): void;
  openSink(path: string): MediaFileSink;
};

export type DownloadToFileInput = {
  source: DownloadSource;
  outputPath: string;
  fetch: typeof fetch;
  fileWriter: MediaFileWriter;
};

export type DownloadToFileResult =
  | {
    ok: true;
    bytesDownloaded: number;
    actualMd5: string;
  }
  | {
    ok: false;
    errorCode: string;
    errorMessage: string;
  };

export async function downloadToFile(input: DownloadToFileInput): Promise<DownloadToFileResult> {
  let sink: MediaFileSink | undefined;

  try {
    const response = await input.fetch(input.source.url);

    if (!response.ok) {
      return failed("music_data.download_http_failed", `Download HTTP ${response.status}.`);
    }

    if (response.body === null) {
      return failed("music_data.download_http_failed", "Download response had no body.");
    }

    sink = input.fileWriter.openSink(input.outputPath);
    const hash = createHash("md5");
    let bytes = 0;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const buffer = value instanceof Uint8Array ? value : new Uint8Array(value);
        await sink.append(buffer);
        hash.update(buffer);
        bytes += buffer.length;
      }
    } finally {
      reader.releaseLock();
    }

    await sink.close();
    sink = undefined;

    const actualMd5 = hash.digest("hex");

    if (input.source.sizeBytes !== undefined && bytes !== input.source.sizeBytes) {
      input.fileWriter.remove(input.outputPath);
      return failed("music_data.download_size_mismatch", `Expected ${input.source.sizeBytes} bytes but received ${bytes}.`);
    }

    if (input.source.md5 !== undefined && actualMd5 !== input.source.md5) {
      input.fileWriter.remove(input.outputPath);
      return failed("music_data.download_integrity_failed", `md5 ${actualMd5} does not match provider ${input.source.md5}.`);
    }

    return {
      ok: true,
      bytesDownloaded: bytes,
      actualMd5,
    };
  } catch (cause) {
    if (sink !== undefined) {
      await sink.close().catch(() => {
        // best-effort close at the filesystem/network adapter boundary
      });
    }

    try {
      input.fileWriter.remove(input.outputPath);
    } catch {
      // best-effort cleanup of a partial file at the filesystem boundary
    }

    return failed(
      "music_data.download_fetch_failed",
      `Download fetch or write failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function failed(errorCode: string, errorMessage: string): DownloadToFileResult {
  return {
    ok: false,
    errorCode,
    errorMessage,
  };
}
