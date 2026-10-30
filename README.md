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

## Production image

The same Dockerfile builds a static bundle served by nginx:

```sh
docker build --target production -t unnamed-video-editor .
docker run --rm -p 8080:80 unnamed-video-editor
```
