# Project Blue — app

The Next.js 16 client for [projectblue.cc](https://projectblue.cc).
Listen together — even when you're apart.

## Quick start

```bash
bun install
cp .env.example .env.local   # fill in SESSION_SECRET + ADMIN_*
bun dev                      # http://localhost:3000
```

## Design north stars

- **gov.uk** — decisive type hierarchy, generous whitespace, one accent.
- **Mont Blanc** — monolithic stacked word-mark.
- **cosmos.so** — paper-blue warmth, italic display moments, calm transitions.

Tokens live in [`src/app/globals.css`](src/app/globals.css). Light + dark
flip on `data-theme` on `<html>`, persisted to `localStorage("pb-theme")`,
with `prefers-color-scheme` as the first-visit default.

## Routes

| Public                       | Admin                              |
| ---------------------------- | ---------------------------------- |
| `/` welcome (anonymous-first)| `/admin` dashboard                 |
| `/signin` `/signup`          | `/admin/users`                     |
| `/forgot-password`           | `/admin/links`                     |
| `/terms` `/privacy`          | `/admin/legal/[slug]`              |
| `/blog` `/blog/[slug]`       | `/admin/pages` `/admin/pages/[id]` |
| `/docs` `/docs/[slug]`       |                                    |

`admin.projectblue.cc` is host-routed onto `/admin/*` by `src/proxy.ts`.

## Scripts

| Script              | Use                                         |
| ------------------- | ------------------------------------------- |
| `bun dev`           | Local dev (Node runtime, file-backed KV)    |
| `bun typecheck`     | `tsc --noEmit`                              |
| `bun lint`          | ESLint                                      |
| `bun format`        | Prettier write                              |
| `bun build`         | Next.js production build                    |
| `bun preview`       | Cloudflare Workers dev (real KV binding)    |
| `bun deploy`        | Build + deploy to Cloudflare Workers        |
