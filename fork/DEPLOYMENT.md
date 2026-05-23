# fork.projectblue.cc — deployment runbook

This `fork/` directory is a Project-Blue-skinned fork of
[freeman-jiang/beatsync](https://github.com/freeman-jiang/beatsync) (MIT
licensed). The engine is unchanged; the design tokens are overridden in
`apps/client/src/app/globals.css` and visible "Beatsync" strings are
swapped to "Project Blue".

The fork runs on **Fly.io** as **two apps** — the persistent Bun
WebSocket server can't run on Cloudflare Workers, so the rest of the
Project Blue infra (which is CF-only) doesn't apply here.

## One-time setup

You'll need:

- a [Fly.io](https://fly.io) account (`fly auth login`)
- a Cloudflare R2 bucket for audio (the server uses the S3 API)
- access to Cloudflare DNS for `projectblue.cc`

### 1. Create the R2 bucket + access key

```bash
# In the Cloudflare dashboard:
#   R2 → Create bucket → "pb-fork-audio" (public read recommended)
#   R2 → Manage API Tokens → Create API token (Object Read & Write)
#   note the Access Key ID + Secret Access Key
#   the endpoint URL is shown on the bucket overview
```

### 2. Provision both Fly apps

```bash
cd fork

# Server (Bun WebSocket + R2 client)
fly apps create pb-fork-server
fly secrets set -a pb-fork-server \
  S3_BUCKET_NAME=pb-fork-audio \
  S3_PUBLIC_URL=https://pub-XXXXXXXX.r2.dev \
  S3_ENDPOINT=https://YYYYYYYY.r2.cloudflarestorage.com \
  S3_ACCESS_KEY_ID=... \
  S3_SECRET_ACCESS_KEY=...

# Client (Next.js standalone)
fly apps create pb-fork-client
```

### 3. Deploy both

```bash
# Server first — the client bakes the API URL at build time.
fly deploy -c fly.server.toml -a pb-fork-server --dockerfile Dockerfile

# Client second
fly deploy -c fly.client.toml -a pb-fork-client --dockerfile Dockerfile.client
```

Verify each is up:

```bash
curl https://pb-fork-server.fly.dev/health
curl -I https://pb-fork-client.fly.dev/
```

### 4. Point the DNS at Cloudflare

In Cloudflare → DNS for `projectblue.cc`, add two CNAMEs (both proxied
or both grey-cloud — Fly needs the original host header, so **grey-cloud
is safer**):

| Type  | Name                | Content                       | Proxy |
| ----- | ------------------- | ----------------------------- | ----- |
| CNAME | `fork`              | `pb-fork-client.fly.dev`      | DNS only |
| CNAME | `api.fork`          | `pb-fork-server.fly.dev`      | DNS only |

Then attach the custom hostnames on Fly so it provisions TLS:

```bash
fly certs add fork.projectblue.cc     -a pb-fork-client
fly certs add api.fork.projectblue.cc -a pb-fork-server
fly certs check fork.projectblue.cc     -a pb-fork-client
fly certs check api.fork.projectblue.cc -a pb-fork-server
```

Wait for both to show `Status: Ready` (~2 minutes).

### 5. Smoke test

Open `https://fork.projectblue.cc` — you should see the Project-Blue-skinned
landing page. Create a room. Upload a track. Confirm playback syncs across
two browser tabs.

## Updating

```bash
cd fork
fly deploy -c fly.server.toml -a pb-fork-server --dockerfile Dockerfile
fly deploy -c fly.client.toml -a pb-fork-client --dockerfile Dockerfile.client
```

## Pulling upstream beatsync changes

This fork is checked in as plain files (no `.git` link to upstream). To
pull upstream improvements:

```bash
# Add the upstream remote once
git remote add beatsync-upstream https://github.com/freeman-jiang/beatsync.git
git fetch beatsync-upstream main

# Inspect what changed
git diff --stat beatsync-upstream/main -- fork/

# Cherry-pick or merge selectively. The Project Blue overrides live in:
#   fork/apps/client/src/app/globals.css   (the appended :root + .dark blocks)
#   fork/apps/client/src/constants.ts
#   fork/apps/client/src/app/layout.tsx, manifest.ts, hooks/useDocumentTitle.ts
#   fork/apps/client/src/components/{Join,Queue,room/TopBar,dashboard/{CopyRoom,Left},ui/SyncProgress}.tsx
# Re-apply those after a merge.
```

## Known follow-ups

- The Discord links (in `Join.tsx`, `SyncProgress.tsx`, `room/TopBar.tsx`)
  point at `SOCIAL_LINKS.discord` which is now an empty string. Either
  remove those `<a>` tags or point them at a real Project Blue channel.
- Beatsync's `BackupManager` periodically backs room state up to R2 every
  60s. That'll write to the bucket configured above.
- Beatsync deletes a room 60s after the last client disconnects. R2 audio
  for that room is cleaned up by the `cleanup` script:
  ```bash
  fly ssh console -a pb-fork-server -C "bun run cleanup:live"
  ```
- The `apps/server` ENV expects S3-style env vars (it's S3-API compatible
  so R2 works). Do NOT use Cloudflare's R2 SDK — use the standard S3 env
  variables as shown above.

## Cost notes

Fly's free allowance covers ~3 shared-cpu-1x machines and 160GB egress.
With `auto_stop_machines = "stop"` and `min_machines_running = 0`, the
machines spin down when idle and you pay nothing during quiet hours.
Expect ~$2–10/mo at moderate use. R2 storage is $0.015/GB-month and
egress to Cloudflare is free.
