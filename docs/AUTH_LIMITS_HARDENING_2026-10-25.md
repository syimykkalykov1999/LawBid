# Auth and limits hardening (2026-10-25)

All values are admin settings (app_config) with safe defaults; no app look change.

1. **Passwords.** A new or changed password (`POST /auth/password`, password reset confirm)
   is compared as a whole against (a) a bundled list of the common 8+ character passwords
   (SecLists `10k-most-common.txt`, MIT) and (b) Have I Been Pwned Pwned Passwords
   (`GET api.pwnedpasswords.com/range/{first 5 SHA-1 chars}`, `Add-Padding: true`; the password
   never leaves the server; no key, no rate limit, no attribution required). A hit gives
   `400 AUTH_PASSWORD_COMPROMISED` with `details.reason = common | breached`. HIBP slow or down
   (timeout `security.password_breach_timeout_ms`, default 1500) means the check is skipped and a
   `password_breach_check_skipped` warning is logged. Switches:
   `security.password_breach_check_enabled`, `security.password_common_list_enabled`.
   NIST SP 800-63B-4 section 3.1.1.2: verifiers SHALL compare the prospective secret against a
   blocklist, the entire password and not substrings; the CSP SHALL require a different secret and
   SHALL provide the reason for rejection; SHALL NOT impose other composition rules (we add none).
   Min length is unchanged (8, the MFA minimum; 15 is the single-factor minimum).
2. **scrypt load.** `UV_THREADPOOL_SIZE=8` in `apps/api/Dockerfile` (libuv default is 4; set
   before start, override in the ECS task if the vCPU count changes). At most
   `security.password_hash_concurrency` (2 since the 2026-10-26 review: 0.5 vCPU task; was 4) hashes run at once; up to
   `security.password_hash_max_queue` (200) wait, more get `429 RATE_LIMITED`. Metrics (log lines):
   `password_hash_queue {running, queued}`, `password_hash_rejected`.
3. **Realtime.** The per-user cap already existed (`realtime.max_sockets_per_user`, 10; oldest gets
   `auth:error TOO_MANY_CONNECTIONS` and a clean disconnect); metric `ws_user_cap_evicted` added.
   New: `realtime.max_connects_per_ip_per_minute` (120, 0 = off), address taken from
   X-Forwarded-For with `TRUST_PROXY_HOPS` like HTTP; over it the socket gets
   `auth:error RATE_LIMITED`; metric `ws_ip_limited`. Fails open if Redis is unreachable.
4. **Per-action limits** (`UsageLimitsService`, same path as `message`): `bid_create` 200/day,
   `bid_counter` 120/hour, `case_create` 30/day, `chat_save` 120/min, `forward` 60/min.
   Over the limit: `429 RATE_LIMITED` with `details.action`.

Sources: NIST SP 800-63B-4 section 3.1.1.2 (pages.nist.gov/800-63-4/sp800-63b.html, fetched
2026-10-25); HIBP API v3 Pwned Passwords (haveibeenpwned.com/API/v3, 2026-10-25); libuv threadpool
docs (docs.libuv.org/en/v1.x/threadpool.html); SecLists (github.com/danielmiessler/SecLists, MIT).

## Для владельца (коротко)
1. Новый пароль теперь проверяется по базе утёкших паролей и по списку самых частых; сам пароль никуда не уходит.
2. Если сервис проверки не отвечает, регистрация не ломается: проверка просто пропускается.
3. Тяжёлые проверки паролей идут не больше 4 за раз, поэтому поток входов не заморозит сервер.
4. Один адрес не может открывать тысячи живых соединений, а у человека не больше 10 открытых.
5. Добавлены щедрые лимиты на ставки, дела, «Сохранённое» и пересылки; всё меняется в админке.
