# Restore drill log (docs/06 §6.4 — quarterly)

Each drill: restore the latest prod backup into a scratch cluster,
run migrations, boot the API against it, run the smoke and
`journal.chain-verify`, measure the time from "start" to "smoke ok".

| Date | Backup (time) | Target | RTO measured | RPO measured | Chain check | Issues / follow-ups | Run by |
|---|---|---|---|---|---|---|---|
| _pending — first drill after the staging environment is applied (stage 6.11 acceptance)_ | | | | | | | |
