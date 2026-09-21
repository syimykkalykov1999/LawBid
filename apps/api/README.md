# LawBid API (NestJS)

Stack: Prisma + CockroachDB (UUID PKs only), withTxRetry() for
serialization-conflict retries, BullMQ/Redis, Socket.IO + Redis adapter,
class-validator strict ValidationPipe, Swagger -> generated Dart client,
pino/OpenTelemetry/Sentry.

Central services mandated by .cursorrules: CaseStateMachine, BidStateMachine,
CaseJournalService.append(), NotificationsService.emit(),
SubscriptionAccessService.isActive().

Scaffolding pending: requires npm install, not yet available (network
egress blocked). See docs/01_FOUNDATION_AUTH.md and docs/02_DATABASE.md.
Stage: 1.1 (not started).
