"""Feature vectors of the learned feed rankers, the offline copy.

One spec per feed (owner 25.11: «умную ленту для всех лент»):
  posts  feature_spec.json        (Search «Для вас»; F2)
  reels  feature_spec_reels.json  (the reels feed)
  cases  feature_spec_cases.json  (the attorneys' case feed)

The online copies are apps/api/src/modules/recommendations/ranker/
ranker-features.ts, reels-features.ts and cases-features.ts. Both turn one
logged `features` object of ranking_events into the model's input row by
the same rule; the API's specs run fixtures through both and fail on any
difference. Standard library only, so the parity check needs nothing
installed.

Usage (the parity test): python3 features.py --vectorize rows.json [--feed reels]
  rows.json: a JSON list of objects -> prints a JSON list of vectors,
  missing values as null.
"""

from __future__ import annotations

import json
import math
import os
import sys
from typing import Any, Mapping

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_FILES = {
    "posts": "feature_spec.json",
    "reels": "feature_spec_reels.json",
    "cases": "feature_spec_cases.json",
}
FEEDS = tuple(SPEC_FILES)


def _js_round(x: float) -> float:
    """JavaScript Math.round for x >= 0: nearest integer, a tie goes up.
    Python round() is banker's rounding (2.5 -> 2), and floor(x + 0.5)
    is off for 0.49999999999999994 (the sum rounds to 1.0); x - floor(x)
    is exact for every double, so this is not."""
    r = math.floor(x)
    return float(r + 1 if x - r >= 0.5 else r)


class FeedSpec:
    """One feed's feature list, order, rounding and version."""

    def __init__(self, feed: str, raw: Mapping[str, Any]):
        self.feed = feed
        self.raw = dict(raw)
        self.version: str = raw["version"]
        self.surface: str = raw["surface"]
        self.features: list[str] = list(raw["features"])
        self.scale = 10 ** int(raw["round"])

    def feature_value(self, v: Any) -> float:
        """A finite number -> clamped to 0..1, rounded half up to `round`
        decimals (JavaScript Math.round, the events log's rounding); anything
        else (absent, None, text, a boolean, NaN, inf) -> NaN = missing."""
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return math.nan
        if not math.isfinite(v):
            return math.nan
        c = min(1.0, max(0.0, float(v)))
        return _js_round(c * self.scale) / self.scale

    def vectorize(self, row: Mapping[str, Any] | None) -> list[float]:
        row = row if isinstance(row, Mapping) else {}
        return [self.feature_value(row.get(name)) for name in self.features]


def spec_for(feed: str) -> FeedSpec:
    if feed not in SPEC_FILES:
        raise ValueError(f"unknown feed {feed!r} (one of {', '.join(FEEDS)})")
    with open(os.path.join(HERE, SPEC_FILES[feed]), encoding="utf-8") as fh:
        return FeedSpec(feed, json.load(fh))


# The posts spec under its first names (F2 code and tests use them).
POSTS = spec_for("posts")
SPEC = POSTS.raw
FEATURES: list[str] = POSTS.features
SCALE = POSTS.scale
feature_value = POSTS.feature_value
vectorize = POSTS.vectorize


def _main(argv: list[str]) -> int:
    args = argv[1:]
    feed = "posts"
    if len(args) == 4 and args[2] == "--feed":
        feed = args[3]
        args = args[:2]
    if len(args) != 2 or args[0] != "--vectorize" or feed not in SPEC_FILES:
        print(__doc__, file=sys.stderr)
        return 2
    spec = spec_for(feed)
    with open(args[1], encoding="utf-8") as fh:
        rows = json.load(fh)
    out = [[None if math.isnan(x) else x for x in spec.vectorize(r)] for r in rows]
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
