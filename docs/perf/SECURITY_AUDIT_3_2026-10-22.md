# Security audit #3: red team as a user, an assistant and an anonymous visitor (2026-10-22)

This audit was read-only. It does not repeat audits #1 and #2, and it leaves out items that were fixed on branches afterwards (admin TOTP, step-up, the Bunny HMAC, enc:v3, the web cookie and CSP, and the others). Paths are under `apps/api/src/modules/` unless stated otherwise. I tested against the local API (`localhost:3000/api/v1`) as Thomas, Charlotte and Peter.

## Checked and fine (with evidence)

- **Validation and IDOR:** `whitelist + forbidNonWhitelisted` is global (`app.setup.ts:162-168`), and no DTO is spread into Prisma. Cases, bids, chats, groups, channels, calls, stories, posts and workspace check membership; sub-ids are looked up with their parent.
- **Files:** keys are made on the server (`purpose/userId/uuid`). The POST policy pins size and type, the magic bytes are sniffed, and every attachment goes through `assertAttachable`.
- **Sockets:** joins check membership. `call:signal` accepts only the call's parties, and only while the call is live (`realtime.gateway.ts:323-535`).
- **Rate limits:** keyed per user, then per IP. `TRUST_PROXY_HOPS=1` matches the single ALB, so `X-Forwarded-For` cannot be spoofed.
- **Codes:** OTP via `randomInt`. The assistant code is 12 characters with per-IP and per-device limits.
- **Exposure:** a preflight from `evil.example` got no ACAO (tested). Swagger and DevModule are off in prod.
- **Search:** no one else's phone, email or address is returned.
- **Mobile app:** config holds only public values, and the Firebase files are not in git. Chat links accept only `https?://`. The magic link is bound to a verifier on the device.
- **Payments:** prices come from the server, and Stripe events are de-duplicated.

## Findings

**1. An assistant can take over the attorney's account (critical, S).**
- **How it happens:** `auth/guards/jwt-auth.guard.ts:127-171` turns every assistant token into the attorney (`sub: ctx.attorneyId, role: 'attorney'`) unless the route carries `@AttorneyOnly`, `@RequiresDuty` or `@AssistantSelf`. `auth/auth.controller.ts` has none of these markers (`grep` count = 0). So, from the assistant's own phone:
  - `POST /auth/identifiers` (`auth.controller.ts:350` → `auth.service.ts:981-1024`) links **the assistant's own** email or Google account to the attorney's account. The only check is an OTP to the *new* identifier, with no reauth. The assistant then signs in as the attorney, and removing the assistant does not stop it.
  - `POST /auth/password` (`password-auth.service.ts:165-178`) asks for `currentPassword` only `if (user.password_hash)`. An attorney who signs in by SMS gets a password set by the assistant.
  - `GET /auth/sessions`, `DELETE /auth/sessions/:id` and `POST /auth/logout-all` (`auth.service.ts:866-902`) let the assistant list the attorney's devices and sign them out.
- **Not tested live:** that would need an assistant account that can't be deleted.
- **What the best do:** OWASP ASVS 4.0.3 V3.7.1 requires reauth before changing account data, and V4.1.3 requires least privilege.
- **Fix:** put `@AssistantSelf` on the whole `AuthController`, so an assistant acts only on their own sessions. Require a reauth token on `identifiers` and `password` for everyone.

**2. A stolen access token becomes a permanent account for anyone (high, S).** This is the same `POST /auth/identifiers` route.
- An attacker with a 15-minute access token (XSS, a shared computer) links their own email or Google account and can then sign in at any time.
- `users/me/contacts/request` asks for reauth only when *replacing* a verified contact (`users/controllers/users.controller.ts:206-208`). Adding an email to an account that has none also needs no reauth, and that email then receives password-reset codes.
- **Best practice:** ASVS V3.7.1, and the [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) ("re-authenticate before changing sensitive data").
- **Fix:** `@ReauthRequired()` on `identifiers`, `password` and `contacts/request` (always). Also send a "new sign-in method added" notice to the old phone.

**3. An assistant can spend the attorney's balance (medium, S).**
- `stars/stars.controller.ts:137` `gifts/:giftId/send` and `:181` `convert` have no assistant gate. The assistant can send gifts bought with the attorney's money to their own profile and convert them into their own stars.
- `promotions/promotions.controller.ts:86,132,187` create and stop paid promotions on the attorney's credits.
- **Fix:** `@AttorneyOnly()` on stars, or `@RequiresDuty('promote')` on promotions.

