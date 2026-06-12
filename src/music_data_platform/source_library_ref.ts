import { createHash } from "node:crypto";

import {
  assertRefSafe,
  isRefComponentSafe,
  type PlatformLibraryKind,
  type Ref,
} from "../contracts/index.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";

export type CreateSourceLibraryRefInput = {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryKind;
};

export function createSourceLibraryRef(input: CreateSourceLibraryRefInput): Ref {
  assertOwnerScope(input.ownerScope);
  assertSafeId(input.providerId, "Provider id");
  assertSafeId(input.providerAccountId, "Provider account id");
  assertPlatformLibraryKind(input.libraryKind);

  const digest = createHash("sha256")
    .update([
      input.ownerScope,
      input.providerId,
      input.providerAccountId,
      input.libraryKind,
    ].join("\u0000"))
    .digest("hex")
    .slice(0, 24);

  const libraryRef = {
    namespace: "source_library",
    kind: input.libraryKind,
    id: `l_${digest}`,
  } satisfies Ref;

  assertRefSafe(libraryRef);
  return libraryRef;
}

export function assertSourceLibraryRef(ref: Ref): void {
  assertRefSafe(ref);

  if (ref.namespace !== "source_library") {
    throw invalidSourceLibraryRef("Source library ref namespace must be 'source_library'.");
  }

  assertPlatformLibraryKind(ref.kind);

  if (!ref.id.startsWith("l_") || !isRefComponentSafe(ref.id)) {
    throw invalidSourceLibraryRef("Source library ref id must be ref-safe and start with 'l_'.");
  }
}

function assertPlatformLibraryKind(value: string): asserts value is PlatformLibraryKind {
  if (
    value !== "saved_source_track" &&
    value !== "saved_source_album" &&
    value !== "followed_source_artist"
  ) {
    throw invalidSourceLibraryRef("Source library ref kind is not a supported PlatformLibraryKind.");
  }
}

function assertSafeId(value: string, field: string): void {
  if (!isRefComponentSafe(value)) {
    throw invalidSourceLibraryRef(`${field} must be a non-empty ref-safe string.`);
  }
}

function invalidSourceLibraryRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.source_library_ref_invalid",
    message,
  });
}
