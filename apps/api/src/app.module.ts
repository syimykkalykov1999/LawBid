import { RuntimeStatsModule } from './common/ops/runtime-stats.service';
import { SloMetricsModule } from './common/ops/slo-metrics.service';
import { ServerTextsModule } from './common/i18n/server-texts.service';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  LoadSheddingMiddleware,
  LoadSheddingService,
} from './common/resilience/load-shedding';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { startTime, type Options as PinoHttpOptions } from 'pino-http';
import { ImageFormatInterceptor } from './modules/files/processing/image-format-context';
import { ViewerContextInterceptor } from './common/viewer/viewer-context';
import { ShardContextInterceptor } from './sharding/shard-context.interceptor';
import { ConfigModule } from './config/config.module';
import {
  AnonymousCacheInterceptor,
  CacheSafetyMiddleware,
} from './common/cache/http-cache';
import { AdminCacheHeadersMiddleware } from './common/middleware/admin-cache-headers.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HeavyHittersModule } from './common/heavy-hitters/heavy-hitters.module';
import { HeavyHittersInterceptor } from './common/heavy-hitters/heavy-hitters.interceptor';
import { AdminSummaryModule } from './common/admin-summary/admin-summary.module';
import { OpsModule } from './common/ops/ops.module';
import { SeoGeneratorModule } from './common/seo/seo-generator.module';
import { EconomyModule } from './common/economy/economy.module';
import { ThrottlerModule } from './throttler/throttler.module';
import { UserThrottlerGuard } from './throttler/user-throttler.guard';
import { HealthModule } from './modules/health/health.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { CasesModule } from './modules/cases/cases.module';
import { CaseHistoryModule } from './modules/case-history/case-history.module';
import { DealsModule } from './modules/deals/deals.module';
import { PushModule } from './modules/notifications/push/push.module';
import { CountersModule } from './modules/counters/counters.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PostsModule } from './modules/posts/posts.module';
import { StickersModule } from './modules/stickers/stickers.module';
import { StoriesModule } from './modules/stories/stories.module';
import { UsernamesModule } from './modules/usernames/usernames.module';
import { HttpStatsMiddleware } from './common/ops/http-stats.service';
import { LinkPreviewModule } from './modules/link-preview/link-preview.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { FeedModule } from './modules/feed/feed.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CaseCommentsModule } from './modules/case-comments/case-comments.module';
import { ClientReviewsModule } from './modules/client-reviews/client-reviews.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FollowsModule } from './modules/follows/follows.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { PresenceModule } from './modules/presence/presence.module';
import { PrivacySettingsModule } from './modules/privacy-settings/privacy-settings.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AdminIntegrationsModule } from './modules/admin-integrations/admin-integrations.module';
import { AdminLaunchModule } from './modules/admin-launch/admin-launch.module';
import { AdminPromotionModule } from './modules/admin-promotion/admin-promotion.module';
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';
import { AdminShardsModule } from './modules/admin-shards/admin-shards.module';
import {
  AdminExperimentsModule,
  ExperimentsCoreModule,
} from './modules/experiments/experiments.module';
import { AdminEconomyModule } from './modules/admin-economy/admin-economy.module';
import { AdminPnlModule } from './modules/admin-pnl/admin-pnl.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { StripeOpsModule } from './modules/stripe-ops/stripe-ops.module';
import { CasePaymentsModule } from './modules/case-payments/case-payments.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { BidPacksModule } from './modules/bid-packs/bid-packs.module';
import { StarsModule } from './modules/stars/stars.module';
import { FirmsModule } from './modules/firms/firms.module';
import { PartnersModule } from './modules/partners/partners.module';
import { LegalModule } from './modules/legal/legal.module';
import { LegalDocumentsModule } from './modules/legal-documents/legal-documents.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ClientBadgeModule } from './modules/client-badge/client-badge.module';
import { SearchModule } from './modules/search/search.module';
import { ContactsSyncModule } from './modules/contacts-sync/contacts-sync.module';
import { DeadlinesModule } from './modules/deadlines/deadlines.module';
import { LegalQaModule } from './modules/legal-qa/legal-qa.module';
import { StaffModule } from './modules/staff-core/staff.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { ChatModule } from './modules/chat/chat.module';
import { GroupsModule } from './modules/groups/groups.module';
import { CaseFanoutModule } from './modules/notifications/case-fanout/case-fanout.worker';
import { GroupFanoutModule } from './modules/groups/group-fanout.module';
import { ForwardModule } from './modules/forward/forward.module';
import { ChatSavedModule } from './modules/chat-saved/chat-saved.module';
import { TranslationModule } from './modules/translation/translation.module';
import { CallsModule } from './modules/calls/calls.module';
import { MentionsModule } from './modules/mentions/mentions.module';
import { NotificationsApiModule } from './modules/notifications/notifications-api.module';
import { SessionModule } from './modules/session/session.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RealtimeGatewayModule } from './modules/realtime/realtime-gateway.module';
import { BidsModule } from './modules/bids/bids.module';
import { NegotiationsModule } from './modules/negotiations/negotiations.module';
import { JournalModule } from './modules/journal/journal.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PlansCoreModule } from './modules/plans/plans.module';
import { AppSettingsModule } from './common/app-settings/app-settings.module';
import { VersionEtagModule } from './common/sync/version-etag.module';
import { VerificationModule } from './modules/verification/verification.module';
import {
  AttorneyTrustCoreModule,
  AttorneyTrustModule,
} from './modules/attorney-trust/attorney-trust.module';
import {
  ClientFraudCoreModule,
  ClientFraudModule,
} from './modules/client-fraud/client-fraud.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PublicDirectoryModule } from './modules/public-directory/public-directory.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DevModule } from './modules/dev/dev.module';
import { FilesModule } from './modules/files/files.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminSanctionsModule } from './modules/admin-sanctions/admin-sanctions.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminCasesModule } from './modules/admin-cases/admin-cases.module';
import { AdminDataRequestsModule } from './modules/admin-data-requests/admin-data-requests.module';
import { AdminConfigModule } from './modules/admin-config/admin-config.module';
import { BillingModule } from './modules/billing/billing.module';
import { AssistantsModule } from './modules/assistants/assistants.module';
import { AdminContentModule } from './modules/admin-content/admin-content.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EventsModule } from './modules/events/events.module';
import { CrashReportsModule } from './modules/crash-reports/crash-reports.module';
import { AdminSearchModule } from './modules/admin-search/admin-search.module';
import { AdminMediaModule } from './modules/admin-media/admin-media.module';
import { DocumentTemplatesModule } from './modules/document-templates/document-templates.module';
import { AdminBillingModule } from './modules/admin-billing/admin-billing.module';
import { AdminPayrollModule } from './modules/admin-payroll/admin-payroll.module';
import { CountryPartnersModule } from './modules/country-partners/country-partners.module';
import { CaseToolsModule } from './modules/cases/tools/case-tools.module';
import { SupportModule } from './modules/support/support.module';
import { StorageModule } from './modules/storage/storage.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import {
  CountriesCoreModule,
  CountriesModule,
} from './modules/countries/countries.module';
import { AdminEmailTemplatesModule } from './modules/admin-email-templates/admin-email-templates.module';
import {
  AttorneyAdsCoreModule,
  AttorneyAdsModule,
} from './modules/attorney-ads/attorney-ads.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { MediaModerationModule } from './modules/media-moderation/media-moderation.module';
import { CostGuardModule } from './common/cost-guard/cost-guard.module';
import { JobsModule } from './jobs/jobs.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  RequestIdMiddleware,
  resolveRequestId,
} from './common/middleware/request-id.middleware';
import { DemoHeaderMiddleware } from './common/demo/demo-header.middleware';
import { DemoModule } from './modules/demo/demo.module';
import { scrubLogObject } from './telemetry/scrub';
import {
  compactReq,
  compactRes,
  httpLogLevel,
  httpLogPolicyFromEnv,
  requestUserProps,
  type HttpLogPolicy,
} from './common/logging/http-log-policy';

