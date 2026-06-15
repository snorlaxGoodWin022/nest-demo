# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run start:dev     # Development with hot reload
pnpm run start         # Run compiled app
pnpm run start:prod  # Production mode
pnpm run test         # Run unit tests
pnpm run test:cov     # Test coverage
pnpm run test:e2e    # End-to-end tests
pnpm run lint         # Lint and fix
pnpm run format       # Prettier formatting
```

Run a single test file:
```bash
pnpm run test -- path/to/file.spec.ts
```

## Architecture

This is a NestJS + PostgreSQL application using Prisma 7 with Docker and Nginx.

### Modules
- **AppModule**: Root module
- **PrismaModule**: Database access via Prisma 7
- **UserModule**: User CRUD operations
- **PostModule**: Post CRUD operations (belongs to User)
- **DemoModule**: Demo/hello world module

### Database
- **Prisma 7** uses a Driver Adapter pattern instead of traditional Prisma setup
- The `PrismaService` connects via `@prisma/adapter-pg` with a `pg` Pool
- Generated client: `src/generated/prisma` (not in node_modules)
- Database URL must be set via `DATABASE_URL` environment variable

### Infrastructure
- **Docker**: Full stack in `docker-compose.yml` (PostgreSQL 18, NestJS, Nginx)
- **Nginx**: Reverse proxy on port 80/443
- **PostgreSQL**: Runs on port 5432 (mapped to 5433 in Docker to avoid conflicts)

### Environment
- `.env` for local development
- `.env.docker` for Docker container
- PostgreSQL connection: `postgres:5432` (Docker internal) or `localhost:5433`