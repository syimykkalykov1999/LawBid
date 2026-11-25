"""Feature vector of the posts ranker (F2), the offline copy.

The online copy is apps/api/src/modules/recommendations/ranker/ranker-features.ts.
Both turn one logged `features` object of ranking_events into the model's
input row by the same rule; apps/api ranker-features.spec.ts runs a fixture
through both and fails on any difference. Standard library only, so the
parity check needs nothing installed.

Usage (the parity test): python3 features.py --vectorize rows.json
  rows.json: a JSON list of objects -> prints a JSON list of vectors,
  missing values as null.
"""

from __future__ import annotations

import json
import math
import os
import sys
from typing import Any, Mapping

SPEC_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feature_spec.json")

with open(SPEC_PATH, encoding="utf-8") as fh:
    SPEC = json.load(fh)

FEATURES: list[str] = list(SPEC["features"])
SCALE = 10 ** int(SPEC["round"])


def feature_value(v: Any) -> float:
    """A finite number -> clamped to 0..1, rounded half up to SPEC.round
    decimals (JavaScript Math.round, the events log's rounding); anything
    else (absent, None, text, a boolean, NaN, inf) -> NaN = missing."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return math.nan
    if not math.isfinite(v):
        return math.nan
    c = min(1.0, max(0.0, float(v)))
    return _js_round(c * SCALE) / SCALE


def _js_round(x: float) -> float:
    """JavaScript Math.round for x >= 0: nearest integer, a tie goes up.
    Python round() is banker's rounding (2.5 -> 2), and floor(x + 0.5)
    is off for 0.49999999999999994 (the sum rounds to 1.0); x - floor(x)
    is exact for every double, so this is not."""
    r = math.floor(x)
    return float(r + 1 if x - r >= 0.5 else r)


def vectorize(row: Mapping[str, Any] | None) -> list[float]:
    row = row if isinstance(row, Mapping) else {}
    return [feature_value(row.get(name)) for name in FEATURES]


def _main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] != "--vectorize":
        print(__doc__, file=sys.stderr)
        return 2
    with open(argv[2], encoding="utf-8") as fh:
        rows = json.load(fh)
    out = [[None if math.isnan(x) else x for x in vectorize(r)] for r in rows]
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