**4. A promo code can be used twice or more (medium, S).**
- `promotions/promotions.service.ts:1101` and `:1106` check `redeemed_count` and "already used" *before* the transaction.
- `redeemPromo` (`:1127-1131`) then just `return`s if a redemption already exists, so the second promotion **keeps its discount**.
- The increment at `:1137-1140` has no `redeemed_count < max` condition, so parallel requests exceed `max_redemptions`.
- The audience is never compared with the user's role (`:1098`, unlike `admin-billing/promo-rules.ts:77`).
- **Best practice:** ASVS V11.1.6 (no TOCTOU in sensitive operations). Stripe enforces `max_redemptions` atomically ([Stripe coupons](https://docs.stripe.com/billing/subscriptions/coupons#redemption-limits)).
- **Fix:**
  - an `updateMany` with `where redeemed_count < max_redemptions` and a check of `count===1`;
  - insert the redemption *first* and roll back on the unique-constraint error;
  - check the audience against the role.

**5. Changing your phone or email does not end other sessions (medium, S).**
- `users/services/contacts.service.ts` `verify` (`:162`) replaces the identifier and never calls `revoke`. The same happens after `POST /auth/password`. Password *reset* does revoke (`password-auth.service.ts:308`).
- So a thief's session survives the owner's "I changed my number and password".
- **Best practice:** ASVS V3.3.3 and the [OWASP Session Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renew-the-session-id-after-any-privilege-level-change).
- **Fix:** after a contact change or password change, `revokeAllChainsForUser` except the current session, plus a push to the other devices.

**6. Removing an assistant leaves their own login alive (low, S).** REST access stops at once, because the cache is cleared (`assistants/assistants.service.ts:442,459`). But the assistant's tokens are not revoked and the open socket is not cut. Combined with #1, links they made earlier stay. **Fix:** on removal, revoke the assistant's sessions and send a revocation publish to their socket.

**7. Conflict check on any case (low, S).** `bids/conflict/conflict-check.service.ts:65` loads the case by id only, with no view policy and no block check.
- **Tested:** Thomas → `GET /cases/661e0f2c…/conflict-check` → `200 {"conflict":false,"matches":[]}` for another client's closed case. The code path is the same for any case id, with no access check.
- It tells an attorney whether that client's name appears in their own past cases.
- **Fix:** run `CaseAccessPolicy` and the block check first.

**8. Smaller items (low, S).**
- `bid-packs/bid-packs.service.ts:161-165`: a client (with no attorney profile) passes the "verified" check and can buy bid packs. Add a role check.
- `/auth/phone/status` (`password-auth.service.ts:161`) tells an anonymous caller that a number has an account with a password. It is rate-limited and was kept on purpose.
- `files/files.service.ts:767` `copyForUser` has no ownership check of its own. Every current caller checks first, so it is safe today; add `assertReadable` anyway.
- Firebase API keys (`ios/Runner/GoogleService-Info.plist:6`, `android/app/src/prod/google-services.json:18`) are public by design. Restrict them in Google Cloud to the bundle ID and SHA-1, and enable App Check.

**9. Dependencies (medium, S).** `npm audit --omit=dev`: 5 high, 5 moderate, 0 critical, each with a fix available.
- **High:** `postcss ≤8.5.22` (XSS in stringify, GHSA-qx2v-qp2m-jg93), `deepmerge-ts <8` (stack exhaustion), `source-map-js` (DoS), `prisma`/`@prisma/config`.
- **Moderate:** `next` (cache poisoning on self-hosted ISR, GHSA-4jqv-mc3x-m676, which affects the admin), `js-yaml`, `uuid`, `exceljs`, `@nestjs/swagger`.
- **Not run:** `flutter pub outdated` (to keep the Mac's load down).
- **Fix:** `npm audit fix` on a branch, then run CI.

## Do first (ranked)

1. `@AssistantSelf` on the whole `AuthController` (#1).
2. `@ReauthRequired` on `POST /auth/identifiers` (#1, #2).
3. Reauth or the current password on `POST /auth/password`, even with no password set yet (#1).
4. Always require reauth for `contacts/request` (#2).
5. A "new sign-in method / contact" notice to the old phone and email (#2).
6. End other sessions after a contact or password change (#5).
7. `@AttorneyOnly` on stars gift/convert, and a duty on promotions (#3).
8. Atomic promo redemption: conditional increment and insert-first (#4).
9. Promo audience vs role (#4).
10. Revoke the assistant's sessions and socket on removal (#6).
11. `npm audit fix` for postcss, next, prisma and deepmerge-ts (#9).
12. A view policy in the conflict check (#7).
13. A role check on bid-pack purchases (#8).
14. An ownership check inside `copyForUser` (#8).
15. Restrict the Firebase keys and enable App Check (#8).
