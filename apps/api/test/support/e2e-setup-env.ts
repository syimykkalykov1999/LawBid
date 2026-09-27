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
