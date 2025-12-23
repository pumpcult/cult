# cult-of-pump

## Overview

cult-of-pump is an event-driven backend that launches a new pump.fun token whenever a new follower joins a specific X account. It continuously watches followers, prepares deterministic token metadata, submits the pump.fun transaction, and stores a complete audit trail in PostgreSQL.

Fastify is used instead of Express for clearer request lifecycle handling and lower boilerplate in a service that is mostly background-driven.

## Induction Lifecycle

1. **Follower detection**: The listener polls the target account, using authenticated scraping to fetch the latest followers.
2. **Idempotent ingest**: New followers are inserted into the database with a unique username constraint.
3. **Metadata preparation**: Username normalization generates the token name and symbol. Cult branding, logo, and the follower profile link are attached.
4. **Launch**: Metadata is uploaded to pump.fun IPFS, then the pump.fun create instruction is signed and submitted on Solana.
5. **Persistence**: The induction status, token address, pump.fun URL, and transaction signature are stored for auditability.
6. **Retry safety**: Failed inductions remain in `failed` status and can be safely retried without duplicate launches.

## Local Development

### Prerequisites

- Node.js 18.18+
- pnpm
- PostgreSQL
- Solana RPC endpoint

### Setup

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate:dev
```

### Logo Asset

Place your logo at `assets/logo.png` and set `CULT_LOGO_PATH=assets/logo.png` in your `.env`. If you prefer a hosted logo, set `CULT_LOGO_URL` instead.

### Backfill Existing Followers

Backfill should be run once before enabling induction so existing followers do not trigger launches.

```bash
pnpm backfill
```

### Run

```bash
pnpm dev
```

Health endpoint:

```bash
curl http://localhost:3000/health
```

## Deployment

1. Provision PostgreSQL and a Solana RPC endpoint.
2. Set environment variables in your deployment platform.
3. Run migrations and build:

```bash
pnpm prisma:migrate
pnpm build
pnpm start
```

Use a process manager (systemd, PM2, or container orchestration) to keep the service running.

## Configuration

Required environment variables:

- `DATABASE_URL`
- `CULT_TWITTER_HANDLE`
- `PUMPFUN_DEPLOYER_PRIVATE_KEY`
- `CULT_DESCRIPTION`
- `CULT_LOGO_URL` or `CULT_LOGO_PATH`
- `LOG_LEVEL`

Optional:

- `SOLANA_RPC_URL`
- `FOLLOWER_POLL_INTERVAL_MS`
- `FOLLOWER_FETCH_LIMIT`
- `INDUCTION_ENABLED`
- `HOST`
- `PORT`

Scraper authentication (required for follower listing):

- `X_SCRAPER_COOKIES` (preferred) or
- `X_SCRAPER_USERNAME`, `X_SCRAPER_PASSWORD`, `X_SCRAPER_EMAIL`, `X_SCRAPER_2FA_SECRET`

The `.env.example` file includes `X_API_KEY` and `X_API_SECRET` for completeness, but this system does not use the official X API.

## Security Assumptions

- The deployer wallet is a hot key loaded from `PUMPFUN_DEPLOYER_PRIVATE_KEY` and must be protected by the host environment.
- Scraper credentials or cookies grant account access and should be rotated and stored securely.
- The service trusts the configured Solana RPC endpoint to submit and confirm transactions.
- Database access should be restricted to the service network only.

## Known Limitations

- Follower scraping depends on X frontend behavior and authenticated sessions; changes can break the scraper.
- The follower polling model is event-driven within a long-running process, but still relies on interval-based checks.
- Token metadata name and symbol lengths are truncated to fit on-chain metadata limits.
- pump.fun program addresses are hardcoded and must be updated if the protocol changes.

## Project Structure

```
src/
  index.ts
  server.ts
  config/
  twitter/
  pumpfun/
  db/
  services/
  types/
prisma/
  schema.prisma
scripts/
  backfillFollowers.ts
```
