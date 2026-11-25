"""Builds the tiny fixture models the API tests load (one per feed).

Synthetic, deterministic impressions -> the same train / export / manifest
code as train.py -> apps/api/test/fixtures/feed-ranker/{model.onnx,
manifest.json, expected.json} (posts) and .../feed-ranker/reels/ and
.../feed-ranker/cases/ for the other feeds. expected.json holds input rows
(logged feature objects, some values missing) and the LightGBM scores of
them, so the API tests prove onnxruntime in Node scores exactly like the
trained model. Run again only when a feature spec or the export changes:

  python make_fixture.py            # posts
  python make_fixture.py --feed reels
  python make_fixture.py --feed cases
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys

import features as feats
import train

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "..", "..", "apps", "api", "test", "fixtures", "feed-ranker")


def out_dir(feed: str) -> str:
    return FIXTURES if feed == "posts" else os.path.join(FIXTURES, feed)


def _posts_row(rnd: random.Random) -> tuple[dict, float]:
    """People open hot, fresh, followed posts more; reels a little more."""
    kinds = ["photo", "reel", "brief"]
    f = {name: round(rnd.random(), 4) for name in feats.FEATURES[:8]}
    kind = kinds[rnd.randrange(3)]
    f["seen"] = 1 if rnd.random() < 0.2 else 0
    f.update({f"kind_{k}": 1 if k == kind else 0 for k in kinds})
    if rnd.random() < 0.1:
        f.pop("affinity")  # an older log row without it: missing
    score = 2 * f["hot"] + f["fresh"] + f["social"] + 0.3 * (kind == "reel") - f["seen"]
    return f, score


def _reels_row(rnd: random.Random) -> tuple[dict, float]:
    """A reel people share and save is watched again; seen ones sink."""
    spec = feats.spec_for("reels")
    f = {name: round(rnd.random(), 4) for name in spec.features}
    f["seen"] = 1 if rnd.random() < 0.25 else 0
    f["own"] = 1 if rnd.random() < 0.05 else 0
    if rnd.random() < 0.15:
        f.pop("length")  # an older upload without its length: missing
    score = (3 * f["shareRate"] + 2 * f["saveRate"] + f["likeRate"]
             + 0.5 * f["interest"] - 1.2 * f["seen"])
    return f, score


def _cases_row(rnd: random.Random) -> tuple[dict, float]:
    """Attorneys bid on their own topics with active clients and few offers."""
    spec = feats.spec_for("cases")
    f = {name: round(rnd.random(), 4) for name in spec.features}
    f["state"] = 1 if rnd.random() < 0.7 else 0
    f["bidOn"] = 1 if rnd.random() < 0.1 else 0
    score = (2 * f["practice"] + f["clientActive"] + f["competition"]
             + 0.5 * f["urgentActive"] - 1.5 * f["bidOn"])
    return f, score


ROWS = {"posts": _posts_row, "reels": _reels_row, "cases": _cases_row}
# Score cut-offs of the graded label, best first (top label = len(cuts)).
CUTS = {"posts": (3.0, 2.6, 2.1), "reels": (4.0, 3.4, 2.8, 2.2), "cases": (3.6, 3.0, 2.4)}
FORMULA = {"posts": "posts-2026-10", "reels": "reels-2026-11", "cases": "cases-2026-10"}


def synthetic(n_lists: int = 60, per_list: int = 12, seed: int = 7,
              feed: str = "posts") -> list[train.Record]:
    rnd = random.Random(seed)
    make, cuts = ROWS[feed], CUTS[feed]
    out: list[train.Record] = []
    for li in range(n_lists):
        for p in range(per_list):
            f, score = make(rnd)
            rel = next((len(cuts) - i for i, c in enumerate(cuts) if score > c), 0)
            out.append(train.Record(f"l{li}", f"p{li}-{p}", p + 1, f, float(li), FORMULA[feed], rel))
    return out


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser()
    a.add_argument("--feed", choices=feats.FEEDS, default="posts")
    feed = a.parse_args(argv).feed
    spec = feats.spec_for(feed)
    args = argparse.Namespace(
        trees=8, learning_rate=0.3, leaves=4, min_child_samples=5, early_stopping=0, seed=7
    )
    lists = train.group_lists(synthetic(feed=feed))
    cut = int(len(lists) * 0.8)
    model = train.train_model(lists[:cut], lists[cut:], args, spec)
    onnx_bytes = train.export_onnx(model, spec)
    x, _, _ = train.matrix(lists[cut:], spec)
    diff = train.onnx_matches(model, onnx_bytes, x)
    metrics = train.evaluate(model, lists[cut:], spec)
    manifest = train.manifest_for(
        model,
        onnx_bytes,
        "fixture",
        {"rows": sum(len(g) for g in lists), "metrics": metrics, "onnx_max_abs_diff": diff},
        spec,
    )
    manifest["trained_at"] = "2026-11-25T00:00:00Z"  # stable file
    if feed == "posts":
        manifest.pop("feed")  # the posts fixture predates the field
    out = out_dir(feed)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "model.onnx"), "wb") as fh:
        fh.write(onnx_bytes)
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    sample = [r.features for g in lists[cut:][:2] for r in g][:16]
    sample.append({})  # every value missing
    import numpy as np

    scores = model.predict(np.array([spec.vectorize(r) for r in sample], dtype=np.float32))
    with open(os.path.join(out, "expected.json"), "w", encoding="utf-8") as fh:
        json.dump({"rows": sample, "scores": [float(s) for s in scores]}, fh, indent=1)
        fh.write("\n")
    print(feed, json.dumps(metrics), "onnx diff", diff, "bytes", len(onnx_bytes))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
