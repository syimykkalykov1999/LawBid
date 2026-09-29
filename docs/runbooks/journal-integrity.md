# journal-integrity — CRITICAL: case_journal hash chain broken

The daily `journal.chain-verify` job (docs/06 §5.3) found a row whose hash
or link does not match (`case_journal hash chain broken`, Sentry fatal).
The journal is append-only for the app role; a break means direct DB
access, a restore from a backup that cut a chain, or a bug.

**Check.**
1. Worker log line: `caseId`, `brokenAt.id`, `reason`
   (`hash_mismatch` = row content changed, `link_mismatch` = a row is
   missing/reordered).
2. Was there a restore or a manual DB session? CockroachDB audit log /
   Cloud Console SQL activity for that table.
3. Retention: a `link_mismatch` on the first remaining row of a very old
   case can be the retention job (rows past 5 years removed) — the
   verifier accepts that only for heads older than 4 years (OQ-022).

**Act.** Treat as a security incident: freeze DB credentials that could
write to `case_journal`, snapshot the table, keep the evidence. Do not
"repair" hashes. Escalate to the owner immediately; legal may need the
finding (docs/01 §10.7 retention obligations).
