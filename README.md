<img src="assets/icon.svg" width="64" height="64" alt="">

# Unnamed Video Editor

Created in [T3 Code](https://t3.codes).

## Development

Start the dev server with Docker Compose:

```sh
docker compose up
```

The app is then available at:

- http://localhost:5200 (this machine)
- http://<this machine's LAN IP>:5200 (other devices on the local network)

Compose builds the `dev` stage of the [Dockerfile](Dockerfile) and bind-mounts
the source into it, so `node_modules` comes from the image and only code changes
need a reload. After changing `package.json` or the lockfile, rebuild:

```sh
docker compose up --build
```

## Export harness

`src/export` turns rendered frames and an audio buffer into an H.264 + AAC MP4,
entirely in the browser. While the dev server is running, open
`/dev/export.html` (for example http://localhost:5200/dev/export.html) to
export a synthetic A/V sync clip, check browser codec support and download the
result. The page is dev-only: `vite build` does not include it.

## Production image

The same Dockerfile builds a static bundle served by nginx:

```sh
docker build --target production -t unnamed-video-editor .
docker run --rm -p 8080:80 unnamed-video-editor
```

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
metadata instead. A changed linked file needs reconnecting. Relinking a shared
source affects project duplicates that use that source.

Only generated thumbnails and waveforms enter the new disposable cache. Writes
and eviction share one IndexedDB transaction and cap it at 128 MiB across tabs.
**Settings → Clear preview cache** removes them; **Rebuild previews** regenerates a source's previews.
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

## Promo video

`demo/` holds a [Remotion](https://www.remotion.dev) promo of the editor
(1920×1080, 30 fps, about 38 s). The editor UI in it is redrawn at the app's
own sizes; the project and footage are invented.

```sh
cd demo
npm install
npm run studio   # preview and scrub in the browser
npm run render   # writes out/unnamed-video-editor-promo.mp4
```
