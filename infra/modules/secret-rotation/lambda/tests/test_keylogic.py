import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import keylogic as k  # noqa: E402

A = "a" * 40
B = "b" * 40
DAY = 86400


class KeyLogic(unittest.TestCase):
    def test_parse_and_format_roundtrip(self):
        v = f"j1:{A},j2:{B}"
        self.assertEqual(k.format_keys(k.parse_keys(v)), v)

    def test_kms_entries_keep_colons(self):
        v = f"m1:{A},m2:kms:QUJD"
        self.assertEqual(k.parse_keys(v)[1], ("m2", "kms:QUJD"))
        self.assertTrue(k.any_wrapped(v))
        self.assertFalse(k.any_wrapped(f"m1:{A}"))

    def test_malformed(self):
        for bad in ["j1", "j1:", ":x"]:
            with self.assertRaises(ValueError):
                k.parse_keys(bad)

    def test_next_kid(self):
        self.assertEqual(k.next_kid(["j1"]), "j2")
        self.assertEqual(k.next_kid(["j1", "j2", "j3"]), "j4")
        self.assertEqual(k.next_kid(["m1", "m2"]), "m3")
        self.assertEqual(k.next_kid(["j3", "j1"]), "j4")
        self.assertEqual(k.next_kid(["old"]), "oldn")
        self.assertEqual(k.next_kid([]), "kn")

    def test_new_secret_is_long_and_safe(self):
        s = k.new_secret()
        self.assertGreaterEqual(len(s), 32)
        self.assertNotIn(",", s)
        self.assertNotIn(":", s)

    def test_append_keeps_old_keys_first_and_newest_last(self):
        out = k.append_key(f"j1:{A}", "j2", B)
        self.assertEqual(k.kids(out), ["j1", "j2"])
        self.assertEqual(k.newest_kid(out), "j2")
        with self.assertRaises(ValueError):
            k.append_key(out, "j2", B)

    def test_validate_rotated(self):
        old = f"j1:{A}"
        k.validate_rotated(old, k.append_key(old, "j2", B))
        with self.assertRaises(ValueError):
            k.validate_rotated(old, f"j2:{B}")  # replaced, not added
        with self.assertRaises(ValueError):
            k.validate_rotated(old, f"j1:{B},j2:{A}")  # old key changed
        with self.assertRaises(ValueError):
            k.validate_rotated(old, old)

    def test_promote_only_after_grace(self):
        self.assertFalse(k.should_promote(1000, 1000 + 3599, 3600))
        self.assertTrue(k.should_promote(1000, 1000 + 3600, 3600))

    def test_prune_keeps_active_newest_and_unexpired(self):
        v = f"j1:{A},j2:{B},j3:{A}"
        # j1 retired long ago, j2 retired 1 day ago; overlap is 2 days
        out = k.prune_expired(v, "j3", {"j1": 0, "j2": 2 * DAY}, 3 * DAY, 2 * DAY)
        self.assertEqual(k.kids(out), ["j2", "j3"])

    def test_prune_never_drops_active_even_if_old(self):
        v = f"j1:{A},j2:{B}"
        out = k.prune_expired(v, "j1", {"j1": 0}, 99 * DAY, DAY)
        self.assertEqual(k.kids(out), ["j1", "j2"])

    def test_prune_respects_min_keep(self):
        v = f"j1:{A},j2:{B}"
        out = k.prune_expired(v, "j2", {"j1": 0}, 99 * DAY, DAY, min_keep=2)
        self.assertEqual(k.kids(out), ["j1", "j2"])

    def test_prune_ignores_kids_without_retire_time(self):
        v = f"j1:{A},j2:{B},j3:{A}"
        out = k.prune_expired(v, "j3", {}, 99 * DAY, DAY)
        self.assertEqual(k.kids(out), ["j1", "j2", "j3"])

    def test_remove_kid_guards(self):
        v = f"m1:{A},m2:{B},m3:{A}"
        self.assertEqual(k.kids(k.remove_kid(v, "m1", "m2")), ["m2", "m3"])
        with self.assertRaises(ValueError):
            k.remove_kid(v, "m2", "m2")
        with self.assertRaises(ValueError):
            k.remove_kid(v, "m3", "m2")
        with self.assertRaises(ValueError):
            k.remove_kid(v, "zz", "m2")

    def test_rotation_status(self):
        s = k.rotation_status(0, 0, 30, 31 * DAY, slack_days=3)
        self.assertEqual(s["nextDue"], 30 * DAY)
        self.assertFalse(s["overdue"])
        self.assertTrue(k.rotation_status(0, 0, 30, 34 * DAY)["overdue"])
        self.assertEqual(k.rotation_status(None, 5 * DAY, 30, 6 * DAY)["nextDue"], 35 * DAY)
        self.assertFalse(k.rotation_status(None, None, 30, 6 * DAY)["overdue"])

    def test_db_url_swap_keeps_host_and_query(self):
        old = "postgresql://lawbid_app:old%40pw@db.x.rds.amazonaws.com:5432/lawbid?sslmode=require&connection_limit=5"
        new = k.db_url_with_credentials(old, "lawbid_app_clone", "p@ss/w:rd")
        self.assertEqual(
            new,
            "postgresql://lawbid_app_clone:p%40ss%2Fw%3Ard@db.x.rds.amazonaws.com:5432/lawbid?sslmode=require&connection_limit=5",
        )

    def test_db_json_from_url(self):
        j = k.db_json_from_url("postgresql://u:p%40w@h.example:6543/app?x=1", "arn:m")
        self.assertEqual(j["username"], "u")
        self.assertEqual(j["password"], "p@w")
        self.assertEqual(j["host"], "h.example")
        self.assertEqual(j["port"], 6543)
        self.assertEqual(j["dbname"], "app")
        self.assertEqual(j["masterarn"], "arn:m")
        with self.assertRaises(ValueError):
            k.db_json_from_url("postgresql://h/app", "arn:m")

    def test_redis_url_token_swap(self):
        old = "rediss://:oldtoken@primary.x.cache.amazonaws.com:6379"
        self.assertEqual(k.redis_url_token(old), "oldtoken")
        new = k.redis_url_with_token(old, "newToken1")
        self.assertEqual(new, "rediss://:newToken1@primary.x.cache.amazonaws.com:6379")
        t = k.new_redis_token()
        self.assertTrue(t.isalnum() and len(t) == 48)


if __name__ == "__main__":
    unittest.main()
