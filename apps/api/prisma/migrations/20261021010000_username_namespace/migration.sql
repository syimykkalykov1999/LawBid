-- Owner 2026-10-20 (Telegram): ONE @username namespace for people, channels and
-- groups, with a 30-day hold on a released handle. The four tables that carry
-- a handle keep their columns; triggers mirror them into `usernames` (unique,
-- with a «skeleton» for look-alike checks) and leave a row in
-- `username_holds` when a handle is changed or freed.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "username_changed_at" TIMESTAMPTZ;
ALTER TABLE "chat_groups" ADD COLUMN IF NOT EXISTS "username_changed_at" TIMESTAMPTZ;

CREATE TABLE "usernames" (
  "username_lower" VARCHAR(64) NOT NULL,
  "owner_type" VARCHAR(8) NOT NULL,
  "owner_id" UUID NOT NULL,
  "skeleton" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "usernames_pkey" PRIMARY KEY ("username_lower")
);
CREATE INDEX "usernames_skeleton_idx" ON "usernames" ("skeleton");
CREATE INDEX "usernames_owner_type_owner_id_idx" ON "usernames" ("owner_type", "owner_id");

CREATE TABLE "username_holds" (
  "username_lower" VARCHAR(64) NOT NULL,
  "holder_user_id" UUID NOT NULL,
  "released_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "username_holds_pkey" PRIMARY KEY ("username_lower")
);
CREATE INDEX "username_holds_released_at_idx" ON "username_holds" ("released_at");

-- Look-alike key: 0→o, 1/i→l, no `_` or `.`.
CREATE OR REPLACE FUNCTION username_skeleton(u text) RETURNS text
LANGUAGE sql IMMUTABLE AS
$$ SELECT regexp_replace(translate(lower(u), '01i', 'oll'), '[_.]', '', 'g') $$;

-- Mirrors a handle change into the namespace and the hold list.
CREATE OR REPLACE FUNCTION username_namespace_sync() RETURNS trigger
LANGUAGE plpgsql AS
$$
DECLARE
  kind text;
  oid uuid;
  holder uuid;
  old_name text := NULL;
  new_name text := NULL;
  hold_days int := 30;
BEGIN
  IF TG_TABLE_NAME = 'attorney_profiles' OR TG_TABLE_NAME = 'client_profiles' THEN
    kind := 'user';
    IF TG_OP <> 'INSERT' THEN old_name := OLD.username_lower; END IF;
    IF TG_OP <> 'DELETE' THEN new_name := NEW.username_lower; END IF;
    oid := COALESCE(NEW.user_id, OLD.user_id);
    holder := oid;
  ELSIF TG_TABLE_NAME = 'channels' THEN
    kind := 'channel';
    IF TG_OP <> 'INSERT' THEN old_name := lower(OLD.username); END IF;
    IF TG_OP <> 'DELETE' THEN new_name := lower(NEW.username); END IF;
    oid := COALESCE(NEW.id, OLD.id);
    holder := COALESCE(NEW.owner_id, OLD.owner_id);
  ELSE
    kind := 'group';
    IF TG_OP <> 'INSERT' THEN old_name := OLD.username_lower; END IF;
    IF TG_OP <> 'DELETE' THEN new_name := NEW.username_lower; END IF;
    oid := COALESCE(NEW.id, OLD.id);
    holder := COALESCE(NEW.created_by, OLD.created_by);
  END IF;

  IF old_name IS NOT DISTINCT FROM new_name THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF old_name IS NOT NULL THEN
    DELETE FROM usernames WHERE username_lower = old_name AND owner_type = kind AND owner_id = oid;
    INSERT INTO username_holds (username_lower, holder_user_id, released_at)
    VALUES (old_name, holder, now())
    ON CONFLICT (username_lower) DO UPDATE
      SET holder_user_id = EXCLUDED.holder_user_id, released_at = EXCLUDED.released_at;
  END IF;

  IF new_name IS NOT NULL THEN
    BEGIN
      SELECT COALESCE((value #>> '{}')::int, 30) INTO hold_days
        FROM app_config WHERE key = 'profile.username_hold_days';
    EXCEPTION WHEN OTHERS THEN
      hold_days := 30;
    END;
    IF EXISTS (
      SELECT 1 FROM username_holds h
      WHERE h.username_lower = new_name
        AND h.holder_user_id <> holder
        AND h.released_at > now() - make_interval(days => COALESCE(hold_days, 30))
    ) THEN
      RAISE EXCEPTION 'username % is held', new_name USING ERRCODE = '23505';
    END IF;
    DELETE FROM username_holds WHERE username_lower = new_name;
    INSERT INTO usernames (username_lower, owner_type, owner_id, skeleton)
    VALUES (new_name, kind, oid, username_skeleton(new_name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE TRIGGER attorney_profiles_username_sync
  AFTER INSERT OR DELETE OR UPDATE OF username_lower ON "attorney_profiles"
  FOR EACH ROW EXECUTE FUNCTION username_namespace_sync();
CREATE TRIGGER client_profiles_username_sync
  AFTER INSERT OR DELETE OR UPDATE OF username_lower ON "client_profiles"
  FOR EACH ROW EXECUTE FUNCTION username_namespace_sync();
CREATE TRIGGER channels_username_sync
  AFTER INSERT OR DELETE OR UPDATE OF username ON "channels"
  FOR EACH ROW EXECUTE FUNCTION username_namespace_sync();
CREATE TRIGGER chat_groups_username_sync
  AFTER INSERT OR DELETE OR UPDATE OF username_lower ON "chat_groups"
  FOR EACH ROW EXECUTE FUNCTION username_namespace_sync();

-- Existing handles (a clash across tables keeps the first and is left alone).
INSERT INTO usernames (username_lower, owner_type, owner_id, skeleton)
SELECT username_lower, 'user', user_id, username_skeleton(username_lower)
  FROM attorney_profiles WHERE username_lower IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO usernames (username_lower, owner_type, owner_id, skeleton)
SELECT username_lower, 'user', user_id, username_skeleton(username_lower)
  FROM client_profiles WHERE username_lower IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO usernames (username_lower, owner_type, owner_id, skeleton)
SELECT lower(username), 'channel', id, username_skeleton(username)
  FROM channels
ON CONFLICT DO NOTHING;
INSERT INTO usernames (username_lower, owner_type, owner_id, skeleton)
SELECT username_lower, 'group', id, username_skeleton(username_lower)
  FROM chat_groups WHERE username_lower IS NOT NULL
ON CONFLICT DO NOTHING;
