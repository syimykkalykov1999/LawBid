"""Offline training of the learned feed rankers: LightGBM LambdaMART -> ONNX.

Two-stage ranking like Instagram / TikTok / YouTube: the API's formula
picks and orders the candidates (stage 1); a model re-orders the best N of
them for each viewer (stage 2). One model per feed (--feed), each with its
own features (features.py, feature_spec*.json) and labels, learned from
ranking_events: the impressions of that feed (each with the 0..1 features
the API saw) and what the viewer then did with the item.

  --feed posts (default; Search «Для вас», surface `posts`):
    3 = saved it, 2 = liked it, 1 = opened it, 0 = nothing (24 h)
  --feed reels (the reels feed, surface `reels`):
    4 = shared it, 3 = saved it, 2 = liked it,
    1 = watched it (3 s of real playback, or opened), 0 = scrolled past (24 h)
  --feed cases (the attorneys' case feed, surface `case_feed`):
    3 = hired on it (offer made within 7 days, accepted), 2 = made an offer
    (within 7 days), 1 = opened it, 0 = nothing

Usage
  # straight from the database (read replica; read-only queries):
  python train.py --feed reels --dsn "$RANKER_TRAIN_DSN" --days 30 --out out
  # or from an export (one JSON object per line, see Record below):
  python train.py --feed cases --input events.jsonl --out out
  # the live A/B test once a model runs (model arm vs the formula):
  python train.py --feed posts --report --dsn "$RANKER_TRAIN_DSN" --days 14

Writes out/<version>/model.onnx and out/<version>/manifest.json and prints
where to put them (S3 key) and which admin setting to change. It uploads
nothing and changes nothing by itself.

Exit codes: 0 model written; 3 not enough data yet (nothing written);
4 the ONNX copy does not score like the LightGBM model (nothing written).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Iterable

import features as feats

K = 10
INPUT_NAME = "features"
# Opset 15: the newest the converter (onnxmltools 1.16) supports;
# onnxruntime-web 1.31 runs it (TreeEnsembleRegressor, ai.onnx.ml v1).
ONNX_OPSET = 15


@dataclass
class Record:
    """One impression with what the viewer did with it."""

    list_id: str
    item_id: str
    position: int
    features: dict[str, Any]
    t: float
    formula_version: str
    relevance: int


# --------------------------------------------------------------------------
# data


SQL_HEAD = """
WITH imp AS (
  SELECT list_id, item_id, user_id, position, features, created_at,
         COALESCE(formula_version, '') AS formula_version
    FROM ranking_events
   WHERE kind = 'impression' AND surface = %s
     AND features IS NOT NULL AND list_id IS NOT NULL AND user_id IS NOT NULL
     AND item_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND created_at >= now() - make_interval(days => %s)
), clk AS (
  SELECT DISTINCT list_id, item_id
    FROM ranking_events
   WHERE kind = 'click' AND surface = %s
     AND created_at >= now() - make_interval(days => %s)
)
SELECT imp.list_id, imp.item_id, imp.position, imp.features::text,
       EXTRACT(EPOCH FROM imp.created_at)::float8, imp.formula_version,
       CASE
"""

SQL_TAIL = """
         ELSE 0
       END AS relevance
  FROM imp LEFT JOIN clk ON clk.list_id = imp.list_id AND clk.item_id = imp.item_id
 ORDER BY imp.created_at
