"""Pure helpers for the app key lists ("kid:secret,kid:kms:<b64>,...").

No AWS calls here, so the overlap rules are unit-tested
(tests/test_keylogic.py). Convention shared with the app
(apps/api/src/config/env.schema.ts, kms-env.ts): every listed kid verifies /
decrypts, the ACTIVE kid (a separate value) signs / encrypts. A new key is
appended at the END of the list, so the newest kid is always the last one.
"""
import re
import secrets as _secrets
from typing import Dict, List, Optional, Tuple

KMS_PREFIX = "kms:"


def parse_keys(value: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for pair in (value or "").split(","):
        pair = pair.strip()
        if not pair:
            continue
        kid, sep, secret = pair.partition(":")
        if not kid or not sep or not secret:
            raise ValueError("malformed key entry (need kid:secret)")
        out.append((kid, secret))
    return out


def format_keys(entries: List[Tuple[str, str]]) -> str:
    return ",".join(f"{kid}:{secret}" for kid, secret in entries)


def kids(value: str) -> List[str]:
    return [k for k, _ in parse_keys(value)]


def newest_kid(value: str) -> Optional[str]:
    ks = kids(value)
    return ks[-1] if ks else None


_KID_RE = re.compile(r"([A-Za-z_-]*?)(\d+)")


def next_kid(existing: List[str]) -> str:
    """j1,j2 -> j3 ; k1 -> k2 ; unusual names -> '<last>n'. Never reuses a kid."""
    best: Optional[Tuple[int, str]] = None
    for k in existing:
        m = _KID_RE.fullmatch(k)
        if m:
            n = int(m.group(2))
            if best is None or n >= best[0]:
                best = (n, m.group(1))
    if best is None:
        cand = f"{existing[-1] if existing else 'k'}n"
        while cand in existing:
            cand += "n"
        return cand
    n, prefix = best
    while f"{prefix}{n + 1}" in existing:
        n += 1
    return f"{prefix}{n + 1}"


def new_secret() -> str:
    # 48 URL-safe chars: >= 32 as the app requires, no ',' or ':'.
    return _secrets.token_urlsafe(36)


def any_wrapped(value: str) -> bool:
    return any(s.startswith(KMS_PREFIX) for _, s in parse_keys(value))


def append_key(value: str, kid: str, stored_secret: str) -> str:
    entries = parse_keys(value)
    if any(k == kid for k, _ in entries):
        raise ValueError("kid already exists")
    entries.append((kid, stored_secret))
    return format_keys(entries)


def validate_rotated(old_value: str, new_value: str) -> None:
    """Rotation must only ADD one key and keep every old one (overlap)."""
    old, new = parse_keys(old_value), parse_keys(new_value)
    if len(new) != len(old) + 1:
        raise ValueError("rotation must add exactly one key")
    if new[: len(old)] != old:
        raise ValueError("rotation changed or reordered an existing key")


def should_promote(first_seen_at: float, now: float, grace_seconds: float) -> bool:
    """The new kid may become ACTIVE only after every task could have
    restarted and learned it (grace), never before."""
    return now >= first_seen_at + grace_seconds


def prune_expired(
    value: str,
    active_kid: str,
    retired_at: Dict[str, float],
    now: float,
    retire_after_seconds: float,
    min_keep: int = 2,
) -> str:
    """Drop retired kids whose overlap ended. Never drops the active or the
    newest kid and never leaves fewer than min_keep keys."""
    entries = parse_keys(value)
    newest = entries[-1][0] if entries else None
    kept = list(entries)
    for kid, _ in entries:
        if kid in (active_kid, newest):
            continue
        t = retired_at.get(kid)
        if t is None or now < t + retire_after_seconds:
            continue
        if len(kept) <= min_keep:
            break
        kept = [e for e in kept if e[0] != kid]
    return format_keys(kept)


def remove_kid(value: str, kid: str, active_kid: str) -> str:
    entries = parse_keys(value)
    if kid == active_kid:
        raise ValueError("cannot remove the active kid")
    if kid == entries[-1][0]:
        raise ValueError("cannot remove the newest kid")
    if all(k != kid for k, _ in entries):
        raise ValueError("kid not found")
    return format_keys([e for e in entries if e[0] != kid])


def rotation_status(
    last_rotated: Optional[float],
    created: Optional[float],
    every_days: int,
    now: float,
    slack_days: int = 3,
) -> Dict[str, object]:
    """next_due / overdue for one secret (timestamps in epoch seconds)."""
    base = last_rotated if last_rotated is not None else created
    next_due = base + every_days * 86400 if base is not None else None
    overdue = next_due is not None and now > next_due + slack_days * 86400
    return {"lastRotated": last_rotated, "nextDue": next_due, "overdue": overdue}


def db_url_with_credentials(old_url: str, username: str, password: str) -> str:
    """Keep host / port / db / query of the existing DATABASE_URL, swap only
    user and password (percent-encoded)."""
    from urllib.parse import quote, urlsplit, urlunsplit

    p = urlsplit(old_url)
    host = p.netloc.rpartition("@")[2]
    netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{host}"
    return urlunsplit((p.scheme, netloc, p.path, p.query, p.fragment))


def db_json_from_url(url: str, master_arn: str) -> Dict[str, object]:
    """Standard RDS secret JSON (what the AWS rotation template expects)."""
    from urllib.parse import unquote, urlsplit

    p = urlsplit(url)
    if not p.username or not p.password or not p.hostname:
        raise ValueError("DATABASE_URL has no user, password or host")
    return {
        "engine": "postgres",
        "host": p.hostname,
        "port": p.port or 5432,
        "username": unquote(p.username),
        "password": unquote(p.password),
        "dbname": p.path.lstrip("/") or "postgres",
        "masterarn": master_arn,
    }


def redis_url_token(url: str) -> str:
    from urllib.parse import unquote, urlsplit

    pw = urlsplit(url).password
    if not pw:
        raise ValueError("redis url has no password")
    return unquote(pw)


def redis_url_with_token(url: str, token: str) -> str:
    from urllib.parse import quote, urlsplit, urlunsplit

    p = urlsplit(url)
    host = p.netloc.rpartition("@")[2]
    return urlunsplit((p.scheme, f":{quote(token, safe='')}@{host}", p.path, p.query, p.fragment))


def new_redis_token() -> str:
    # ElastiCache: 16-128 printable chars, no @ " /. Alphanumeric only.
    import string

    alphabet = string.ascii_letters + string.digits
    return "".join(_secrets.choice(alphabet) for _ in range(48))
