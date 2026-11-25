"""python -m unittest test_train (needs requirements.txt installed)."""

from __future__ import annotations

import io
import json
import math
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import features as feats
import make_fixture
import train


class FeaturesTest(unittest.TestCase):
    def test_rounding_and_missing(self):
        self.assertEqual(feats.feature_value(0.12345), 0.1235)  # tie goes up, as Math.round
        self.assertEqual(feats.feature_value(0.00005), 0.0001)
        self.assertEqual(feats.feature_value(2), 1.0)
        self.assertEqual(feats.feature_value(-3), 0.0)
        for bad in (None, "0.5", True, float("nan"), float("inf")):
            self.assertTrue(math.isnan(feats.feature_value(bad)))
        self.assertEqual(len(feats.vectorize({})), len(feats.FEATURES))

    def test_one_spec_per_feed(self):
        surfaces = {f: feats.spec_for(f).surface for f in feats.FEEDS}
        self.assertEqual(surfaces, {"posts": "posts", "reels": "reels", "cases": "case_feed"})
        versions = {feats.spec_for(f).version for f in feats.FEEDS}
        self.assertEqual(len(versions), 3)  # a model of one feed never loads in another
        self.assertIn("shareRate", feats.spec_for("reels").features)
        self.assertIn("bidOn", feats.spec_for("cases").features)
        with self.assertRaises(ValueError):
            feats.spec_for("people")


class LabelsTest(unittest.TestCase):
    def test_each_feed_has_its_own_labels(self):
        reels, cases = train.label_sql("reels"), train.label_sql("cases")
        self.assertIn("post_shares", reels)
        self.assertIn("THEN 4", reels)
        self.assertIn("post_view_events", reels)
        self.assertIn("FROM bids", cases)
        self.assertIn("'accepted'", cases)
        self.assertNotIn("bids", train.label_sql("posts"))
        self.assertEqual(train.SQL, train.label_sql("posts"))


class TrainTest(unittest.TestCase):
    def _export(self, d: str, n_lists: int) -> str:
        path = os.path.join(d, "events.jsonl")
        with open(path, "w", encoding="utf-8") as fh:
            for r in make_fixture.synthetic(n_lists=n_lists):
                fh.write(json.dumps(r.__dict__) + "\n")
        return path

    def test_trains_exports_and_beats_the_formula(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._export(d, 400)
            with redirect_stdout(io.StringIO()):
                code = train.main(["--input", src, "--out", d, "--version", "t1",
                                   "--min-judged-lists", "20", "--trees", "60"])
            self.assertEqual(code, 0)
            m = json.load(open(os.path.join(d, "t1", "manifest.json")))
            self.assertEqual(m["feature_spec_version"], feats.SPEC["version"])
            self.assertEqual(m["features"], feats.FEATURES)
            self.assertLess(m["onnx_max_abs_diff"], 1e-4)
            self.assertGreater(m["metrics"]["ndcg_model"], m["metrics"]["ndcg_formula"])
            self.assertTrue(os.path.getsize(os.path.join(d, "t1", "model.onnx")) > 100)

    def test_reels_and_cases_train_their_own_models(self):
        for feed in ("reels", "cases"):
            with tempfile.TemporaryDirectory() as d:
                path = os.path.join(d, "events.jsonl")
                with open(path, "w", encoding="utf-8") as fh:
                    for r in make_fixture.synthetic(n_lists=400, feed=feed):
                        fh.write(json.dumps(r.__dict__) + "\n")
                out = io.StringIO()
                with redirect_stdout(out):
                    code = train.main(["--feed", feed, "--input", path, "--out", d,
                                       "--version", "t3", "--min-judged-lists", "20",
                                       "--trees", "60"])
                self.assertEqual(code, 0, feed)
                m = json.load(open(os.path.join(d, "t3", "manifest.json")))
                spec = feats.spec_for(feed)
                self.assertEqual(m["feed"], feed)
                self.assertEqual(m["feature_spec_version"], spec.version)
                self.assertEqual(m["features"], spec.features)
                self.assertGreater(m["metrics"]["ndcg_model"], m["metrics"]["ndcg_formula"])
                self.assertIn(f"ml/feed-ranker/{feed}/t3/model.onnx", out.getvalue())
                self.assertIn(f"reco.ranker.{feed}.model_key", out.getvalue())

    def test_refuses_with_too_little_data(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._export(d, 10)
            with redirect_stdout(io.StringIO()):
                code = train.main(["--input", src, "--out", d, "--version", "t2"])
            self.assertEqual(code, 3)
            self.assertFalse(os.path.exists(os.path.join(d, "t2")))


if __name__ == "__main__":
    unittest.main()
