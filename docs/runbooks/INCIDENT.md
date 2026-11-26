# Авария: что делать, кто за что отвечает, как разбирать

## Резюме для владельца (по-русски)

Что делать, когда что-то сломалось. Три уровня: **SEV1** (всё лежит, деньги или
данные в опасности: действуем немедленно), **SEV2** (важная часть сломана: в течение
часа), **SEV3** (мелочь: в рабочее время). Сейчас компания из двух ролей: вы
(принимаете решения) и Claude (ищет и чинит). Когда появятся люди, роли
раздаются по этой же таблице. После каждой SEV1/SEV2 пишем разбор **без поиска
виноватых** по шаблону внизу (готовые разборы: `docs/postmortems/`). Для людей есть
страница статуса `status.lawbid.dev` ([STATUS_PAGE.md](STATUS_PAGE.md)) и её запасная копия
вне AWS (Cloudflare R2), пункт 4.

---

Sources used (read 2026-10-25): Google SRE book, [Managing Incidents](https://sre.google/sre-book/managing-incidents/)
(incident command, operations, communications and planning roles; one live
incident document; only operations changes the system) and
[Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) (blameless; write one
after user-visible downtime, data loss, a rollback, or a monitoring failure; criteria
agreed in advance); [PagerDuty Incident Response](https://response.pagerduty.com/) (roles:
incident commander, deputy, scribe, customer liaison, internal liaison, subject matter
expert; its severity page defines SEV-1 versus SEV-3). The alarm design (burn rates)
is in [slo.md](slo.md). Alarm to runbook map: [README.md](README.md).

## 1. Severity levels

Severity is decided by **user and money impact**, not by how hard the fix is. When in
doubt, pick the higher level and lower it later.

| Level | Meaning | LawBid examples | Response | Updates |
|---|---|---|---|---|
| **SEV1** | Product unusable for many, or money/data/legal risk | API down (`/health/ready` 503, all tasks unhealthy); database or Redis unavailable; sign-in impossible for everyone (SMS and e-mail both dead); Stripe charging wrongly or webhooks failing for hours; suspected breach or leaked key ([BREACH.md](BREACH.md)); database restore needed; journal integrity CRITICAL ([journal-integrity.md](journal-integrity.md)); child-safety report pipeline broken | Start now, any hour. Phone page (PagerDuty) | every 30 min until stable |
| **SEV2** | A major feature is broken or the product is badly degraded, workaround exists | Calls fail (SLO calls alarm, Cloudflare TURN/SFU down); push not delivered (iOS or Android); SMS codes not arriving in one country; search down or slow; 5xx above 1 percent ([api-5xx.md](api-5xx.md)); p95 over target; queue backlog; bad deploy rolled back; SES bounce alarm; autoscale failed | Within 1 hour in waking hours; page only if composite SLO alarm | hourly |
| **SEV3** | Minor, one screen or one user group, cosmetic, no data risk | One admin page error; wrong text or translation; one user cannot upload; non-critical job delayed; a third-party free-plan limit near | Next working day; ticket | when fixed |

Always SEV1 regardless of the table: possible exposure of client documents (attorney-client
privilege), loss of money, loss of data with no backup.

## 2. Roles

Rule from the SRE book: one person holds command; whoever has no explicit role holds all of them.

| Role | Does | Today | Tomorrow (team of 3 to 6) |
|---|---|---|---|
| Incident commander (IC) | decides, assigns, keeps the incident note | **Owner** (SiMA) decides: rollback, spend money, tell users | on-call engineer; owner becomes executive sponsor |
| Operations | the only one who changes the system | **Claude** (investigates logs, alarms, runs rollback/restore commands from the runbook) | on-call engineer or second engineer |
| Communications | status text to users, store, partners | **Owner** approves, Claude drafts | support lead / CEO |
| Scribe | timeline in the incident note | **Claude** writes it as it goes | any teammate |
| Subject-matter expert | vendor or code knowledge | vendor support (AWS, Stripe, Cloudflare) | module owners |

Limits of a two-role company, said plainly: Claude cannot answer a phone call, cannot
apply production Terraform or IAM changes (the owner presses Run on a saved plan), and
cannot approve a GitHub `production` deploy. The owner is the single pager: **if the owner is
asleep, a SEV1 waits for him.** First hire or contractor should be a secondary on-call
(PagerDuty Free allows 5 users, 1 schedule, 1 escalation policy). Escalation target if the
owner does not acknowledge in 10 minutes: the secondary, once one exists.

Where alarms arrive: e-mail from `lawbid-prod-alerts`; the six composite SLO alarms also
phone via PagerDuty ([paging.md](paging.md)); in-app on-call pushes admins
with the "Дежурный" right and repeats every 15 minutes; the daily GitHub "Self-check
(production)" run. Plain-language guide for the owner: [OWNER.md](OWNER.md).

## 3. Steps

1. **Notice and acknowledge.** Acknowledge the page. Open an incident note: GitHub → Issues → New issue → «Авария (incident)» (template `.github/ISSUE_TEMPLATE/incident.md`, label `incident`, title `SEVn short name`; write the detection time at once). Private details go in a private place, never in the public repo.
2. **Classify.** Pick SEV with the table. Write the start time (UTC) and who is IC.
3. **Stop the bleeding first, understand later.** In this order of safety:
   1. Roll back the last deploy if one happened in the last 2 hours: GitHub Actions, workflow "Rollback production" ([DEPLOY_SAFETY.md](DEPLOY_SAFETY.md)).
   2. Flip the relevant switch: `calls.video_provider` back to `p2p`; `media.public_store` back to `aws`; `search.engine` back to `postgres`; feature flags (Admin, System, Features); "Pause heavy jobs" and "Keep minimum / normal mode" in Admin, System, Health.
   3. Scale: [ecs-capacity.md](ecs-capacity.md), [db-autoscale.md](db-autoscale.md), [redis-autoscale.md](redis-autoscale.md).
   4. Restore data only with the owner's explicit yes: [backups.md](backups.md), [restore-drill.md](restore-drill.md).
4. **Diagnose** with the alarm's runbook (table in [README.md](README.md)): signal, check, act, escalate, after. Check the vendor status page first for anything external ([VENDORS.md](VENDORS.md)).
5. **Communicate** (section 4) on the cadence in the table.
6. **Resolve.** Confirm with the same signal that raised the alarm and the morning self-check (`scripts/ops/self-check.sh`). Keep watching for 30 minutes (60 for SEV1).
7. **Follow up.** SEV1/SEV2 get a postmortem within 5 working days (section 5). Actions become issues with an owner and a date.

Do not, during an incident: edit production by hand outside the runbook, rotate keys
without noting it, delete logs, or skip the note. Preserve evidence (logs, task definitions, request ids).

## 4. Communication and the status page

**Status page:** `status.lawbid.dev`, module `infra/modules/status-page` (S3 + CloudFront,
independent of the API, the load balancer and ECS; how it works and how to switch it on:
[STATUS_PAGE.md](STATUS_PAGE.md)). The worker publishes `status.json` every minute; an incident
text is posted from Admin → System → «Страница статуса» (`/admin/status-page`, super_admin,
audited). Components: app, chats, calls, payments, notifications.

**Backup outside AWS** (SRE Workbook ch. 9: the channel to users must not depend on the system
that is down): the worker writes the same `status.json` and the page itself to the public
Cloudflare R2 bucket (`status/` folder, e.g. `https://media.lawbid.dev/status/index.html`), and
the main page reads the R2 copy when its own file does not answer. If AWS itself is down and the
worker is silent, both pages say «data may be out of date» after 6 minutes; then the owner
uploads a hand-written `status.json` to R2 (steps in [STATUS_PAGE.md](STATUS_PAGE.md), «Если
лежит AWS»).

Also:
- Admin broadcast / in-app banner for users who can still open the app (Admin, Communications).
- Short text in the app-store "What's new" is not for incidents; use the support e-mail auto-reply for a SEV1.
- For vendor-caused incidents link the vendor's own status page in the note.

Wording rules: say what users see, what we know, next update time; never guess a cause; never
name an individual.

Template (copy, fill, send):

> **[Investigating | Identified | Monitoring | Resolved]** {Feature} is {not working | slow} for {who}.
> Started {time UTC}. {What you may notice}. We are {doing what}. Next update by {time}.

## 5. Blameless postmortem template

Principle (Google SRE): find contributing causes, assume everyone acted in good faith
with what they knew, fix systems and processes, not people. Publish internally;
keep personal data and secrets out (the repo is public: store the filled copy in
`docs/postmortems/` only after removing anything private). Examples:
[2026-11-11 database access rule removed](../postmortems/2026-11-11-db-sg-pooler.md),
[2026-11-13 «Авто» switched PgBouncer off](../postmortems/2026-11-13-auto-pgbouncer-off.md).

```markdown
# Postmortem: {short title} - SEV{n} - {date}

**Summary (3 lines, plain words).**
**Impact:** who, how many, how long, money, data (numbers, not adjectives).
**Detection:** how we found out (alarm / user / luck) and how long it took.
**Timeline (UTC):** hh:mm event ... (alarm, ack, decisions, mitigation, resolved).
**Root cause and contributing factors:** what in the system made this possible.
**What went well / what went badly / where we were lucky.**
**Mitigation that worked, and why it was or was not fast.**
**Action items:** each with type (prevent / detect / mitigate / process), owner, due date, issue link.
**Lessons / docs to update:** runbook, ADR, alarm, test.
**Not in scope:** (anything deliberately left out).
```

Triggers for writing one: any SEV1 or SEV2; any data loss; any rollback of production;
any alarm that should have fired and did not; anything the owner asks for.

## 6. How this grows

| Stage | People | Change |
|---|---|---|
| Now | owner + Claude | owner is IC and only pager; Claude is operations and scribe |
| First hire | +1 engineer | engineer is primary on-call, owner is secondary and approves spend/comms |
| 3 to 5 people | rotation | weekly rotation in PagerDuty, separate IC and operations on SEV1, status page automated, game-day once per quarter (AWS FIS planned) |
| Larger | team | add customer liaison and scribe roles per PagerDuty model; SLO targets drive severity; error budgets in [slo.md](slo.md) |

Review this file after every SEV1 and at least once a quarter, together with the toil
register [toil.md](toil.md) (SRE Workbook ch. 6).
