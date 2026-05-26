import type { KnowledgeProvider, KnowledgeRelation, Result } from "../../src/contracts/index.js";
import {
  createMusicBrainzKnowledgeProvider,
  type MusicBrainzRequester,
} from "../../src/providers/musicbrainz/index.js";
import { createInMemoryProviderHttpCacheRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

function relationHasEndpoint(relation: KnowledgeRelation, nodeId: string, role?: string): boolean {
  return relation.endpoints.some((endpoint) =>
    endpoint.nodeId === nodeId && (role === undefined || endpoint.role === role)
  );
}

async function searchesRecordingsAsStructuredKnowledge(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider: KnowledgeProvider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);
      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "recording-mbid-1",
                title: "Intro",
                disambiguation: "album version",
                length: 127000,
                score: 98,
                isrcs: ["GBDUW0000059"],
                "artist-credit": [
                  {
                    name: "The xx",
                    artist: {
                      id: "artist-mbid-1",
                      name: "The xx",
                      "sort-name": "xx, The",
                    },
                  },
                ],
                genres: [{ id: "genre-1", name: "indie pop", count: 2 }],
                tags: [{ name: "minimal", count: 1 }],
                rating: { value: 4.2, "votes-count": 12 },
              },
            ],
          },
        },
      };
    },
  });

  assert(provider.id === "musicbrainz", "provider id should be stable");
  assert(provider.descriptor?.slot === "knowledge", "provider descriptor should register in knowledge slot");
  assert(provider.descriptor?.knowledge?.formats?.[0] === "structured", "descriptor should describe structured knowledge");
  assert(
    provider.descriptor?.knowledge?.relationFocuses?.includes("members") === true,
    "descriptor should advertise supported relation focus values",
  );

  const result = await assertOk(provider.query({ query: { text: "Intro The xx", limit: 1 } }));
  const item = result.items[0];
  const root = item?.kind === "structured" ? item.nodes.find((node) => node.id === item.rootNodeId) : undefined;

  assert(requests[0]?.path === "/ws/2/recording", "default text search should use recording search");
  assert(requests[0]?.query.query === "Intro The xx", "search should pass text query");
  assert(requests[0]?.query.limit === "1", "search should pass requested limit");
  assert(item?.kind === "structured", "MusicBrainz search should return structured knowledge");
  assert(item.providerId === "musicbrainz", "knowledge item should keep provider attribution");
  assert(item.retrievalScore === 98, "search score should become retrievalScore");
  assert(root?.ref?.id === "recording-mbid-1", "root node should carry MusicBrainz recording MBID");
  assert(root?.properties?.durationMs === 127000, "recording length should map to durationMs");
  assert(root?.properties?.artistCreditText === "The xx", "artist credit text should be preserved");
  assert((root?.properties?.isrcs as string[] | undefined)?.[0] === "GBDUW0000059", "ISRCs should be preserved");
  assert((root?.properties?.genres as Array<{ name: string }> | undefined)?.[0]?.name === "indie pop", "genres should be preserved");
  assert((root?.properties?.tags as Array<{ name: string }> | undefined)?.[0]?.name === "minimal", "tags should be preserved");
  assert((root?.properties?.rating as { value?: number } | undefined)?.value === 4.2, "rating should be preserved");
  assert(
    item.relations.some((relation) => relation.type === "artist_credit" && relation.properties?.creditedName === "The xx"),
    "artist credit should be represented as a structured relation",
  );
}

