# sms-spend — SMS volume spike

`Twilio SMS OTP sent` > 2000 per hour. CostGuard already enforces the
BUDGET_SMS_* ceilings (docs/COST_PROTECTION.md); the alarm is the early
warning before the ceiling.

**Check.** api logs: OTP requests by IP/country (`toE164Suffix`,
`SMS_ALLOWED_COUNTRY_CODES`), WAF blocked requests, Twilio Console →
Monitor → Insights (destinations, error 30xxx).

**Act.** Abuse → lower `OTP_RATE_LIMIT_PER_IP_PER_HOUR` /
`OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR` (env), add the source to a WAF
block; enable device attestation (`FEATURE_ATTESTATION`). Legit growth →
raise the budgets deliberately.