"""

_DAY = "imp.created_at AND imp.created_at + interval '1 day'"
_WEEK = "imp.created_at AND imp.created_at + interval '7 days'"
_SAVED = f"""WHEN EXISTS (SELECT 1 FROM saved_items s
                       WHERE s.user_id = imp.user_id AND s.item_type = 'post'
                         AND s.item_id = imp.item_id::uuid
                         AND s.created_at BETWEEN {_DAY})"""
_LIKED = f"""WHEN EXISTS (SELECT 1 FROM post_likes l
                       WHERE l.user_id = imp.user_id AND l.post_id = imp.item_id::uuid
                         AND l.created_at BETWEEN {_DAY})"""

# The relevance label of each feed (graded, best first).
LABELS = {
    "posts": f"""
         {_SAVED} THEN 3
         {_LIKED} THEN 2
         WHEN clk.list_id IS NOT NULL THEN 1""",
    "reels": f"""
         WHEN EXISTS (SELECT 1 FROM post_shares sh
                       WHERE sh.user_id = imp.user_id AND sh.post_id = imp.item_id::uuid
                         AND sh.created_at BETWEEN {_DAY}) THEN 4
         {_SAVED} THEN 3
         {_LIKED} THEN 2
         WHEN clk.list_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM post_view_events v
                       WHERE v.viewer_id = imp.user_id AND v.post_id = imp.item_id::uuid
                         AND v.kind = 'view'
                         AND v.created_at BETWEEN {_DAY}) THEN 1""",
    "cases": f"""
         WHEN EXISTS (SELECT 1 FROM bids b
                       WHERE b.attorney_id = imp.user_id AND b.case_id = imp.item_id::uuid
                         AND b.status = 'accepted'
                         AND b.created_at BETWEEN {_WEEK}) THEN 3
         WHEN EXISTS (SELECT 1 FROM bids b
                       WHERE b.attorney_id = imp.user_id AND b.case_id = imp.item_id::uuid
                         AND b.created_at BETWEEN {_WEEK}) THEN 2
         WHEN clk.list_id IS NOT NULL THEN 1""",
}

# What the API calls each feed's test and where its model lives.
FEED_RUNTIME = {
    "posts": {"experiment": "post_ranker", "dir": "ml/feed-ranker", "setting": "reco.ranker"},
    "reels": {"experiment": "reel_ranker", "dir": "ml/feed-ranker/reels", "setting": "reco.ranker.reels"},
    "cases": {"experiment": "case_ranker", "dir": "ml/feed-ranker/cases", "setting": "reco.ranker.cases"},
}


def label_sql(feed: str) -> str:
    return SQL_HEAD + LABELS[feed] + SQL_TAIL


# Posts query under its first name.
SQL = label_sql("posts")


def load_db(dsn: str, days: int, surface: str, feed: str = "posts") -> list[Record]:
    conn = connect(dsn)
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute(label_sql(feed), (surface, days, surface, days))
        return [
            Record(r[0], r[1], int(r[2] or 0), json.loads(r[3]), float(r[4]), r[5], int(r[6]))
            for r in cur.fetchall()
        ]
    finally:
        conn.close()


REPORT_SQL = """
SELECT variant,
       COUNT(*) FILTER (WHERE kind = 'impression') AS impressions,
       COUNT(*) FILTER (WHERE kind = 'click') AS clicks,
       COUNT(*) FILTER (WHERE kind = 'impression' AND position <= %s) AS top_impressions,
       COUNT(*) FILTER (WHERE kind = 'click' AND position <= %s) AS top_clicks
  FROM ranking_events
 WHERE experiment_key = %s AND surface = %s
   AND created_at >= now() - make_interval(days => %s)
 GROUP BY variant
 ORDER BY variant