async function searchesRequestedEntityKinds(): Promise<void> {
  const paths: string[] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async ({ path }) => {
      paths.push(path);

      if (path === "/ws/2/artist") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              artists: [
                {
                  id: "artist-mbid-1",
                  name: "The xx",
                  "sort-name": "xx, The",
                  type: "Group",
                  country: "GB",
                  score: 97,
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            works: [
              {
                id: "work-mbid-1",
                title: "Intro",
                type: "Song",
                iswcs: ["T-000.000.001-0"],
                score: 91,
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "The xx Intro",
        entityKinds: ["artist", "work"],
        limit: 2,
      },
    }),
  );

  assert(paths.join(",") === "/ws/2/artist,/ws/2/work", "provider should search requested entity kinds");
  assert(result.items.length === 2, "provider should return one item per search hit");
  assert(result.items[0]?.kind === "structured", "artist hit should be structured");
  assert(result.items[0]?.nodes[0]?.type === "artist", "artist hit root should be artist");
  assert(result.items[1]?.kind === "structured", "work hit should be structured");
  assert(result.items[1]?.nodes[0]?.type === "work", "work hit root should be work");
}

async function searchesLabelsAsStructuredKnowledge(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            labels: [
              {
                id: "label-mbid-1",
                name: "Young",
                disambiguation: "UK independent label",
                type: "Original Production",
                country: "GB",
                score: 94,
                genres: [{ name: "indie pop", count: 2 }],
                tags: [{ name: "independent", count: 4 }],
                rating: { value: 4.1, "votes-count": 9 },
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "Young",
        entityKinds: ["label"],
        limit: 1,
      },
    }),
  );
  const item = result.items[0];
  const root = item?.kind === "structured" ? item.nodes.find((node) => node.id === item.rootNodeId) : undefined;

  assert(
    provider.descriptor?.knowledge?.entityKinds?.includes("label") === true,
    "descriptor should advertise label knowledge roots",
  );
  assert(requests[0]?.path === "/ws/2/label", "label text search should use label search");
  assert(item?.kind === "structured", "label hit should be structured");
  assert(root?.type === "label", "label hit root should be label");
  assert(root?.ref?.id === "label-mbid-1", "label root should carry MusicBrainz label MBID");
  assert(root?.properties?.country === "GB", "label country should be preserved");
  assert((root?.properties?.tags as Array<{ name: string }> | undefined)?.[0]?.name === "independent", "label tags should be preserved");
  assert(item.retrievalScore === 94, "label search score should become retrievalScore");
}

async function filtersRootItemsByReturnedTagsAndGenres(): Promise<void> {
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        status: 200,
        json: {
          recordings: [
            {
              id: "matching-recording",
              title: "Matching",
              score: 80,
              genres: [{ name: "Ambient" }],
              tags: [{ name: "Shoegaze" }],
            },
            {
              id: "excluded-recording",
              title: "Excluded",
              score: 99,
              genres: [{ name: "Ambient" }],
              tags: [{ name: "New Age" }],
            },
            {
              id: "untagged-recording",
              title: "Untagged",
              score: 70,
            },
          ],
        },
      },
    }),
  });

  const includeAndExclude = await assertOk(
    provider.query({
      query: {
        text: "ambient",
        filters: {
          tags: {
            include: [" ambient ", "shoegaze"],
            exclude: ["new age"],
          },
        },
      },
    }),
  );
  const excludeOnly = await assertOk(
    provider.query({
      query: {
        text: "ambient",
        filters: {
          tags: {
            exclude: ["new age"],
          },
        },
      },
    }),
  );

  assert(includeAndExclude.items.length === 1, "include tags should require every requested root tag");
  assert(
    includeAndExclude.items[0]?.kind === "structured"
    && includeAndExclude.items[0].rootNodeId === "recording:matching-recording",
    "genres should count as tag matches and excluded tags should remove roots",
  );
  assert(
    excludeOnly.items.some((item) => item.kind === "structured" && item.rootNodeId === "recording:untagged-recording"),
    "roots without tags should not fail exclude-only filters",
  );
  assert(
    !excludeOnly.items.some((item) => item.kind === "structured" && item.rootNodeId === "recording:excluded-recording"),
    "exclude filters should remove roots carrying excluded tags",
  );
}

async function searchesTagQueryAndRanksMatchesAcrossKinds(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      if (request.path === "/ws/2/artist") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              artists: [
                {
                  id: "artist-mbid-1",
                  name: "Tag Artist",
                  score: 40,
                  genres: [{ name: "Ambient" }],
                  tags: [{ name: "Post-Rock" }],
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "recording-mbid-1",
                title: "One Tag Recording",
                score: 99,
                tags: [{ name: "Ambient" }],
              },
              {
                id: "recording-mbid-2",
                title: "No Match Recording",
                score: 100,
                tags: [{ name: "New Age" }],
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        tagQuery: [" Ambient ", "post-rock"],
        entityKinds: ["recording", "artist"],
        limit: 2,
      },
    }),
  );

  const firstMetadata = result.items[0]?.kind === "structured" ? result.items[0].metadata : undefined;
  const secondMetadata = result.items[1]?.kind === "structured" ? result.items[1].metadata : undefined;

  assert(requests.map((request) => request.path).join(",") === "/ws/2/recording,/ws/2/artist", "tag query should search requested entity kinds");
  assert(
    requests.every((request) => request.query.query === 'tag:"ambient" OR tag:"post-rock"'),
    "tag query should build MusicBrainz tag clauses without exposing them publicly",
  );
  assert(result.items.length === 2, "tag query should return matching roots up to the global limit");
  assert(
    result.items[0]?.kind === "structured"
    && result.items[0].rootNodeId === "artist:artist-mbid-1",
    "items with more matched tags should rank before higher-score one-tag matches",
  );
  assert((firstMetadata?.matchedTags as string[] | undefined)?.join(",") === "ambient,post-rock", "metadata should list matched query tags");
  assert(firstMetadata?.matchedTagCount === 2, "metadata should count matched query tags");
  assert(
    result.items[1]?.kind === "structured"
    && result.items[1].rootNodeId === "recording:recording-mbid-1",
    "one-tag recording should remain after nonmatching roots are removed",
  );
  assert(secondMetadata?.matchedTagCount === 1, "one-tag match should keep its matched count");
}

