# Deployment Guide — DTEN OKR Weekly Execution System

## Overview

The application is packaged as a Docker image. The DTEN service/infrastructure team is responsible for deploying the image on the production server or AWS infrastructure. This guide explains how to build the image, configure it, and run database migrations.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop for local testing, Docker Engine for server)
- A PostgreSQL 16+ database (provided by the service team in production)
- The production `DATABASE_URL` connection string

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `AUTH_SECRET` | Yes | Long random string used to sign JWT sessions. Generate with: `openssl rand -base64 32` |
| `APP_BASE_URL` | Yes | Public URL of the app, e.g. `https://okr.dten.com` |
| `EMAIL_PROVIDER` | No | `dev-log` (console), `disabled`. Default: `dev-log` |
| `EMAIL_FROM` | No | From address for email notifications |
| `PORT` | No | HTTP port inside the container. Default: `3000` |
| `NODE_ENV` | No | Set automatically to `production` inside the Docker image |

**Important:** Never hardcode real secrets in the image or in source control. Inject all secrets as environment variables at runtime.

---

## Build the Docker Image

Run from the `DTEN-Weekly-Execution-System/` directory:

```bash
docker build -t dten-okr-app:latest .
```

Tag with a version for production releases:

```bash
docker build -t dten-okr-app:1.0.0 .
```

---

## Run Database Migrations

Migrations must be applied **before** starting the application (or after any schema-changing deployment). The Prisma CLI is included in the Docker image.

### With standalone Docker

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/dten_okr" \
  dten-okr-app:latest \
  node node_modules/prisma/build/index.js migrate deploy
```

### With Docker Compose (local testing)

```bash
docker compose run --rm migrate
```

---

## Run the Application Container

### With standalone Docker

```bash
docker run -d \
  --name dten-okr-app \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/dten_okr" \
  -e AUTH_SECRET="your-long-random-secret" \
  -e APP_BASE_URL="https://okr.dten.com" \
  -e EMAIL_PROVIDER="disabled" \
  dten-okr-app:latest
```

Pass additional environment variables with `-e KEY=VALUE` as needed.

### With an env file

```bash
docker run -d \
  --name dten-okr-app \
  -p 3000:3000 \
  --env-file /path/to/production.env \
  dten-okr-app:latest
```

---

## Run with Docker Compose (Local / Test Environment)

> The included `docker-compose.yml` spins up the application **and** a local PostgreSQL database. It is intended for local testing only — not for production.

```bash
# Start database and app
docker compose up -d

# Apply migrations first (first run or after schema changes)
docker compose run --rm migrate

# View logs
docker compose logs -f app

# Stop everything
docker compose down
```

The app will be available at `http://localhost:3000`.

---

## Verify the Container is Running

```bash
# Check container health
docker ps

# Check application logs
docker logs dten-okr-app

# Confirm the app responds
curl http://localhost:3000
```

---

## Local Development (without Docker)

For day-to-day development, run the app directly on the host:

```bash
# Install dependencies
npm install

# Start local PostgreSQL (Docker Desktop)
docker compose up -d postgres

# Apply migrations
npm run prisma:migrate

# Start development server
npm run dev
```

---

## Prisma Database Commands Reference

| Command | Purpose |
|---|---|
| `npm run prisma:migrate` | Apply migrations in local development (creates migration files) |
| `npm run prisma:migrate:deploy` | Apply pending migrations in production/staging |
| `npm run prisma:generate` | Regenerate the Prisma client after schema changes |
| `npm run prisma:seed` | Seed the database with demo data (local dev only) |
| `npm run prisma:studio` | Open Prisma Studio UI for local dev |

**Never run `prisma migrate dev` or `prisma db push` against a production database.** Always use `prisma migrate deploy` for production.

---

## Notes for the Service Team

- The Docker image is self-contained. It does **not** require Docker Desktop in production — only Docker Engine.
- The image does **not** bundle any real secrets or environment values.
- The PostgreSQL database in `docker-compose.yml` is for local testing only. In production, use your own managed PostgreSQL instance.
- The application listens on port `3000` by default. Set `PORT=<n>` to change it.
- The `DATABASE_URL` must point to a live PostgreSQL server before the app starts. The app does not create the database — only the schema (via migrations).
- All database migrations are forward-only (`migrate deploy`). There is no automatic rollback.
