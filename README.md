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