async function appliesTagQueryFiltersToReturnedRootFacts(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "matching-recording",
                title: "Matching",
                score: 70,
                genres: [{ name: "Ambient" }],
                tags: [{ name: "Shoegaze" }],
              },
              {
                id: "excluded-recording",
                title: "Excluded",
                score: 99,
                genres: [{ name: "Ambient" }],
                tags: [{ name: "Shoegaze" }, { name: "New Age" }],
              },
              {
                id: "missing-include-recording",
                title: "Missing Include",
                score: 90,
                genres: [{ name: "Ambient" }],
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        tagQuery: ["ambient"],
        filters: {
          tags: {
            include: ["shoegaze"],
            exclude: ["new age"],
          },
        },
        limit: 5,
      },
    }),
  );

  assert(requests[0]?.path === "/ws/2/recording", "tag query should default to recording search");
  assert(result.items.length === 1, "tag query filters should narrow returned root facts");
  assert(
    result.items[0]?.kind === "structured"
    && result.items[0].rootNodeId === "recording:matching-recording",
    "include and exclude filters should be applied after provider facts are returned",
  );
}

async function buildsFieldQueriesForRequestedEntityKinds(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            artists: [],
            labels: [],
            recordings: [],
            releases: [],
            "release-groups": [],
            works: [],
          },
        },
      };
    },
  });

  await assertOk(
    provider.query({
      query: {
        fieldQuery: {
          title: "Sacred Play Secret Place",
          artist: "matryoshka",
          release: "Laideronnette",
          label: "Virgin Babylon",
          date: "2012",
          country: "jp",
          barcode: "1234567890123",
          catalogNumber: "VBR-001",
          type: "Album",
        },
        entityKinds: ["recording", "release", "release_group", "artist", "work", "label"],
        limit: 3,
      },
    }),
  );

  const queriesByPath = new Map(requests.map((request) => [request.path, request.query.query]));

  assert(
    queriesByPath.get("/ws/2/recording")
      === 'recording:"Sacred Play Secret Place" AND artist:"matryoshka" AND release:"Laideronnette" AND date:"2012" AND country:"JP"',
    "recording field query should map title, artist, release, date, and country",
  );
  assert(
    queriesByPath.get("/ws/2/release")
      === 'release:"Sacred Play Secret Place" AND artist:"matryoshka" AND label:"Virgin Babylon" AND date:"2012" AND country:"JP" AND barcode:"1234567890123" AND catno:"VBR-001" AND type:"Album"',
    "release field query should map release, label, barcode, catalog number, country, date, artist, and type",
  );
  assert(
    queriesByPath.get("/ws/2/release-group")
      === 'releasegroup:"Sacred Play Secret Place" AND artist:"matryoshka" AND firstreleasedate:"2012" AND primarytype:"Album"',
    "release-group field query should map title, artist, first release date, and primary type",
  );
  assert(
    queriesByPath.get("/ws/2/artist") === 'artist:"Sacred Play Secret Place" AND country:"JP" AND type:"Album"',
    "artist field query should map title, country, and artist type",
  );
  assert(
    queriesByPath.get("/ws/2/work") === 'work:"Sacred Play Secret Place" AND artist:"matryoshka" AND type:"Album"',
    "work field query should map title, artist, and work type",
  );
  assert(
    queriesByPath.get("/ws/2/label") === 'label:"Sacred Play Secret Place" AND country:"JP" AND type:"Album"',
    "label field query should map title, country, and label type",
  );
}

