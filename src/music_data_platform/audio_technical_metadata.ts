import type { AudioTechnicalMetadata } from "../contracts/music_data_platform.js";
import { MusicDataPlatformError } from "./errors.js";

// Audio-technical facts are optional Source-level descriptions of the concrete
// audio file behind a track Source (Phase 26 D12). They never participate in
// identity, binding, duplicate detection, or canonical matching. This module
// owns the single normalization boundary for those facts: when a numeric field
// is present it must be a finite positive number, and a fabricated zero/default
// is rejected rather than silently stored. String fields must be non-blank.
// Parser absence (undefined) is preserved as absence.

export function normalizeAudioTechnicalMetadata(
  input: AudioTechnicalMetadata | undefined,
): AudioTechnicalMetadata | undefined {
  if (input === undefined) {
    return undefined;
  }

  const result: AudioTechnicalMetadata = {};

  if (input.codec !== undefined) {
    const codec = input.codec.trim();
    if (codec.length === 0) {
      throw invalidAudioTechnicalMetadata("Audio technical codec must be a non-blank string.");
    }
    result.codec = codec;
  }

  setFinitePositive(result, "bitrateBps", input.bitrateBps, "bitrate (bps)");
  setFinitePositive(result, "sampleRateHz", input.sampleRateHz, "sample rate (Hz)");
  setFinitePositive(result, "bitDepth", input.bitDepth, "bit depth");
  setFinitePositive(result, "channels", input.channels, "channel count");

  // If every field was absent, normalize to undefined so callers cannot
  // distinguish "empty object" from "no technical facts".
  const hasAny = result.codec !== undefined
    || result.bitrateBps !== undefined
    || result.sampleRateHz !== undefined
    || result.bitDepth !== undefined
    || result.channels !== undefined;
  return hasAny ? result : undefined;
}

function setFinitePositive(
  target: AudioTechnicalMetadata,
  field: "bitrateBps" | "sampleRateHz" | "bitDepth" | "channels",
  value: number | undefined,
  label: string,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalidAudioTechnicalMetadata(
      `Audio technical ${label} must be a finite positive number when present.`,
    );
  }
  // Bit depth and channel count are integer facts; a fractional value is a
  // parser/adapter contract violation, not a real audio fact.
  if ((field === "bitDepth" || field === "channels") && !Number.isInteger(value)) {
    throw invalidAudioTechnicalMetadata(
      `Audio technical ${label} must be an integer when present.`,
    );
  }
  target[field] = value;
}

function invalidAudioTechnicalMetadata(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.local_source_ref_invalid",
    message,
  });
}
