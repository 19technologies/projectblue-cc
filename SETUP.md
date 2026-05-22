# Project Blue — setup

Three sections:

1. **[Local development](#1-local-development)** — get it running on your laptop
2. **[Production deployment to Cloudflare](#2-production-deployment-to-cloudflare)** — ship it to `projectblue.cc`
3. **[Testing the flows](#3-testing-the-flows)** — verify admin, beta gate, public, etc.

---

## 1. Local development

### 1.1  One-time setup

```bash
# Clone
git clone https://github.com/19Technologies/projectblue-cc.git
cd projectblue-cc/app

# Install
bun install

# Copy env template — never commit the filled-in copy
cp .env.example .env.local
```

Open `.env.local` in your editor and set:

```bash
# Required. 32+ random chars. Generate one with:  openssl rand -hex 32
SESSION_SECRET=replace-with-32-or-more-random-characters

# The first sign-in to /admin creates this user. After that the user
# lives in KV — change the password from /admin/users.
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-real-password
```

Install the pre-commit hooks (typecheck + lint will run on every commit):

```bash
cd ..                        # repo root, where lefthook.yml lives
bunx lefthook install
cd app
```

### 1.2  Day-to-day

```bash
cd app
bun dev                      # http://localhost:3000
```

Common commands:

| Command                | What it does                                |
| ---------------------- | ------------------------------------------- |
| `bun dev`              | Next.js dev server (file-backed KV)         |
| `bun typecheck`        | `tsc --noEmit`                              |
| `bun lint`             | ESLint                                      |
| `bun format`           | Prettier write                              |
| `bun build`            | Next.js production build                    |
| `bun preview`          | Cloudflare Workers dev (real KV binding)    |
| `bun deploy`           | Build + deploy to Cloudflare Workers        |

### 1.3  Where does local KV data live?

In `app/.kv-dev/projectblue.json` (gitignored). Everything the admin
edits — invite codes, social links, terms, blog posts, users — is stored
here in development. Delete the file to reset.

---

## 2. Production deployment to Cloudflare

### 2.1  Prerequisites

- A Cloudflare account
- The `projectblue.cc` zone added to Cloudflare (DNS managed there)
- `wrangler` authenticated locally

```bash
cd app
bunx wrangler login          # opens a browser; OAuth flow
```

### 2.2  Create the KV namespace

```bash
cd app
bunx wrangler kv namespace create PROJECTBLUE_KV
```

Output looks like:

```
[[kv_namespaces]]
binding = "PROJECTBLUE_KV"
id = "a1b2c3d4e5f6..."
```

Copy that `id` value and paste it into `app/wrangler.jsonc`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`:

```jsonc
"kv_namespaces": [
  { "binding": "PROJECTBLUE_KV", "id": "a1b2c3d4e5f6..." }
]
```

Commit the change so production deploys use the same namespace:

```bash
cd ..
git add app/wrangler.jsonc
git commit -m "Wire production KV namespace id"
git push
```

### 2.3  Set secrets

Secrets are stored encrypted on Cloudflare — they're never in source.

```bash
cd app

# Session HMAC secret. 32+ random chars.
bunx wrangler secret put SESSION_SECRET
# (paste your secret when prompted)

# Initial admin password. After first sign-in the user lives in KV and
# you change it via /admin/users; this env var only matters for the
# first-run seed.
bunx wrangler secret put ADMIN_PASSWORD
```

Confirm:

```bash
bunx wrangler secret list
```

### 2.4  Set non-secret env var

`ADMIN_EMAIL` is in `wrangler.jsonc` under `vars`. If you want a different
admin email than the default `admin@projectblue.cc`, edit it there:

```jsonc
"vars": {
  "ADMIN_EMAIL": "you@example.com"
}
```

Commit and push that change.

### 2.5  Deploy

```bash
cd app
bun deploy
```

This runs `opennextjs-cloudflare build` then `opennextjs-cloudflare deploy`.
The output ends with the deployed Worker's `*.workers.dev` URL.

### 2.6  Wire DNS for the three hosts

Three subdomains route to the same Worker; the proxy in `src/proxy.ts`
splits them by `Host` header.

In the Cloudflare dashboard, **Workers Routes** (under the
`projectblue.cc` zone), add these three patterns mapped to the
`projectblue-app` Worker:

| Pattern                          | Why                                                |
| -------------------------------- | -------------------------------------------------- |
| `projectblue.cc/*`               | Public site                                        |
| `beta.projectblue.cc/*`          | Beta gate (host-rewrites onto the welcome chrome)  |
| `admin.projectblue.cc/*`         | Admin dashboard (host-rewrites onto `/admin/*`)    |

For each subdomain, add a **CNAME** record in DNS:

| Type   | Name    | Target                         | Proxy |
| ------ | ------- | ------------------------------ | ----- |
| CNAME  | `admin` | `projectblue-app.workers.dev`  | ✅    |
| CNAME  | `beta`  | `projectblue-app.workers.dev`  | ✅    |

(`projectblue.cc` apex stays as-is or also points at the Worker.)

### 2.7  First-run admin

Visit `https://admin.projectblue.cc`. You'll be redirected to the signin
page. Log in with `ADMIN_EMAIL` + the password you set in 2.3.

The first successful sign-in seeds the admin user in KV. From that
moment, **`ADMIN_PASSWORD` is no longer authoritative** — change it from
`/admin/users` (the env var is just the initial seed).

### 2.8  Migrating off the old waitlist Worker

The repo root still has `wrangler.jsonc` + `src/index.js` + `public/` from
the old static waitlist. They're untouched and continue to deploy
*independently* if you ever run `wrangler deploy` from the repo root.

Once you're confident in the new app at `projectblue.cc`, delete the root
`wrangler.jsonc` and stop deploying the old Worker. (Don't `wrangler delete`
the old Worker until DNS has settled on the new one.)

---

## 3. Testing the flows

### 3.1  Admin

1. Visit `http://localhost:3000/admin` → redirects to `/admin/signin`.
2. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local`.
3. Dashboard should show 5 cards: Beta access · Users · Links · Terms & Privacy · Blog & Docs.

### 3.2  Beta gate (local)

The proxy only enforces the gate when `Host` is `beta.*`. In local dev
you can either set up a fake hosts entry, or test directly via curl:

```bash
# Verify the proxy redirects beta.projectblue.cc requests:
curl -sI -H "Host: beta.projectblue.cc" http://localhost:3000/
# Expect: HTTP/1.1 307 ... location: /beta

# Mint a code via the admin panel, then redeem it:
curl -s -c jar.txt -X POST http://localhost:3000/api/beta/login \
  -H "Content-Type: application/json" \
  -d '{"code":"XXXX-YYY-ZZZ","who":"alice@example.com"}'
# Expect: {"ok":true}

# Verify the cookie now grants access:
curl -sI -b jar.txt -H "Host: beta.projectblue.cc" http://localhost:3000/
# Expect: HTTP/1.1 200
```

To get the *visual* of the animated welcome, just open
`http://localhost:3000/beta` directly in a browser (no host-header trick
needed — that route is always accessible).

### 3.3  Public request → invite → redeem (end-to-end)

1. Open `/` in a browser, click "Request access", submit your email.
2. Open `/admin/beta` (signed in), find the row under "Access requests",
   click **Invite** — a code is minted and stamped on the request.
3. Copy the code, open `/beta`, paste it, click "Enter Project Blue".
4. Confirm in `/admin/beta` that the code now shows up under "Used codes"
   with the email you entered at the gate.

### 3.4  Public pages

| URL          | Should serve                                |
| ------------ | ------------------------------------------- |
| `/`          | Welcome screen with auto-gen room code      |
| `/terms`     | Terms (markdown rendered, editable from admin) |
| `/privacy`   | Privacy notice                              |
| `/blog`      | Blog index (empty until you create posts)   |
| `/docs`      | Docs index                                  |
| `/room/CODE` | Placeholder (real audio sync coming soon)   |

### 3.5  Theme toggle

Bottom-right of the footer on any public page. Persists to
`localStorage("pb-theme")`. First visit honours `prefers-color-scheme`.

---

## Troubleshooting

| Symptom                                                   | Fix                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `Cannot find module 'app'`                                | You're not in `app/`. `cd projectblue-cc/app`.               |
| Sign-in says "Incorrect email or password"                | `.env.local` not set, or the seeded user uses different creds — delete `app/.kv-dev/projectblue.json` to re-seed. |
| `bun deploy` complains about `id = "REPLACE_..."`         | You skipped step 2.2 — create the KV namespace and paste the id. |
| Production admin/beta subdomain 404s                      | Worker route patterns not wired (step 2.6) or DNS hasn't propagated (give it a minute). |
| `Both middleware file and proxy file detected`            | Old Beatsync leftover. Delete `src/middleware.ts` — this repo uses `src/proxy.ts` (Next 16 rename). |
| Hydration mismatch error in dev                           | A browser extension is modifying the DOM. `layout.tsx` already has `suppressHydrationWarning` on `<html>`/`<body>`/script. |