async function fieldQueryLooksUpMissingTagsBeforeFiltering(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      if (request.path === "/ws/2/recording/recording-mbid-1") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              id: "recording-mbid-1",
              title: "Sacred Play Secret Place",
              genres: [{ name: "Ambient" }],
              tags: [{ name: "Glitch" }],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "recording-mbid-1",
                title: "Sacred Play Secret Place",
                score: 92,
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        fieldQuery: {
          artist: "matryoshka",
          release: "Laideronnette",
        },
        filters: {
          tags: {
            include: ["ambient"],
          },
        },
        limit: 1,
      },
    }),
  );

  assert(requests[0]?.path === "/ws/2/recording", "field query should default to recording search");
  assert(
    requests[0]?.query.query === 'artist:"matryoshka" AND release:"Laideronnette"',
    "recording fieldQuery.release should remain a release-style search condition",
  );
  assert(requests[1]?.path === "/ws/2/recording/recording-mbid-1", "field query filters should trigger lookup when tags are missing");
  assert(result.items.length === 1, "lookup-provided tags should allow field query results through filters");
  assert(
    result.items[0]?.kind === "structured"
    && result.items[0].rootNodeId === "recording:recording-mbid-1",
    "field query should return the looked-up root after tag filtering",
  );
}

async function searchesReleasesAndReleaseGroupsAsStructuredKnowledge(): Promise<void> {
  const paths: string[] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async ({ path }) => {
      paths.push(path);

      if (path === "/ws/2/release") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              releases: [
                {
                  id: "release-mbid-1",
                  title: "xx",
                  date: "2009-08-14",
                  country: "GB",
                  status: "Official",
                  barcode: "634904031923",
                  score: 96,
                  "artist-credit": [
                    {
                      name: "Romy",
                      joinphrase: " & ",
                      artist: { id: "artist-mbid-1", name: "Romy" },
                    },
                    {
                      name: "Oliver",
                      artist: { id: "artist-mbid-2", name: "Oliver" },
                    },
                  ],
                  "release-group": {
                    id: "release-group-mbid-1",
                    title: "xx",
                    "primary-type": "Album",
                  },
                  "label-info": [
                    {
                      "catalog-number": "YT031",
                      label: {
                        id: "label-mbid-1",
                        name: "Young Turks",
                      },
                    },
                  ],
                  genres: [{ name: "indie pop", count: 2 }],
                  tags: [{ name: "minimal", count: 1 }],
                  rating: { value: 4.4, "votes-count": 8 },
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            "release-groups": [
              {
                id: "release-group-mbid-1",
                title: "xx",
                "primary-type": "Album",
                "secondary-types": ["Compilation"],
                "first-release-date": "2009-08-14",
                score: 95,
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "xx The xx",
        entityKinds: ["release", "release_group"],
        limit: 1,
      },
    }),
  );

  const release = result.items[0];
  const releaseGroup = result.items[1];
  const releaseRoot = release?.kind === "structured" ? release.nodes.find((node) => node.id === release.rootNodeId) : undefined;

  assert(paths.join(",") === "/ws/2/release,/ws/2/release-group", "provider should search release and release-group endpoints");
  assert(release?.kind === "structured", "release hit should be structured");
  assert(releaseRoot?.type === "release", "release hit root should be release");
  assert(releaseRoot.properties?.barcode === "634904031923", "release barcode should be preserved");
  assert(releaseRoot.properties?.artistCreditText === "Romy & Oliver", "artist credit text should preserve join phrases");
  assert(
    release.nodes.some((node) => node.type === "label" && node.ref?.id === "label-mbid-1"),
    "release label should be represented as a label node",
  );
  assert(
    release.relations.some((relation) => relation.type === "published_by_label" && relation.properties?.catalogNumber === "YT031"),
    "release label catalog number should be represented on the label relation",
  );
  assert(
    release.relations.some((relation) =>
      relation.type === "part_of_release_group"
      && relationHasEndpoint(relation, "release_group:release-group-mbid-1", "release_group")
    ),
    "release should link to its release group",
  );
  assert(releaseGroup?.kind === "structured", "release group hit should be structured");
  assert(releaseGroup.nodes[0]?.type === "release_group", "release group hit root should be release_group");
  assert(releaseGroup.nodes[0]?.properties?.primaryType === "Album", "release group primary type should be preserved");
}

async function looksUpMusicBrainzRefFromCanonicalContext(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "release-mbid-1",
            title: "xx",
            barcode: "634904031923",
            "release-group": {
              id: "release-group-mbid-1",
              title: "xx",
            },
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "minemusic", kind: "release", id: "canonical-release-1" },
      },
      canonicalContext: {
        record: {
          ref: { namespace: "minemusic", kind: "release", id: "canonical-release-1" },
          kind: "release",
          label: "xx",
          status: "active",
          sourceRefs: [
            {
              namespace: "musicbrainz",
              kind: "release",
              id: "release-mbid-1",
              label: "xx",
            },
          ],
        },
        relations: [],
      },
    }),
  );

  const item = result.items[0];
  const root = item?.kind === "structured" ? item.nodes.find((node) => node.id === item.rootNodeId) : undefined;

  assert(requests.length === 1, "MusicBrainz ref lookup should make one request");
  assert(requests[0]?.path === "/ws/2/release/release-mbid-1", "provider should look up the MusicBrainz release ref");
  assert(requests[0]?.query.inc?.includes("labels"), "release lookup should request labels");
  assert(requests[0]?.query.inc?.includes("release-groups"), "release lookup should request release group data");
  assert(root?.type === "release", "lookup root should be a release");
  assert(root?.properties?.barcode === "634904031923", "lookup should map release details");
}

