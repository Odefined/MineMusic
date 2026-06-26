# QQ Music Plugin

> Status: Current plugin documentation
> Scope: QQ Music source-provider and platform-library-provider plugin

## Purpose

The QQ plugin is the second real provider plugin. It mirrors the NCM shape
(factory + two Extension slots + sibling HTTP bridge) but targets a
[L-1124/QQMusicApi](https://github.com/L-1124/QQMusicApi) FastAPI bridge. The
plugin is stateless; the bridge holds the login credential, exactly like the
NCM/ncmapi split.

## Identity

```text
pluginId: minemusic.qq
providerId: qq
slots:
  - source-provider
  - platform-library-provider
```

Source refs use the formal source namespace rule:

```text
source_qq:track:<providerEntityId>
source_qq:album:<providerEntityId>
source_qq:artist:<providerEntityId>
```

`providerEntityId` is the QQ **media id (mid)**, which is what every downstream
endpoint (`/song/{mid}/url`, `/song/{mid}/lyric`, library reads) keys on.

## Config

```ts
type QqPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
};
```

Runtime config is plugin-id keyed:

```ts
type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
    "minemusic.qq"?: QqPluginConfig;
  };
};
```

Default bridge URL:

```text
http://127.0.0.1:8080
```

The bridge must be configured with the logged-in credential. Recommended setup
(`web/accounts.toml` + `web/config.toml` on the bridge) enables the **global
default credential**, so the plugin needs no cookie and stays stateless:

```toml
# web/config.toml
[credential]
enabled = true
api = { login = ["refresh_credential"], user = ["get_fav_song", "get_fav_album", "get_follow_singers"], song = ["get_song_url", "get_song_urls", "query_song"], lyric = ["get_lyric"], search = ["search_by_type"] }
```

## Search Request Mapping

The plugin calls `/search/search_by_type` with:

```text
keyword     = query.text.trim()
search_type = 0 (track) / 1 (artist) / 2 (album)
page        = 1-based page (derived from offset for single-kind search)
num         = normalized query.limit
highlight   = false   (strips QQ <em> match highlighting)
```

Expected response arrays (under the bridge's `{ code, data }` envelope):

```text
track  -> data.song
album  -> data.album
artist -> data.singer
```

When `targetKinds` is omitted, QQ defaults to track search (aligned with the
NCM plugin). QQ search is single-kind only: `targetKinds` with more than one
kind is rejected with `extension.qq_multi_kind_unsupported`. Merged multi-kind
pagination is not supported — the retrieval layer always requests one kind
per pool.

## Audio: playable_links + download_source

Both resolve a real audio file. The bridge returns a **relative path** `purl`
(e.g. `M500<mid>.mp3?vkey=...&uin=...`); the plugin joins it with a CDN sip root
from `/song/get_cdn_dispatch` (`url = sip + purl`).

```text
GET /song/{mid}/url            -> data.midurlinfo[0].{purl, result}
GET /song/get_cdn_dispatch     -> data.sip[]  (cdn roots)
GET /song/query_song?value=mid -> data.tracks[0].file.size_<tier>
```

- A non-zero `result` (e.g. `104003` no-permission / VIP-only) or empty `purl`
  is the honest "no stream" signal: playable links return `[]`, download fails.
- The purl prefix names the tier and selects the size field:
  `M500` → mp3/128kbps/`size_128mp3`, `M800` → mp3/320kbps/`size_320mp3`,
  `F000` → flac/`size_flac`.
- `sizeBytes` is filled from `query_song` and matches the CDN `Content-Length`
  byte-for-byte (verified). **QQ returns no md5**; the download pipeline's md5
  check is skipped (it is optional in `DownloadSource`).

## Picture + Lyrics

**Picture** is a predictable static URL (no bridge call for album/artist):

```text
https://y.gtimg.cn/music/photo_new/<kind>R300x300M000<mid>.jpg
  kind = T002 (album cover) | T001 (artist photo)
```

A track's cover needs its `album.mid` first (one `/song/query_song` hop), then
uses the album `T002` URL. "No picture" is `ok(undefined)`, never an error.

**Lyrics** come from `/song/{mid}/lyric?qrc=true&trans=true&roma=true`. QQ
returns encrypted QRC when `crypt != 0` (hex ciphertext); the plugin decrypts
**in-process** via `qrcDecrypt` (non-standard 3DES variant + zlib, see
`qq_qrc_decrypt.ts`) — the bridge is never patched. Decrypted text fills
`SongLyrics.lyrics`, with optional `translation`/`romanization`. Non-tracks,
no lyrics, or undecryptable payloads yield `ok(undefined)`.

## Platform Library Request Mapping

All personal-library endpoints live under `/user/{euin}/...` where `euin` is
the logged-in account's `encrypt_uin`. The plugin resolves it statelessly via
`/login/refresh_credential` → `data.encryptUin`. If the caller supplies
`providerAccountId`, it must match the resolved euin.

```text
saved_source_track      -> /user/{euin}/fav/songs     data.songlist[]     hasmore
saved_source_album      -> /user/{euin}/fav/albums    data.albums[]       hasmore (artists via v_singer)
followed_source_artist  -> /user/{euin}/follow/singers data.users[]       HasMore (capitalized; fields MID/Name)
```

Pagination is 1-based page numbers; the cursor is the page number string and
`nextCursor = page + 1` while the provider signals more.

## Mapping Rules

Track mapping includes `title`, `artistLabels`/`artistSourceRefs` (from
`singer[]`), `albumLabel`/`albumSourceRef`, `durationMs` (interval in seconds
× 1000), `providerUrl`, and `availabilityHint`. Album mapping adds `releaseDate`
(from `time_public`, or `pubtime` unix seconds → `YYYY-MM-DD`). Artist mapping
uses `name` and `providerUrl`.

QQ does not expose NCM-style `fee`/`noCopyrightRcmd`; track `availabilityHint`
defaults to `playable`, albums/artists to `unknown`. `versionInfo` is populated
via the shared `extractVersionInfo` helper (`version_extraction.ts`, same
vocabulary as NCM): track/album titles are scanned for explicit version phrases
(remaster / live / remix / ...).

Search/library items without a usable `mid` are dropped. Non-object rows, or
rows with a `mid` but missing required display facts, fail as malformed provider
responses. The plugin does not synthesize `providerScore`.

## Errors

QQ provider errors return safe summaries only. Raw payloads are not exposed.

- `qq_invalid_config` — non-object config, malformed `baseUrl`, invalid `fetch`;
- `qq_provider_unavailable` (retryable) — network/HTTP failure;
- `qq_malformed_response` — non-JSON, missing `data`, non-object rows, missing
  required display facts;
- `qq_provider_response_error` — bridge `code != 0`;
- `qq_account_unresolved` (retryable) — HTTP 401 or no `encrypt_uin`;
- `qq_account_mismatch` (retryable) — requested vs logged-in euin;
- `qq_invalid_cursor` / `qq_invalid_provider_account_id`;
- `qq_multi_kind_unsupported` — `targetKinds` with more than one kind;
- `qq_no_audio_stream` — non-track download; `qq_no_download_source` (retryable)
  — no resolvable audio (VIP-only / no copyright).

## Smoke

Default smoke skips unless explicitly enabled:

```bash
npm run smoke:qq
```

Live smoke (bridge running on `:8080`, logged in via `web/accounts.toml`):

```bash
MINEMUSIC_LIVE_QQ=1 npm run smoke:qq
MINEMUSIC_LIVE_QQ=1 npm run smoke:qq:download
MINEMUSIC_LIVE_QQ=1 npm run smoke:qq:library
```

Optional config:

```bash
MINEMUSIC_QQ_BASE_URL=http://127.0.0.1:8080
MINEMUSIC_QQ_QUERY=周杰伦 晴天
MINEMUSIC_QQ_LIBRARY_KIND=saved_source_track
MINEMUSIC_QQ_LIBRARY_LIMIT=3
```

Source smoke verifies the runtime registers the QQ provider and returns at least
one `source_qq` candidate. Download smoke resolves a real downloadable URL and
checks the CDN `Content-Length` equals `sizeBytes`. Library smoke reads one page
of each kind and confirms `source_qq` candidates with a `nextCursor`.
