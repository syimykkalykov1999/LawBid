## Owner 2026-10-06 — Country partners («Главный партнёр страны»)

A business partner abroad promotes LawBid in one country at their own cost
and gets a share of that country's net revenue. All money stays on the
owner's Stripe; the owner controls every switch.

### API
- Tables `country_partners`, `country_partner_settlements` (migration
  `20261006120000_owner_country_partners`).
- Partner team = admins whose `admin_profiles.permissions` carry
  `country_partner` (the lead also `partner_lead`). Their access is capped
  at `PARTNER_TEAM_MAX` (dashboard/users read, verification, moderation,
  content, media, cases, support, outreach, `partner_report` read) in the
  guard itself, whatever is stored; never the deputy right, money, keys,
  settings, legal, translations, other countries. The lead hires up to
  `max_admins` people into their own team only (AdminsService); the owner's
  deputy can't touch a partner team.
- Owner (`/admin/country-partners`, super admin): create (with the lead's
  admin account), terms, goals, share (step-up), payouts on (step-up) / off,
  pause / disable (whole team suspended and signed out at once) / back on
  (step-up), contract template with versions.
- Partner team: `GET /admin/country-partner` (goals, contract, report for
  the lead and the accountant), `POST /admin/country-partner/accept-contract`.
- `country-partners.sweep` (daily 04:25 UTC): each finished month settled
  once — paid revenue of the country's users − refunds − estimated card fees
  (app_config `country_partners.program`, 2.9 % + 30¢) × share; sent to
  payroll as an accrual (source `country_partner`) when payouts are on and
  the partner is active, otherwise held. Payouts off / pause / disable take
  back what payroll hasn't paid. Missed goals e-mail the super admins once.

### Admin
- Деньги → Партнёры стран (list, card with share, payouts, pause, disable,
  goals, team, monthly settlements, contract template).
- Дашборд → Кабинет партнёра (only for a partner team).
- Администраторы: a partner manages only their own team with the partner
  areas; badges «партнёр страны» / «команда партнёра».