async function browsesReleasesForReleaseGroupExpansion(): Promise<void> {
  const paths: string[] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async ({ path }) => {
      paths.push(path);

      if (path === "/ws/2/release-group/release-group-mbid-1") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              id: "release-group-mbid-1",
              title: "xx",
              "primary-type": "Album",
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            releases: [
              {
                id: "release-mbid-1",
                title: "xx",
                status: "Official",
              },
            ],
            "release-count": 1,
            "release-offset": 0,
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "minemusic", kind: "release_group", id: "canonical-release-group-1" },
        expand: ["releases"],
        limit: 1,
      },
      canonicalContext: {
        record: {
          ref: { namespace: "minemusic", kind: "release_group", id: "canonical-release-group-1" },
          kind: "release_group",
          label: "xx",
          status: "active",
          sourceRefs: [
            {
              namespace: "musicbrainz",
              kind: "release_group",
              id: "release-group-mbid-1",
              label: "xx",
            },
          ],
        },
        relations: [],
      },
    }),
  );

  assert(
    paths.join(",") === "/ws/2/release-group/release-group-mbid-1,/ws/2/release",
    "release-group releases expansion should lookup the root then browse releases",
  );
  assert(result.items[0]?.kind === "structured", "lookup item should be structured");
  assert(result.items[1]?.kind === "structured", "browse release item should be structured");
  assert(result.items[1]?.nodes[0]?.type === "release", "browse release item root should be release");
}

async function browsesReleaseGroupsForArtistExpansion(): Promise<void> {
  const paths: string[] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async ({ path }) => {
      paths.push(path);

      if (path === "/ws/2/artist/artist-mbid-1") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              id: "artist-mbid-1",
              name: "The xx",
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            "release-groups": [
              {
                id: "release-group-mbid-1",
                title: "xx",
                "primary-type": "Album",
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "artist-mbid-1" },
        expand: ["release_groups"],
        limit: 1,
      },
    }),
  );

  assert(paths.join(",") === "/ws/2/artist/artist-mbid-1,/ws/2/release-group", "artist release-groups expansion should lookup artist then browse release-groups");
  assert(result.items[0]?.kind === "structured", "artist lookup item should be structured");
  assert(result.items[1]?.kind === "structured", "release-group browse item should be structured");
  assert(result.items[1]?.nodes[0]?.type === "release_group", "browse root should be release_group");
}

async function mapsReleaseTracklistExpansion(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "release-mbid-1",
            title: "xx",
            media: [
              {
                position: 1,
                format: "Digital Media",
                "track-count": 1,
                tracks: [
                  {
                    id: "track-mbid-1",
                    position: 1,
                    number: "1",
                    title: "Intro",
                    length: 127000,
                    recording: {
                      id: "recording-mbid-1",
                      title: "Intro",
                      length: 127000,
                      isrcs: ["GBDUW0000059"],
                    },
                  },
                ],
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "musicbrainz", kind: "release", id: "release-mbid-1" },
        expand: ["tracklist"],
      },
    }),
  );

  const item = result.items[0];

  assert(requests[0]?.query.inc?.includes("media"), "tracklist lookup should request media");
  assert(requests[0]?.query.inc?.includes("recordings"), "tracklist lookup should request recordings");
  assert(item?.kind === "structured", "tracklist lookup should be structured");
  assert(item.nodes.some((node) => node.type === "medium" && node.id === "medium:release-mbid-1:1"), "medium node should be present");
  assert(item.nodes.some((node) => node.type === "track" && node.ref?.id === "track-mbid-1"), "track node should be present");
  assert(item.nodes.some((node) => node.type === "recording" && node.ref?.id === "recording-mbid-1"), "recording node should be present");
  assert(item.relations.some((relation) => relation.type === "has_medium"), "release should link to medium");
  assert(item.relations.some((relation) => relation.type === "has_track"), "medium should link to track");
  assert(item.relations.some((relation) => relation.type === "represents_recording"), "track should link to recording");
}