/** Read once, on the first finished request (the env is loaded by then). */
let cachedHttpLogPolicy: HttpLogPolicy | undefined;
function httpLogPolicy(): HttpLogPolicy {
  return (cachedHttpLogPolicy ??= httpLogPolicyFromEnv());
}

/**
 * pino-http options for LoggerModule. Exported so src/app.module.spec.ts
 * can assert the request-id wiring against the exact production config.
 *
 * genReqId: pino-http would otherwise mint its own incrementing id, so
 * log lines and the X-Request-Id header (RequestIdMiddleware) disagreed —
 * resolveRequestId() is shared by both, see its doc comment.
 */
export const pinoHttpOptions: PinoHttpOptions = {
  genReqId: (req, res) => resolveRequestId(req, res),
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  // docs/06_PRODUCTION.md §12: "персональные данные в логи не писать" —
  // redact list per §4.3 (extended as later stages add more PII fields).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-reauth-token"]',
      'req.body.phone',
      'req.body.email',
      // Stage 1.4 (docs/CHANGELOG.md): auth/contacts DTOs use a
      // generic `identifier` field (phone OR email, see
      // OtpRequestDto/OtpVerifyDto/ReauthDto) and `value` (Contacts
      // DTOs) instead of separate phone/email fields — both are PII
      // and must be redacted the same as the literal names above.
      'req.body.identifier',
      'req.body.value',
      'req.body.code',
      'req.body.refreshToken',
      'req.body.idToken',
      'req.body.nonce',
      'req.body.reauthToken',
      // Owner 2026-10-05: keys, passwords and tokens never reach the logs.
      'req.body.values',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.totp',
      'req.body.token',
      'req.body.secret',
      'req.body.apiKey',
      'req.headers["stripe-signature"]',
      // S3-12 (2026-10-25): wildcards, so a header or key nested one level
      // under any object is removed too, and provider SDK errors (axios
      // from Twilio / Stripe / Bunny) never write the request they sent.
      '*.authorization',
      '*.cookie',
      '*.apiKey',
      '*.api_key',
      '*.password',
      '*.token',
      '*.secret',
      'err.config.headers.*',
      'err.config.auth',
      'err.config.data',
      'err.response.config.*',
      'err.response.headers["set-cookie"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  // Owner 2026-10-22 (server load audit, finding 1): compact lines — the
  // request id, method and url (query values and secret path parts such as
  // the Bunny webhook token removed; docs/05 §7.6: search text is never
  // logged), the status and the user; no headers or bodies. CloudWatch
  // bills per GB, and the full request object was most of every line.
  // S3-12: the error text goes through the same scrubber as Sentry's.
  formatters: { log: scrubLogObject },
  serializers: {
    req: compactReq,
    res: compactRes,
  },
  customProps: (req) => requestUserProps(req),
  // Owner 2026-10-22: only failures (status >= 400 or an error, always),
  // requests slower than HTTP_LOG_SLOW_MS and an HTTP_LOG_SAMPLE_PERCENT
  // sample of the rest are written (docs/COST_PROTECTION.md).
  customLogLevel: (_req, res, err) =>
    httpLogLevel(
      res.statusCode,
      Date.now() - (res[startTime] ?? Date.now()),
      // pino-http logs `err` or `res.err` as a failure (a 5xx line).
      err != null || (res as { err?: unknown }).err != null,
      httpLogPolicy(),
    ),
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
};

