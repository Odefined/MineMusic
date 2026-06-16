// Storage contract surface — persistence record shapes that wrap Music Data
// Platform entities. Storage reads DOWNWARD into music_data_platform; the
// contracts DAG guard forbids the reverse edge.

import type { Ref } from "./kernel.js";
import type {
  CanonicalEntity,
  MaterialEntity,
  SourceEntity,
  SourceEntityKind,
} from "./music_data_platform.js";

export type SourceRecord = {
  entity: SourceEntity;
  lookup: {
    providerId: string;
    providerEntityId: string;
    kind: SourceEntityKind;
  };
  createdAt: string;
  updatedAt: string;
};

export type MaterialRecord = {
  entity: MaterialEntity;
  mergedIntoMaterialRef?: Ref;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalRecordStatus =
  | "active"
  | "provisional"
  | "merged"
  | "archived";

export type CanonicalRecord = {
  entity: CanonicalEntity;
  status: CanonicalRecordStatus;
  mergedIntoCanonicalRef?: Ref;
  factsJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