async function mapsMusicBrainzRelations(): Promise<void> {
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        status: 200,
        json: {
          id: "recording-mbid-1",
          title: "Intro",
          relations: [
            {
              type: "recording of",
              "target-type": "work",
              direction: "forward",
              work: {
                id: "work-mbid-1",
                title: "Intro",
                type: "Song",
              },
            },
            {
              type: "performance",
              "target-type": "artist",
              direction: "forward",
              attributes: ["vocal"],
              artist: {
                id: "artist-mbid-1",
                name: "Romy",
              },
            },
          ],
        },
      },
    }),
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "musicbrainz", kind: "recording", id: "recording-mbid-1" },
        expand: ["relations", "works"],
      },
    }),
  );

  const item = result.items[0];

  assert(item?.kind === "structured", "relation lookup should be structured");
  assert(item.nodes.some((node) => node.type === "work" && node.ref?.id === "work-mbid-1"), "work relation target should be a node");
  assert(
    item.relations.some((relation) =>
      relation.type === "recording of"
      && relation.direction === "forward"
      && relationHasEndpoint(relation, "recording:recording-mbid-1", "recording")
      && relationHasEndpoint(relation, "work:work-mbid-1", "work")
    ),
    "recording-of-work should preserve MusicBrainz relation type, direction, and endpoint roles",
  );
  assert(item.relations.some((relation) => relation.type === "performance"), "performance should preserve MusicBrainz relation type");
  assert(
    item.relations.some((relation) => (relation.properties?.attributes as string[] | undefined)?.[0] === "vocal"),
    "relation attributes should be preserved",
  );
}

async function expandsTextArtistSearchToFocusedMemberRelations(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      if (request.path === "/ws/2/artist") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              artists: [
                {
                  id: "mbv-artist",
                  name: "My Bloody Valentine",
                  type: "Group",
                  score: 100,
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "mbv-artist",
            name: "My Bloody Valentine",
            type: "Group",
            relations: [
              {
                type: "member of band",
                "target-type": "artist",
                direction: "backward",
                begin: "1983",
                end: "1987",
                ended: true,
                attributes: ["lead vocals"],
                artist: {
                  id: "david-conway",
                  name: "David Conway",
                },
              },
              {
                type: "member of band",
                "target-type": "artist",
                direction: "backward",
                begin: "1987",
                end: "1997",
                ended: true,
                attributes: ["lead vocals"],
                artist: {
                  id: "bilinda-butcher",
                  name: "Bilinda Butcher",
                },
              },
              {
                type: "member of band",
                "target-type": "artist",
                direction: "backward",
                begin: "2007",
                ended: false,
                attributes: ["lead vocals"],
                artist: {
                  id: "kevin-shields",
                  name: "Kevin Shields",
                },
              },
              {
                type: "member of band",
                "target-type": "artist",
                direction: "forward",
                attributes: ["eponymous"],
                artist: {
                  id: "black-midi-new-road",
                  name: "black midi, New Road",
                },
              },
              {
                type: "influenced by",
                "target-type": "artist",
                direction: "forward",
                artist: {
                  id: "unrelated-artist",
                  name: "Unrelated Artist",
                },
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "My Bloody Valentine",
        entityKinds: ["artist"],
        expand: ["relations"],
        relationFocus: ["members"],
        limit: 1,
      },
    }),
  );

  const item = result.items[0];

  assert(requests.length === 2, "focused relation text query should search then look up the search hit");
  assert(requests[0]?.path === "/ws/2/artist", "first request should search artists");
  assert(requests[1]?.path === "/ws/2/artist/mbv-artist", "second request should look up the returned artist");
  assert(requests[1]?.query.inc?.includes("artist-rels"), "member relation expansion should request artist relationships");
  assert(item?.kind === "structured", "member relation result should be structured");
  assert(item.nodes.some((node) => node.ref?.id === "kevin-shields"), "Kevin Shields member node should be returned");
  assert(item.nodes.some((node) => node.ref?.id === "bilinda-butcher"), "Bilinda Butcher member node should be returned");
  assert(item.nodes.some((node) => node.ref?.id === "david-conway"), "David Conway member node should be returned");
  assert(!item.nodes.some((node) => node.ref?.id === "unrelated-artist"), "non-member relations should be filtered out");
  assert(!item.nodes.some((node) => node.ref?.id === "black-midi-new-road"), "forward member-of-band relation should not be treated as a band member");
  assert(
    item.relations.some((relation) =>
      relation.type === "member of band"
      && relation.direction === "backward"
      && relationHasEndpoint(relation, "artist:mbv-artist", "group")
      && relationHasEndpoint(relation, "artist:kevin-shields", "member")
      && (relation.properties?.attributes as string[] | undefined)?.includes("lead vocals")
      && relation.properties?.ended === false
    ),
    "member relations should preserve MusicBrainz type, endpoint roles, role attributes, and date status",
  );
}

