import { e2eRedisUrl } from './e2e-env';

// Points every e2e worker at the isolated DB/Redis before AppModule loads;
// @nestjs/config lets process.env win over .env.
if (process.env.E2E_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
}
process.env.REDIS_URL = e2eRedisUrl();

// Every request in the suite comes from 127.0.0.1, and the suite makes
// more than the production per-IP OTP budget (10/h). No e2e scenario
// asserts the per-IP limit (RateLimitService has unit coverage), so only
// that budget is lifted; the per-identifier limit stays at its real value.
process.env.OTP_RATE_LIMIT_PER_IP_PER_HOUR = '1000';
process.env.ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR = '1000';
process.env.OTP_VERIFY_LIMIT_PER_IP_PER_HOUR = '1000';

// Cost guard (owner decision 2026-09-27): the suites send far more than
// 30 SMS within a minute from one process. Only the per-minute velocity
// fallback is lifted; daily/monthly caps keep their real defaults and
// cost-guard.e2e-spec.ts drives caps explicitly through app_config.
process.env.BUDGET_SMS_PER_MINUTE_MAX = '1000';

// docs/03 stage 3.2: uploads go to the local MinIO from docker-compose.yml
// (dev-only credentials published there). Buckets are per isolation tag
// so parallel runs never share objects; FilesBootstrapService creates
// them (private) on boot in NODE_ENV=test.
const s3Tag = process.env.E2E_ISOLATION || 'default';
const s3Defaults: Record<string, string> = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'lawbid',
  S3_SECRET_ACCESS_KEY: 'lawbid_dev_only',
  S3_BUCKET_DOCUMENTS: `lawbid-e2e-${s3Tag}-documents`,
  S3_BUCKET_MEDIA: `lawbid-e2e-${s3Tag}-media`,
};
for (const [key, value] of Object.entries(s3Defaults)) {
  if (!process.env[key]) process.env[key] = value;
}

// docs/06 stage 6.2: admin sign-in needs the TOTP secret encryption key;
// a test-only value so the suites can enroll and verify authenticators.
if (!process.env.ADMIN_TOTP_ENC_KEY) {
  process.env.ADMIN_TOTP_ENC_KEY =
    'e2e_admin_totp_enc_key_at_least_32_chars_long';
}
