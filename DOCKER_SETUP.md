# Running wa-drive-collector in Docker

These 5 files replace the manual "install Node, install Chromium, npm install"
steps in the original README — Docker handles all of that for you at build
time.

## 0. Where to put these files

Copy `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`,
and this file into the **root of your project** — the same folder that
already has `package.json`, `index.js`, and `node_modules` in it.

Prerequisite: Docker Desktop (or Docker Engine + Compose plugin) installed
and running. That's the only thing you need on your machine — everything
else (Node, Chromium, npm packages) is installed inside the image.

## 1. About the files already in your folder

Your upload already contains a `session/` folder, `oauth-token.json`, and
`service-account-key.json`. These look like a **live WhatsApp session and a
real Google OAuth token** from a previous run — treat them as secrets:
- Don't commit them to git or share the folder publicly.
- `service-account-key.json` isn't actually used by the code (the README
  notes service accounts don't work for this use case), so it's safe to
  ignore/delete.
- If you keep `session/` and `oauth-token.json` as-is, the container will
  reuse that existing login and you can likely **skip steps 3 and 4 below**.
  If you'd rather start fresh (e.g. this is going on a different machine or
  you want a clean login), delete both before continuing.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
and `GOOGLE_DRIVE_FOLDER_ID` (see the original README for how to get these
from Google Cloud Console). Leave `WHATSAPP_GROUP_ID` blank for now if you
don't have it yet.

## 3. Authorize your Google account (skip if reusing an existing oauth-token.json)

The container needs an empty file to exist first so Docker can mount it:

```bash
touch oauth-token.json
docker compose --profile setup run --rm authorize
```

Open the printed URL in your **host machine's** browser, sign in, and
approve access. The token gets written to `./oauth-token.json` on your host
via the volume mount, so it persists.

## 4. Find your WhatsApp group ID (skip if reusing an existing session/)

```bash
docker compose --profile setup run --rm list-groups
```

Scan the QR code that prints in your terminal with WhatsApp
(**Settings → Linked Devices → Link a Device**). It'll print your groups and
their IDs — copy the one you want into `.env` as `WHATSAPP_GROUP_ID`.

## 5. Run the collector

```bash
docker compose up -d bot
docker compose logs -f bot
```

If you deleted the old session, scan the QR code shown in the logs. Once
logged in, the session is saved to `./session` on your host (via the volume
mount), so future restarts won't need a re-scan.

## Everyday commands

```bash
docker compose up -d bot        # start in the background
docker compose logs -f bot      # tail logs
docker compose restart bot      # restart
docker compose down             # stop and remove the container
docker compose build bot        # rebuild after code changes
```

## Notes

- `restart: unless-stopped` in `docker-compose.yml` keeps the bot running
  across crashes and Docker/host restarts — this replaces the pm2 step from
  the original README.
- The Dockerfile copies your existing `node_modules` into the image instead
  of running `npm install`, because this project's `whatsapp-web.js`
  dependency is pinned to a GitHub pull request via `git+ssh`, which fails
  in a clean container without SSH keys. This also means the build needs no
  npm/GitHub network access at all — only the `apt-get install chromium`
  step downloads anything, and only during the image build.
- If you ever do want the Dockerfile to run `npm install` fresh instead of
  copying `node_modules`, you'd need to either switch the dependency in
  `package.json` to an `https://` GitHub URL or bake SSH credentials into
  the build — neither is necessary as long as you keep using your existing
  `node_modules`.