async function expandsTextArtistSearchToBroadRelationsWhenNoFocusIsRequested(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      if (request.path === "/ws/2/artist") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              artists: [
                {
                  id: "artist-mbid-1",
                  name: "The xx",
                  type: "Group",
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "artist-mbid-1",
            name: "The xx",
            type: "Group",
            relations: [
              {
                type: "influenced by",
                "target-type": "artist",
                direction: "forward",
                artist: {
                  id: "influence-artist",
                  name: "Influence Artist",
                },
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "The xx",
        entityKinds: ["artist"],
        expand: ["relations"],
        limit: 1,
      },
    }),
  );

  const item = result.items[0];

  assert(requests.length === 2, "broad relation text query should search then look up the search hit");
  assert(requests[1]?.query.inc?.includes("recording-rels"), "broad relations should keep full artist relationship includes");
  assert(item?.kind === "structured", "broad relation result should be structured");
  assert(item.nodes.some((node) => node.ref?.id === "influence-artist"), "broad relation target should be returned");
  assert(
    item.relations.some((relation) =>
      relation.type === "influenced by"
      && relation.direction === "forward"
    ),
    "unfocused relation expansion should preserve broad MusicBrainz relations",
  );
}

async function expandsTextArtistSearchToReleaseGroupBrowse(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      if (request.path === "/ws/2/artist") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              artists: [
                {
                  id: "artist-mbid-1",
                  name: "The xx",
                  type: "Group",
                },
              ],
            },
          },
        };
      }

      if (request.path === "/ws/2/release-group") {
        return {
          ok: true,
          value: {
            status: 200,
            json: {
              "release-groups": [
                {
                  id: "release-group-mbid-1",
                  title: "xx",
                  "primary-type": "Album",
                },
              ],
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "artist-mbid-1",
            name: "The xx",
            type: "Group",
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        text: "The xx",
        entityKinds: ["artist"],
        expand: ["release_groups"],
        limit: 1,
      },
    }),
  );

  assert(requests.map((request) => request.path).join(",") === "/ws/2/artist,/ws/2/artist/artist-mbid-1,/ws/2/release-group", "release-group text expansion should search, lookup, then browse");
  assert(requests[2]?.query.artist === "artist-mbid-1", "release-group browse should use the search hit artist MBID");
  assert(
    result.items.some((item) =>
      item.kind === "structured"
      && item.nodes.some((node) => node.type === "release_group" && node.ref?.id === "release-group-mbid-1")
    ),
    "release-group browse results should be returned as structured knowledge",
  );
}

async function cachesSuccessfulJsonAndSkipsRateLimiterOnHit(): Promise<void> {
  const cache = createInMemoryProviderHttpCacheRepository();
  const nowValues = ["2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"];
  let networkCalls = 0;
  let waits = 0;
  const provider = createMusicBrainzKnowledgeProvider({
    cache,
    clock: () => nowValues.shift() ?? "2026-01-03T00:00:00.000Z",
    rateLimiter: {
      wait: async () => {
        waits += 1;
      },
    },
    requestJson: async () => {
      networkCalls += 1;

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "recording-mbid-1",
                title: "Intro",
              },
            ],
          },
        },
      };
    },
  });

  await assertOk(provider.query({ query: { text: "Intro", limit: 1 } }));
  await assertOk(provider.query({ query: { text: "Intro", limit: 1 } }));

  const entries = await assertOk(cache.listLeastRecentlyUsed({ providerId: "musicbrainz" }));

  assert(networkCalls === 1, "cache hit should skip network request");
  assert(waits === 1, "cache hit should skip rate limiter");
  assert(entries[0]?.lastUsedAt === "2026-01-02T00:00:00.000Z", "cache hit should update lastUsedAt");
}