"""


def wilson(clicks: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    if n <= 0:
        return (0.0, 0.0)
    p = clicks / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def connect(dsn: str):
    # pg8000: pure-Python PostgreSQL driver, BSD-3-Clause.
    import urllib.parse

    import pg8000.dbapi

    u = urllib.parse.urlparse(dsn)
    return pg8000.dbapi.connect(
        user=urllib.parse.unquote(u.username or ""),
        password=urllib.parse.unquote(u.password or ""),
        host=u.hostname or "localhost",
        port=u.port or 5432,
        database=(u.path or "/").lstrip("/"),
        ssl_context=None if "sslmode=disable" in (u.query or "") else True,
    )


def report(dsn: str, days: int, surface: str, feed: str = "posts") -> int:
    """The live A/B test of [feed] (post_ranker / reel_ranker /
    case_ranker): CTR of the model arm vs the control arm (the formula),
    with 95% intervals. Read-only."""
    key = FEED_RUNTIME[feed]["experiment"]
    conn = connect(dsn)
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute(REPORT_SQL, (K, K, key, surface, days))
        rows = cur.fetchall()
    finally:
        conn.close()
    if not rows:
        print(f"No {key} impressions yet.")
        return 0
    for variant, imp, clk, timp, tclk in rows:
        lo, hi = wilson(int(tclk), int(timp))
        ctr = (int(tclk) / int(timp)) if timp else 0.0
        print(f"{variant}: impressions {imp}, clicks {clk}, CTR@{K} {ctr:.4f} "
              f"(95% {lo:.4f}..{hi:.4f})")
    return 0


def load_jsonl(path: str) -> list[Record]:
    out: list[Record] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            out.append(
                Record(
                    str(o["list_id"]),
                    str(o["item_id"]),
                    int(o.get("position") or 0),
                    o.get("features") or {},
                    float(o.get("t") or 0),
                    str(o.get("formula_version") or ""),
                    int(o.get("relevance") or 0),
                )
            )
    return out


def group_lists(records: Iterable[Record]) -> list[list[Record]]:
    """Impressions grouped by list, items in the order shown, lists by time."""
    by: dict[str, list[Record]] = {}
    for r in records:
        by.setdefault(r.list_id, []).append(r)
    lists = [sorted(v, key=lambda r: r.position) for v in by.values() if len(v) >= 2]
    lists.sort(key=lambda g: (min(r.t for r in g), g[0].list_id))
    return lists


# --------------------------------------------------------------------------
# metrics (the same NDCG as apps/api experiment-math.ts ndcgAtK)


def ndcg_at_k(relevances: list[int], k: int = K) -> float:
    def dcg(rs: list[int]) -> float:
        return sum((2**r - 1) / math.log2(i + 2) for i, r in enumerate(rs[:k]))

    best = dcg(sorted(relevances, reverse=True))
    return dcg(relevances) / best if best > 0 else 0.0


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


# --------------------------------------------------------------------------
# model


def matrix(lists: list[list[Record]], spec: feats.FeedSpec = feats.POSTS):
    import numpy as np

    rows = [spec.vectorize(r.features) for g in lists for r in g]
    x = np.array(rows, dtype=np.float32).reshape(-1, len(spec.features))
    y = np.array([r.relevance for g in lists for r in g], dtype=np.int32)
    return x, y, [len(g) for g in lists]


def train_model(train: list[list[Record]], valid: list[list[Record]], args,
                spec: feats.FeedSpec = feats.POSTS) -> Any:
    import lightgbm as lgb

    x, y, g = matrix(train, spec)
    vx, vy, vg = matrix(valid, spec)
    model = lgb.LGBMRanker(
        objective="lambdarank",
        n_estimators=args.trees,
        learning_rate=args.learning_rate,
        num_leaves=args.leaves,
        min_child_samples=args.min_child_samples,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.9,
        deterministic=True,
        force_row_wise=True,
        seed=args.seed,
        verbose=-1,
    )
    callbacks = [lgb.early_stopping(args.early_stopping, verbose=False)] if args.early_stopping else []
    model.fit(
        x,
        y,
        group=g,
        # LightGBM 4.7: eval_X / eval_y replace the deprecated eval_set.
        eval_X=(vx,),
        eval_y=(vy,),
        eval_group=[vg],
        eval_at=[K],
        callbacks=callbacks,
    )
    return model


def export_onnx(model: Any, spec: feats.FeedSpec = feats.POSTS) -> bytes:
    from onnxmltools import convert_lightgbm
    from onnxmltools.convert.common.data_types import FloatTensorType

    onx = convert_lightgbm(
        model,
        initial_types=[(INPUT_NAME, FloatTensorType([None, len(spec.features)]))],
        target_opset=ONNX_OPSET,
        zipmap=False,
    )
    round_thresholds_down(onx, model)
    return onx.SerializeToString()


def round_thresholds_down(onx: Any, model: Any) -> None:
    """Make the float32 ONNX trees branch exactly like LightGBM's double ones.

    LightGBM compares double(x) <= t with a double threshold t; the ONNX
    TreeEnsemble keeps thresholds as float32, and the converter rounds t to
    the NEAREST float32. When that rounds up onto a value x the data really
    has, x goes left in ONNX and right in LightGBM (seen: x = 0.7986f,
    t = 0.79859998822, float32(t) = 0.7986f; one score off by 0.002). The
    skl2onnx docs call this "Issues when switching to float". For a float32
    x, x <= t holds exactly when x <= the largest float32 not above t, so
    each threshold is replaced by that value: the same branch for every
    float32 input, hence the same score up to float32 sums.
    """
    import numpy as np

    want: dict[tuple[int, int, float], set[float]] = {}

    def walk(n: dict[str, Any], tree: int) -> None:
        if "split_feature" not in n:
            return
        if n.get("decision_type", "<=") != "<=":
            raise ValueError(f"unsupported split {n.get('decision_type')}")
        t = float(n["threshold"])
        near = np.float32(t)
        down = near if float(near) <= t else np.nextafter(near, np.float32(-np.inf))
        want.setdefault((tree, int(n["split_feature"]), float(near)), set()).add(float(down))
        walk(n["left_child"], tree)
        walk(n["right_child"], tree)

    for i, info in enumerate(model.booster_.dump_model()["tree_info"]):
        walk(info["tree_structure"], i)

    nodes = [n for n in onx.graph.node if n.op_type == "TreeEnsembleRegressor"]
    if len(nodes) != 1:
        raise ValueError("expected one TreeEnsembleRegressor")
    attrs = {a.name: a for a in nodes[0].attribute}
    trees = list(attrs["nodes_treeids"].ints)
    features = list(attrs["nodes_featureids"].ints)
    modes = list(attrs["nodes_modes"].strings)
    values = list(attrs["nodes_values"].floats)
    for k, mode in enumerate(modes):
        if mode == b"LEAF":
            continue
        choice = want.get((trees[k], features[k], values[k]))
        if not choice or len(choice) != 1:
            raise ValueError(f"threshold of tree {trees[k]} node {k} not matched")
        values[k] = next(iter(choice))
    del attrs["nodes_values"].floats[:]
    attrs["nodes_values"].floats.extend(values)


def onnx_matches(model: Any, onnx_bytes: bytes, x, tol: float = 1e-4) -> float:
    """Largest |LightGBM - ONNX| over [x]; raises when above [tol]."""
    import numpy as np
    import onnxruntime as ort

    sess = ort.InferenceSession(onnx_bytes, providers=["CPUExecutionProvider"])
    got = sess.run(None, {INPUT_NAME: x})[0].reshape(-1)
    want = model.predict(x)
    diff = float(np.max(np.abs(got - want))) if len(want) else 0.0
    if diff > tol:
        raise ValueError(f"ONNX differs from LightGBM by {diff} (> {tol})")
    return diff


def model_order(model: Any, g: list[Record], spec: feats.FeedSpec = feats.POSTS) -> list[int]:
    import numpy as np

    x = np.array([spec.vectorize(r.features) for r in g], dtype=np.float32)
    s = model.predict(x)
    order = sorted(range(len(g)), key=lambda i: (-float(s[i]), g[i].position))
    return [g[i].relevance for i in order]


def evaluate(model: Any, valid: list[list[Record]],
             spec: feats.FeedSpec = feats.POSTS) -> dict[str, Any]:
    """NDCG@K of the order people saw (the formula) vs the model's order, on
    the validation lists served by the formula where somebody did something."""
    judged = [
        g
        for g in valid
        if any(r.relevance > 0 for r in g) and not g[0].formula_version.startswith("ranker:")
    ]
    formula = [ndcg_at_k([r.relevance for r in g]) for g in judged]
    learned = [ndcg_at_k(model_order(model, g, spec)) for g in judged]
    return {
        "k": K,
        "judged_lists": len(judged),
        "ndcg_formula": round(mean(formula), 6),
        "ndcg_model": round(mean(learned), 6),
    }


def manifest_for(model: Any, onnx_bytes: bytes, version: str, info: dict[str, Any],
                 spec: feats.FeedSpec = feats.POSTS) -> dict[str, Any]:
    import lightgbm
    import onnxmltools

    return {
        "version": version,
        "feed": spec.feed,
        "feature_spec_version": spec.version,
        "features": spec.features,
        "input_name": INPUT_NAME,
        "sha256": hashlib.sha256(onnx_bytes).hexdigest(),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "libs": {"lightgbm": lightgbm.__version__, "onnxmltools": onnxmltools.__version__},
        "trees": int(model.booster_.num_trees()),
        **info,
    }


def write_artifact(out_dir: str, version: str, onnx_bytes: bytes, manifest: dict[str, Any]) -> str:
    d = os.path.join(out_dir, version)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "model.onnx"), "wb") as fh:
        fh.write(onnx_bytes)
    with open(os.path.join(d, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return d


# --------------------------------------------------------------------------


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--dsn", help="postgresql:// URL of the read replica")
    src.add_argument("--input", help="JSON lines export instead of the database")
    p.add_argument("--feed", choices=feats.FEEDS, default="posts",
                   help="which feed's model: posts (Search «Для вас»), reels, cases")
    p.add_argument("--report", action="store_true",
                   help="print the live A/B result (model vs formula) instead of training")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--surface", default=None,
                   help="ranking_events surface (default: the feed's own)")
    p.add_argument("--out", default="out")
    p.add_argument("--version", default="r" + time.strftime("%Y%m%d%H%M", time.gmtime()))
    p.add_argument("--valid-share", type=float, default=0.2)
    p.add_argument("--min-judged-lists", type=int, default=200)
    p.add_argument("--trees", type=int, default=300)
    p.add_argument("--learning-rate", type=float, default=0.05)
    p.add_argument("--leaves", type=int, default=31)
    p.add_argument("--min-child-samples", type=int, default=20)
    p.add_argument("--early-stopping", type=int, default=30)
    p.add_argument("--seed", type=int, default=7)
    a = p.parse_args(argv)
    if len("ranker:" + a.version) > 32:
        p.error("--version: at most 25 characters (ranking_events.formula_version is 32)")
    a.spec = feats.spec_for(a.feed)
    a.surface = a.surface or a.spec.surface
    return a


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.report:
        if not args.dsn:
            print("--report needs --dsn")
            return 2
        return report(args.dsn, args.days, args.surface, args.feed)
    spec = args.spec
    records = (load_db(args.dsn, args.days, args.surface, args.feed)
               if args.dsn else load_jsonl(args.input))
    lists = group_lists(records)
    cut = int(len(lists) * (1 - args.valid_share))
    train = [g for g in lists[:cut] if any(r.relevance > 0 for r in g)]
    valid = lists[cut:]
    judged = sum(1 for g in valid if any(r.relevance > 0 for r in g))
    print(f"impressions {len(records)}, lists {len(lists)} (train with actions {len(train)}, "
          f"validation {len(valid)}, judged {judged})")
    if not train or judged < args.min_judged_lists:
        print(f"Not enough data yet: {judged} judged validation lists, need {args.min_judged_lists}. "
              "Nothing written; run again later.")
        return 3
    model = train_model(train, valid, args, spec)
    onnx_bytes = export_onnx(model, spec)
    vx, _, _ = matrix(valid, spec)
    try:
        diff = onnx_matches(model, onnx_bytes, vx)
    except ValueError as e:
        print(f"Export check failed: {e}. Nothing written.")
        return 4
    metrics = evaluate(model, valid, spec)
    manifest = manifest_for(
        model,
        onnx_bytes,
        args.version,
        {
            "rows": len(records),
            "lists": {"train": len(train), "validation": len(valid)},
            "metrics": metrics,
            "onnx_max_abs_diff": diff,
            "params": {
                "trees": args.trees,
                "learning_rate": args.learning_rate,
                "leaves": args.leaves,
                "min_child_samples": args.min_child_samples,
                "days": args.days,
                "seed": args.seed,
            },
        },
        spec,
    )
    d = write_artifact(args.out, args.version, onnx_bytes, manifest)
    better = metrics["ndcg_model"] > metrics["ndcg_formula"]
    rt = FEED_RUNTIME[args.feed]
    folder = f"{rt['dir']}/{args.version}/"
    key = f"{folder}model.onnx"
    print(json.dumps(metrics))
    print(f"Written: {d}/model.onnx and manifest.json ({args.feed} feed)")
    print(f"Model {'beats' if better else 'does NOT beat'} the formula offline "
          f"(NDCG@{K} {metrics['ndcg_model']} vs {metrics['ndcg_formula']}).")
    print(f"Upload both files to the documents bucket under {folder} "
          f"and set the admin setting {rt['setting']}.model_key to {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
