# Database Setup

Release 1 uses Prisma with PostgreSQL.

## Files

```text
prisma/schema.prisma   Database schema
prisma/seed.ts         Release 1 demo seed data
prisma.config.ts       Prisma config, datasource URL, and seed command
.env.example           Template environment values
.env                   Local ignored environment values
```

## Local Environment

The default local connection string is:

```text
postgresql://postgres:postgres@localhost:5432/dten_weekly_execution?schema=public
```

Update `.env` if your local PostgreSQL user, password, host, port, or database name is different.

## Commands

Validate schema:

```powershell
& .\node_modules\.bin\prisma.cmd validate
```

Generate Prisma Client:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:generate
```

Create/apply a local migration:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:migrate -- --name init
```

Seed demo data:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:seed
```

Open Prisma Studio:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:studio
```

## Seed Users

The seed script creates:

```text
ceo@dten.com
head@dten.com
manager@dten.com
engineer@dten.com
sales@dten.com
```

Local demo password for all seeded users:

```text
Password123!
```