async function searchesFromCanonicalContextWithoutMusicBrainzRef(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            recordings: [
              {
                id: "recording-mbid-1",
                title: "Intro",
              },
            ],
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "minemusic", kind: "recording", id: "canonical-recording-1" },
        limit: 1,
      },
      canonicalContext: {
        record: {
          ref: { namespace: "minemusic", kind: "recording", id: "canonical-recording-1" },
          kind: "recording",
          label: "Intro",
          status: "provisional",
          aliases: ["Intro (album version)"],
        },
        relations: [
          {
            id: "relation-1",
            subjectRef: { namespace: "minemusic", kind: "recording", id: "canonical-recording-1" },
            predicate: "performed_by",
            objectKind: "artist",
            objectLabel: "The xx",
            sourceRef: { namespace: "minemusic", kind: "recording", id: "canonical-recording-1" },
            status: "provisional",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    }),
  );

  assert(requests[0]?.path === "/ws/2/recording", "recording canonical context should search recordings");
  assert(requests[0]?.query.query?.includes("Intro"), "canonical search should include record label");
  assert(requests[0]?.query.query?.includes("The xx"), "canonical search should include relation labels");
  assert(result.items[0]?.kind === "structured", "canonical context search should return provider knowledge");
}

async function doesNotSearchCanonicalWorkContextInFirstSlice(): Promise<void> {
  let networkCalls = 0;
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async () => {
      networkCalls += 1;

      return {
        ok: true,
        value: {
          status: 200,
          json: {},
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "minemusic", kind: "work", id: "canonical-work-1" },
      },
      canonicalContext: {
        record: {
          ref: { namespace: "minemusic", kind: "work", id: "canonical-work-1" },
          kind: "work",
          label: "Intro",
          status: "provisional",
        },
        relations: [],
      },
    }),
  );

  assert(networkCalls === 0, "canonical work context should not search MusicBrainz in the first slice");
  assert(result.items.length === 0, "canonical work context should return no provider knowledge in the first slice");
}

async function mapsAnnotationWhenReturned(): Promise<void> {
  const requests: Parameters<MusicBrainzRequester>[0][] = [];
  const provider = createMusicBrainzKnowledgeProvider({
    requestJson: async (request) => {
      requests.push(request);

      return {
        ok: true,
        value: {
          status: 200,
          json: {
            id: "artist-mbid-1",
            name: "The xx",
            annotation: "English indie pop band formed in London.",
          },
        },
      };
    },
  });

  const result = await assertOk(
    provider.query({
      query: {
        canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "artist-mbid-1" },
        expand: ["annotation"],
      },
    }),
  );
  const item = result.items[0];
  const root = item?.kind === "structured" ? item.nodes.find((node) => node.id === item.rootNodeId) : undefined;

  assert(requests[0]?.query.inc?.includes("annotation"), "annotation expansion should request annotation");
  assert(root?.properties?.annotation === "English indie pop band formed in London.", "annotation text should be preserved");
}

async function mapsRateLimitErrorWithoutCachingFailure(): Promise<void> {
  const cache = createInMemoryProviderHttpCacheRepository();
  const provider = createMusicBrainzKnowledgeProvider({
    cache,
    rateLimiter: {
      wait: async () => {},
    },
    requestJson: async () => ({
      ok: true,
      value: {
        status: 429,
        json: {
          error: "rate limited",
        },
      },
    }),
  });

  const result = await provider.query({ query: { text: "Intro", limit: 1 } });
  const entries = await assertOk(cache.listLeastRecentlyUsed({ providerId: "musicbrainz" }));

  assert(!result.ok, "rate-limited response should fail");
  assert(!result.ok && result.error.code === "knowledge.rate_limited", "429 should map to rate-limited knowledge error");
  assert(entries.length === 0, "failed MusicBrainz responses should not be cached");
}

await searchesRecordingsAsStructuredKnowledge();
await searchesRequestedEntityKinds();
await searchesLabelsAsStructuredKnowledge();
await filtersRootItemsByReturnedTagsAndGenres();
await searchesTagQueryAndRanksMatchesAcrossKinds();
await appliesTagQueryFiltersToReturnedRootFacts();
await buildsFieldQueriesForRequestedEntityKinds();
await fieldQueryLooksUpMissingTagsBeforeFiltering();
await searchesReleasesAndReleaseGroupsAsStructuredKnowledge();
await looksUpMusicBrainzRefFromCanonicalContext();
await browsesReleasesForReleaseGroupExpansion();
await browsesReleaseGroupsForArtistExpansion();
await mapsReleaseTracklistExpansion();
await mapsMusicBrainzRelations();
await expandsTextArtistSearchToFocusedMemberRelations();
await expandsTextArtistSearchToBroadRelationsWhenNoFocusIsRequested();
await expandsTextArtistSearchToReleaseGroupBrowse();
await cachesSuccessfulJsonAndSkipsRateLimiterOnHit();
await searchesFromCanonicalContextWithoutMusicBrainzRef();
await doesNotSearchCanonicalWorkContextInFirstSlice();
await mapsAnnotationWhenReturned();
await mapsRateLimitErrorWithoutCachingFailure();
