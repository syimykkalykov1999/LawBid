# LawBid Admin (Next.js)

docs/06 §2: the admin panel — Next.js (App Router) + TypeScript + Tailwind +
shadcn-style components + TanStack Query. API types are generated from
`packages/api-contract/openapi.json` (`npm run generate`).

Sign-in (§2.1): email → emailed code → mandatory TOTP (first sign-in binds
the authenticator and shows recovery codes once). The admin JWT never
reaches the browser: `app/api/auth/session` keeps it in an httpOnly cookie
and `app/api/proxy/*` forwards calls to `/admin/*` with it. Sessions: 8 h,
30 min idle (server side); a 401 from the proxy sends you back to /login.

```sh
cp apps/admin/.env.example apps/admin/.env.local
npm run dev --workspace apps/admin     # http://localhost:3001
```

Stage 6.2: sign-in, dashboard, administrators, audit log. Later stages add
verification, users, moderation, cases, subscriptions, flags/config,
localization, legal documents, data requests.
