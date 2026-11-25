"""Builds the tiny fixture model the API tests load (F2).

Synthetic, deterministic impressions -> the same train / export / manifest
code as train.py -> apps/api/test/fixtures/feed-ranker/{model.onnx,
manifest.json, expected.json}. expected.json holds input rows (logged
feature objects, some values missing) and the LightGBM scores of them, so
the API test proves onnxruntime in Node scores exactly like the trained
model. Run again only when the feature spec or the export changes:

  python make_fixture.py
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
OUT = os.path.join(HERE, "..", "..", "apps", "api", "test", "fixtures", "feed-ranker")


def synthetic(n_lists: int = 60, per_list: int = 12, seed: int = 7) -> list[train.Record]:
    """People open hot, fresh, followed posts more; reels a little more."""
    rnd = random.Random(seed)
    kinds = ["photo", "reel", "brief"]
    out: list[train.Record] = []
    for li in range(n_lists):
        for p in range(per_list):
            f = {name: round(rnd.random(), 4) for name in feats.FEATURES[:8]}
            kind = kinds[rnd.randrange(3)]
            f["seen"] = 1 if rnd.random() < 0.2 else 0
            f.update({f"kind_{k}": 1 if k == kind else 0 for k in kinds})
            if rnd.random() < 0.1:
                f.pop("affinity")  # an older log row without it: missing
            score = 2 * f["hot"] + f["fresh"] + f["social"] + 0.3 * (kind == "reel") - f["seen"]
            rel = 3 if score > 3 else 2 if score > 2.6 else 1 if score > 2.1 else 0
            out.append(train.Record(f"l{li}", f"p{li}-{p}", p + 1, f, float(li), "posts-2026-10", rel))
    return out


def main() -> int:
    args = argparse.Namespace(
        trees=8, learning_rate=0.3, leaves=4, min_child_samples=5, early_stopping=0, seed=7
    )
    lists = train.group_lists(synthetic())
    cut = int(len(lists) * 0.8)
    model = train.train_model(lists[:cut], lists[cut:], args)
    onnx_bytes = train.export_onnx(model)
    x, _, _ = train.matrix(lists[cut:])
    diff = train.onnx_matches(model, onnx_bytes, x)
    metrics = train.evaluate(model, lists[cut:])
    manifest = train.manifest_for(
        model,
        onnx_bytes,
        "fixture",
        {"rows": sum(len(g) for g in lists), "metrics": metrics, "onnx_max_abs_diff": diff},
    )
    manifest["trained_at"] = "2026-11-25T00:00:00Z"  # stable file
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "model.onnx"), "wb") as fh:
        fh.write(onnx_bytes)
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    sample = [r.features for g in lists[cut:][:2] for r in g][:16]
    sample.append({})  # every value missing
    import numpy as np

    scores = model.predict(np.array([feats.vectorize(r) for r in sample], dtype=np.float32))
    with open(os.path.join(OUT, "expected.json"), "w", encoding="utf-8") as fh:
        json.dump({"rows": sample, "scores": [float(s) for s in scores]}, fh, indent=1)
        fh.write("\n")
    print(json.dumps(metrics), "onnx diff", diff, "bytes", len(onnx_bytes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
