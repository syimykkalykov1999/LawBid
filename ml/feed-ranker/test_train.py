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

    def test_refuses_with_too_little_data(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._export(d, 10)
            with redirect_stdout(io.StringIO()):
                code = train.main(["--input", src, "--out", d, "--version", "t2"])
            self.assertEqual(code, 3)
            self.assertFalse(os.path.exists(os.path.join(d, "t2")))


if __name__ == "__main__":
    unittest.main()
