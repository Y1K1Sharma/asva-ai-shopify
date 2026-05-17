# Asva AI — Shopify App

Public-distribution Shopify app providing a deep agentic-commerce readiness
audit (UCP, ACP, runtime, AI-platform signals) plus one-click fixes via
Theme App Extension blocks.

## Stack

- Shopify Remix / React Router template
- Polaris (embedded admin UI)
- Prisma + PostgreSQL (sessions, scan cache)
- Railway (hosting)
- Theme App Extension (app blocks for JSON-LD, UCP manifest, bot allow-list)

## Backend dependency

Talks to the existing `asvaai-aeo-backend-prod` service for:

- `POST /api/v5/scan` — full readiness scan
- `POST /api/v5/scan-public` — competitor comparison scans
- `POST /api/v5/connections/oauth/shopify/callback` — register shop
- `GET /api/v5/fix_catalog` — structured fix catalog

## Local development

```bash
npm install
shopify app dev
```

## Deploy

Railway auto-deploys on push to `main`. Run `shopify app deploy` to push
`shopify.app.toml` config to Partner Dashboard.

## Build plan

See `Asva-AI-Shopify-App-Plan.docx` in the `plans/` folder of the parent
workspace for the full plan: 11 sections, 8 pages, 7 phases, risk matrix,
pre-submission checklist.
