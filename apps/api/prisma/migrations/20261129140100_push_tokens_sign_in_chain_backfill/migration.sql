-- DB scale review 14.11 (finding 8), step 2 of 20261128140000: every token
-- gets the sign-in chain of the session row it points to, and a token on an
-- older row of a chain that is still signed in moves to the chain's newest
-- live row — otherwise sessions.cleanup would still cascade it away when
-- that old row expires. Row locks only (≤ 10 token rows per account; the
-- live row is found through sessions_session_chain_id_idx), so pushes,
-- sign-ins and refreshes keep going.
SET LOCAL lock_timeout = '5s';

UPDATE "push_tokens" t
SET "session_chain_id" = s."session_chain_id"
FROM "sessions" s
WHERE s."id" = t."session_id" AND t."session_chain_id" IS NULL;

UPDATE "voip_tokens" t
SET "session_chain_id" = s."session_chain_id"
FROM "sessions" s
WHERE s."id" = t."session_id" AND t."session_chain_id" IS NULL;

UPDATE "push_tokens" t
SET "session_id" = live."id"
FROM (
  SELECT DISTINCT ON (s."session_chain_id") s."session_chain_id", s."id"
  FROM "sessions" s
  WHERE s."session_chain_id" IN (SELECT "session_chain_id" FROM "push_tokens" WHERE "session_chain_id" IS NOT NULL)
    AND s."revoked_at" IS NULL
    AND s."expires_at" > now()
  ORDER BY s."session_chain_id", s."created_at" DESC
) live
WHERE live."session_chain_id" = t."session_chain_id" AND t."session_id" <> live."id";

UPDATE "voip_tokens" t
SET "session_id" = live."id"
FROM (
  SELECT DISTINCT ON (s."session_chain_id") s."session_chain_id", s."id"
  FROM "sessions" s
  WHERE s."session_chain_id" IN (SELECT "session_chain_id" FROM "voip_tokens" WHERE "session_chain_id" IS NOT NULL)
    AND s."revoked_at" IS NULL
    AND s."expires_at" > now()
  ORDER BY s."session_chain_id", s."created_at" DESC
) live
WHERE live."session_chain_id" = t."session_chain_id" AND t."session_id" <> live."id";
