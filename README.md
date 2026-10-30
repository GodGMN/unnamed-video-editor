<img src="assets/icon.svg" width="64" height="64" alt="">

# Unnamed Video Editor

A desktop browser video editor with a multitrack timeline, video and audio clips,
text overlays, chroma key, and MP4 export. Media processing runs locally in your
browser. There is no application backend or account to set up.

Created by [Sergio Gimeno](https://gimeno.dev) in [T3 Code](https://t3.codes).
Licensed under [AGPL-3.0-or-later](LICENSE).

## Browser requirements and limitations

Use a recent desktop Chromium browser such as Chrome or Edge. Codec decoding and
WebCodecs encoding depend on your browser and operating system. A source that
cannot be decoded can be converted with the built-in FFmpeg converter, subject
to browser memory limits. Large files and exports can exhaust available memory.

Serve the app over HTTPS outside localhost. Browser media and file-picker APIs
may be unavailable on plain HTTP LAN addresses. Browsers without persistent
file handles require reconnecting source files after reloading.

Projects autosave in the current browser profile, with no cloud sync. Clearing
site data removes saved edits. Download project backups and keep your original
media. Concurrent editing of one project in multiple tabs is not synchronized.
See [Project storage](#project-storage) for details.

## Development

### With Node.js

Use Node.js 24 and pnpm 10, matching the Docker setup:

```sh
npm install --global pnpm@10
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. No API keys or environment file are required.

### With Docker Compose

Install Docker with Compose, then run:

```sh
docker compose up --build
```

Open http://localhost:5200. Set `WEB_PORT` to change the host port:

```sh
WEB_PORT=5300 docker compose up
```

Compose builds the `dev` stage of the [Dockerfile](Dockerfile) and mounts the
source for live reload. Dependencies live in a Docker volume. After changing
`package.json` or the lockfile, rebuild the image and refresh that volume:

```sh
docker compose down --volumes
docker compose up --build
```

The Compose port is exposed on all host interfaces for LAN development. Use
HTTPS when accessing it from another machine to enable secure-context APIs.

## Deployment

The production app is static. It needs no database, server-side credentials, or
persistent server volume. User projects remain in each user's browser.

### Docker

```sh
docker build --target production -t unnamed-video-editor .
docker run --detach --name unnamed-video-editor --restart unless-stopped \
  -p 127.0.0.1:8080:80 unnamed-video-editor
```

Open http://localhost:8080 locally. For public access, put an HTTPS reverse proxy
in front of port 8080. For example, this Caddy configuration obtains and renews
a certificate when your domain points to the server and ports 80 and 443 are
reachable:

```caddyfile
editor.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Replace the example domain with yours. This configuration assumes Caddy runs on
the host; a containerized proxy should reach the app through its Docker network.
The Compose service is a development server; use the production image to deploy.

### Static hosting

```sh
pnpm install --frozen-lockfile
pnpm build
```

Publish the entire `dist/` directory at the root of an HTTPS site. Serve `.wasm`
files as `application/wasm` and JavaScript modules with a JavaScript MIME type.
Keep worker files and all generated assets. Allow revalidation of `index.html`;
hashed files under `assets/` can use long-lived immutable caching. Enable gzip or
Brotli, especially for the FFmpeg WASM asset.

The default build targets `/`. Hosting below a path requires configuring Vite's
`base` and checking asset and worker URLs. The converter uses the single-threaded
FFmpeg core, so it does not require COOP/COEP headers.

Keep deployments on a stable origin. Changing the scheme, domain, or port gives
the browser a separate project library; download backups before moving a site.

## License

Original project code is licensed under the GNU Affero General Public License,
version 3 or any later version. See [LICENSE](LICENSE) for the full terms.

Dependencies and fonts retain their own licenses. In particular, the FFmpeg core
is GPL-2.0-or-later, Mediabunny is MPL-2.0, the AAC encoder includes LGPL FFmpeg
code, and the bundled fonts use the SIL Open Font License. Preserve their license
notices and satisfy their source-distribution requirements when distributing a
build. The project license does not replace those licenses.

## Export harness

While the dev server is running, open `/dev/export.html` to export a synthetic
H.264 + AAC clip, check codec support, and download the result. This page is
excluded from the production build.

## Project storage

The app opens on the project home. **Continue editing** resumes the last opened
project. Search, sort, or filter the scrollable list by Recent or Favorites.
Each project has one **…** menu for renaming, favorites, duplication, downloads,
package reconnection, and deletion. **New project** creates an empty edit; its
dropdown imports project files. **Settings** contains preview-cache controls.
Use **Projects** in the editor to return home after pending edits have saved.
Names can also be edited in the top bar. Edits autosave to IndexedDB; switching projects waits for
the current save to commit. The former single `current` save migrates into the
library when the database opens. A failed load never replaces a saved project
with the demo.

New imports do not copy source bytes into browser storage. On browsers with
`showOpenFilePicker`, Import stores a read-only file handle. Access may need to
be granted again after reopening. Dropped files and browsers without that picker
use session references; select the originals again with **Reconnect** after a
reload. Source handles stay outside project documents and worker messages.

Reconnect checks the source size and a sampled content signature covering the
beginning, middle, and end. This detects accidental substitutions without reading
an entire multi-gigabyte file. It is not a full-file integrity checksum. Legacy
media without signatures is checked against its name, size, duration, and stream
metadata instead. A changed linked file needs reconnecting. **Relink original**
(right-click a media item) points an available source at another copy. Relinking a shared
source affects project duplicates that use that source.

Only generated thumbnails and waveforms enter the new disposable cache. Writes
and eviction share one IndexedDB transaction and cap it at 128 MiB across tabs.
**Settings → Clear preview cache** removes them; right-click a media item and
choose **Rebuild previews** to regenerate its previews.
Old OPFS/IndexedDB source copies remain readable. Reconnecting an original or
deleting its last saved reference removes that old copy, never the external
original. Copies retained from older versions are outside the preview budget.
Converted output stays available for the session; save the MP4 from its completed
conversion dialog and relink that saved file to retain access across sessions.

The project menu's **Download project** writes a versioned `.uve.json` document containing edits and
media identifiers, without browser handles or media. Reconnect sources after
opening it. **Package with media** writes a self-contained `.uvepack`, streaming
to the selected destination where a save picker is available. Other browsers use
an explicit Blob download. Opening a package links byte ranges within that file;
it does not extract source copies into browser storage. Keep the package on disk.
Without persisted handles use **Reconnect package** after reloading to restore
media access while keeping subsequent edits, or reconnect its original source files. Imported documents receive new media IDs so they
cannot replace another project's links.

The package format is eight ASCII bytes `UVEPACK1`, a little-endian uint32 JSON
manifest length, a UTF-8 `.uve.json` document, then uncompressed source bytes in
manifest media order. Manifest length is limited to 16 MiB; media ranges must
exactly match the package size. Video is already compressed, so packaging does
not transcode it or add a second compression pass.

The library belongs to this origin and browser profile. Clearing site data also
removes saved edits and handles. Keep downloadable project backups for work you
need to retain. Concurrent editing of the same project in different tabs is not
synchronized.

Verify the storage workflows against Vite with a local Chromium installation:

```sh
TEST_URL=http://127.0.0.1:5262 \
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
node scripts/verify-projects.mjs
```

The script generates real A/V media with ffmpeg and checks imports without
copies, session reconnect, mismatched-source rejection, shared references,
package roundtrip, handle persistence, validation, migration, and cache eviction.
Its handle-persistence fixture uses a genuine serializable OPFS handle as a
controlled stand-in for a handle returned by the native picker. Native permission
prompts and cross-browser picker behavior still need manual testing.


Verify the project home against 40 persisted projects:

```sh
TEST_URL=http://127.0.0.1:5262 \
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
node scripts/verify-project-home.mjs
```

This checks search, sorting, favorite persistence, rename, keyboard menus at the
bottom of the list, settings, resume, save-before-navigation, deletion, and the
1280×720 layout. Sample project covers are generated only in the test profile.
