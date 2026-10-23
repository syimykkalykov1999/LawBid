#!/usr/bin/env python3
"""Audit #15 (2026-10-22): the localization and colour checks of
mobile-ci.yml are BLOCKING, against a baseline of the findings that
already existed when they became blocking.

  python3 tool/ci/hardcoded_check.py            # check (run from apps/mobile)
  python3 tool/ci/hardcoded_check.py --update   # rewrite the baselines

- strings: `Text('…')` / `Text.rich('…')` with a literal under lib/
  (file 01 §9.4: every user-visible string comes from the l10n files).
- colors: `Colors.x` / `Color(0x…)` outside lib/core/design_system/
  (file 01 §8.1: colours come from the design system).

A finding not in tool/ci/hardcoded_<kind>.allow fails CI. Fix it (an l10n
key / a design-system colour). Only when a literal is genuinely not
user text (a brand name, a debug screen) add its line to the .allow file
by hand: `<path>\t<the trimmed source line>`; one line per occurrence.
`--update` re-creates both files from the current code — use it only to
drop fixed entries, and review the diff: it would also accept new ones.
Matching ignores line numbers, so moving code does not break the check.
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # apps/mobile
LIB = ROOT / "lib"
HERE = Path(__file__).resolve().parent

CHECKS = {
    "strings": (re.compile(r"""Text(\.rich)?\(\s*['"]"""), lambda p: True),
    "colors": (
        re.compile(r"(?<![A-Za-z])Colors\.[a-zA-Z]+|Color\(0x"),  # not ChatColors.
        lambda p: not p.startswith("lib/core/design_system/"),
    ),
}


def scan(pattern: re.Pattern[str], keep) -> Counter[str]:
    found: Counter[str] = Counter()
    for f in sorted(LIB.rglob("*.dart")):
        rel = f.relative_to(ROOT).as_posix()
        if rel.endswith((".g.dart", ".freezed.dart")) or not keep(rel):
            continue
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if pattern.search(line):
                found[f"{rel}\t{line.strip()}"] += 1
    return found


def read_allow(kind: str) -> Counter[str]:
    path = HERE / f"hardcoded_{kind}.allow"
    if not path.exists():
        return Counter()
    lines = path.read_text(encoding="utf-8").splitlines()
    return Counter(l for l in lines if l and not l.startswith("#"))


def write_allow(kind: str, found: Counter[str]) -> None:
    header = (
        f"# Baseline of hardcoded {kind} (tool/ci/hardcoded_check.py, audit #15).\n"
        "# <path>\\t<trimmed line>, one per occurrence. Shrink it, do not grow it.\n"
    )
    body = "".join(f"{k}\n" * n for k, n in sorted(found.items()))
    (HERE / f"hardcoded_{kind}.allow").write_text(header + body, encoding="utf-8")


def main() -> int:
    update = "--update" in sys.argv
    failed = False
    for kind, (pattern, keep) in CHECKS.items():
        found = scan(pattern, keep)
        if update:
            write_allow(kind, found)
            print(f"{kind}: baseline written ({sum(found.values())} occurrences)")
            continue
        allowed = read_allow(kind)
        new = found - allowed
        gone = allowed - found
        for key, n in sorted(new.items()):
            path, line = key.split("\t", 1)
            for _ in range(n):
                print(f"::error file=apps/mobile/{path}::hardcoded {kind[:-1]}: {line}")
        if new:
            failed = True
            print(
                f"{kind}: {sum(new.values())} new hardcoded {kind} — use l10n / the design "
                f"system, or see the header of tool/ci/hardcoded_check.py to allow one."
            )
        else:
            print(f"{kind}: OK ({sum(found.values())} baseline occurrences left)")
        if gone:
            print(
                f"{kind}: {sum(gone.values())} baseline entries are fixed — "
                "run `python3 tool/ci/hardcoded_check.py --update` and commit to shrink the baseline."
            )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