const isDev =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions }),
    PrismaModule,
    RedisModule,
    // WP-G: Redis top-K of the heaviest users / cases (admin «Масштаб»).
    HeavyHittersModule,
    // Owner 2026-10-23: the admin's precomputed aggregates (Redis).
    AdminSummaryModule,
    // Owner 2026-10-05: zero-maintenance operations (Система → Здоровье системы).
    OpsModule,
    SeoGeneratorModule,
    // Owner 2026-10-05: plans + the entitlements gate (global).
    PlansCoreModule,
    ThrottlerModule,
    HealthModule,
    // Registered after ThrottlerModule and before AuthModule so global
    // APP_GUARDs run in this order: ThrottlerGuard (cheap per-IP rate
    // limit) -> AppVersionGuard (FeatureFlagsModule, stage 1.8 —
    // rejects a stale client before spending any JWT-verification work
    // on it) -> JwtAuthGuard (AuthModule). See feature-flags.module.ts
    // and auth.module.ts's doc comments.
    FeatureFlagsModule,
    // Global: CostGuardService for every paid provider call.
    CostGuardModule,
    EconomyModule,
    AuthModule,
    // docs/06 stage 6.2: admin JWT, RBAC, dashboard/audit/admins.
    AdminAuthModule,
    AdminModule,
    AdminUsersModule,
    AdminSanctionsModule,
    AdminCasesModule,
    AdminDataRequestsModule,
    AdminConfigModule,
    // docs/06 §1 (stage 6.7): Stripe subscriptions, webhooks, admin extend.
    BillingModule.register({ mode: 'api' }),
    AssistantsModule,
    AdminContentModule,
    // Audit 2026-10-02: reels + stickers in the admin panel.
    AdminMediaModule,
    AdminSearchModule,
    CrashReportsModule,
    AnalyticsModule,
    EventsModule,
    DocumentTemplatesModule,
    AdminBillingModule,
    AdminPayrollModule,
    // Owner 2026-10-02: support tickets + transactional email editor.
    SupportModule,
    // Owner 2026-10-05: Система → Хранилище (storage like Telegram).
    StorageModule,
    // Owner 2026-10-05: Деньги → «Прибыль и резерв».
    TreasuryModule,
    // Owner 2026-10-05: «Лучший сотрудник» and every admin's workspace.
    RewardsModule,
    WorkspaceModule,
    AdminEmailTemplatesModule,
    // docs/06 §5 (stage 6.9): data export endpoint + privacy services.
    PrivacyModule.register({ mode: 'api' }),
    // Owner 2026-10-22 (audit #4 §5): image / reel-thumbnail moderation.
    MediaModerationModule.register({ mode: 'api' }),
    // Owner 2026-10-22 (audit #4 §4): server texts in every app language.
    ServerTextsModule,
    // Owner 2026-10-22 (audit #4 §7): business SLO counters.
    SloMetricsModule,
    // Load audit 6: event-loop delay + heap as CloudWatch EMF metrics.
    RuntimeStatsModule,
    UsersModule,
    I18nModule,
    CasesModule,
    // docs/04 §12 (stage 4.7): case history + PDF export queue.
    CaseHistoryModule.register({ mode: 'api' }),
    // Deal record 2026-10-27: `deal-record` queue + /deal-records (off by default).
    DealsModule.register({ mode: 'api' }),
    // docs/04 stage 4.8: `push` queue consumer (while JOBS_ENABLED).
    PushModule.register({ mode: 'api' }),
    // docs/05 stage 5.1: counters aggregator + moderation hook (global).
    CountersModule,
    ModerationModule,
    // docs/05 §3 (stage 5.2).
    PostsModule,
    StickersModule,
    StoriesModule,
    ChannelsModule,
    UsernamesModule,
    LinkPreviewModule,
    AddressesModule,
    FeedModule,
    CommentsModule,
    CaseCommentsModule,
    ClientReviewsModule,
    ReportsModule,
    FollowsModule,
    SearchModule,
    ContactsSyncModule,
    // Owner 2026-09-29 (OQ-028): user blocks.
    BlocksModule,
    PresenceModule,
    PrivacySettingsModule,
    SecretsModule,
    AdminIntegrationsModule,
    // Owner 2026-10-05: Система → Здоровье системы.
    AdminOpsModule,
    AdminShardsModule,
    AdminLaunchModule,
    AdminPromotionModule,
    // Owner 2026-10-25: A/B experiments + ranking events log.
    ExperimentsCoreModule,
    AdminExperimentsModule,
    AdminEconomyModule,
    AdminPnlModule,
    // Owner 2026-10-02: referrals + paid case promotion.
    ReferralsModule,
    PartnersModule,
    // Owner 2026-10-05 (legal): DMCA notices, legal texts, partner rules.
    LegalModule,
    // Owner 2026-10-05: demo world for bloggers («Продвижение»).
    DemoModule,
    LegalDocumentsModule,
    OutreachModule,
    // 2026-10-25 (legal register): 18+ gate, TCPA, SES bounces.
    ComplianceModule,
    PromotionsModule,
    BidPacksModule,
    StarsModule,
    FirmsModule,
    // Owner 2026-10-05: client → attorney payments via Stripe Connect.
    CasePaymentsModule,
    StripeOpsModule,
    ClientBadgeModule,
    // docs/05 §8 chats + §8.5 realtime (publisher global, gateway API-only).
    RealtimeModule,
    RealtimeGatewayModule,
    ChatModule,
    ChatSavedModule,
    TranslationModule,
    CallsModule,
    MentionsModule,
    // docs/05 §9-§10 notifications REST, badges, push tokens.
    NotificationsApiModule,
    // Owner 2026-10-22 (client economy plan, package G): GET /me/session.
    SessionModule,
    BidsModule,
    NegotiationsModule,
    JournalModule,
    SubscriptionsModule,
    AppSettingsModule,
    VersionEtagModule,
    // Global NotificationsService.emit() seam (delivery: docs/05).
    NotificationsModule,
    VerificationModule,
    // Owner 2026-10-05: attorney trust levels (gates for bids, payments,
    // the blue check).
    AttorneyTrustCoreModule,
    AttorneyTrustModule,
    // Owner 2026-10-05: repeat accounts of blocked fraudsters, client risk
    // score (docs/CLIENT_FRAUD.md).
    ClientFraudCoreModule,

    // Owner 2026-10-05: countries (Система → Страны).
    CountriesCoreModule,
    CountriesModule,
    // Owner 2026-10-28: attorney advertising compliance.
    AttorneyAdsCoreModule,
    AttorneyAdsModule,
    FilesModule,
    ProfilesModule,
    PublicDirectoryModule,
    ReviewsModule,
    ClientFraudModule,
    // Owner 2026-10-06: Деньги → Партнёры стран.
    CountryPartnersModule,
    // Owner 2026-10-20: group chats and polls.
    GroupsModule,
    // Owner 2026-10-22 (server load audit, finding 7): group fan-out
    // jobs, consumed here while JOBS_ENABLED.
    GroupFanoutModule.register({ mode: 'api' }),
    CaseFanoutModule.register({ mode: 'api' }),
    // Owner 2026-10-21 (Telegram «Переслать»): one forward into many chats.
    ForwardModule,
    // Owner 2026-10-20: time, expenses, invoice, e-signature, document forms.
    CaseToolsModule,
    // BullMQ `cron` queue (session/OTP cleanup, disposable-domain refresh).
    // Runs in this process while JOBS_ENABLED (default true); src/worker.ts
    // runs the same module as the dedicated worker service.
    JobsModule.register({ mode: 'api' }),
    ...(isDev ? [DevModule] : []),
    // Owner 2026-10-20: booking, «Вопрос юристу», deadline calculator.
    ConsultationsModule,
    CalendarModule,
    LegalQaModule,
    DeadlinesModule,
    // Staff package 2026-10-27 («Админка и сотрудники»): all switches off.
    StaffModule,
  ],
  providers: [
    LoadSheddingService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ViewerContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ImageFormatInterceptor },
    // Batch C item 14: opt-in shared-cache header for guest-only GETs.
    { provide: APP_INTERCEPTOR, useClass: AnonymousCacheInterceptor },
    // Shard-ready step 4: the shard context of the request (route ids, else
    // the signed-in user). No effect while all shards share one database.
    { provide: APP_INTERCEPTOR, useClass: ShardContextInterceptor },
    // WP-G: sampled per-user / per-case request and database-time counts.
    { provide: APP_INTERCEPTOR, useClass: HeavyHittersInterceptor },
    // OQ-048: per signed-in user (assistants share an office IP).
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Demo mode (owner 2026-10-05): the demo header decides the database
    // for the whole request; it must wrap everything that follows.
    consumer.apply(RequestIdMiddleware, DemoHeaderMiddleware).forRoutes('*');
    // Owner 2026-10-23: an overloaded instance answers 503 + Retry-After
    // instead of timing out (limits in app_config, 0 = off).
    consumer.apply(LoadSheddingMiddleware).forRoutes('*');
    // Owner 2026-10-22: error rate and p95 for «Состояние системы».
    consumer.apply(HttpStatsMiddleware).forRoutes('*');
    // Owner 2026-10-23: admin GETs are private and revalidated by ETag.
    consumer.apply(AdminCacheHeadersMiddleware).forRoutes('*');
    // Batch C item 14: nothing personal reaches a shared cache.
    consumer.apply(CacheSafetyMiddleware).forRoutes('*');
  }
}
