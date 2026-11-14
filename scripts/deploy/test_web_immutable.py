"""Row 170 (14.11): web-immutable.py puts the engine under
v/<engineRevision>/ and the app under v/<release>/.

    python3 -m unittest discover -s scripts/deploy -p 'test_*.py'
"""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "web-immutable.py")
REV = "af7e796e16" + "0" * 30
SHA = "ea3ed5318abcdef0123456789abcdef012345678"
BOOT = (
    '(()=>{/* flutter.js */})();\n'
    'if (!window._flutter) window._flutter = {};\n'
    '_flutter.buildConfig = {"engineRevision":"%s","builds":[]};\n'
    '_flutter.loader.load({});\n'
)
HEAD = "var V = '__LB_V__';\nvar E = '__LB_E__';\n"


def build(root, rev=REV, head=HEAD):
    os.makedirs(os.path.join(root, "canvaskit", "chromium"))
    os.makedirs(os.path.join(root, "assets", "shaders"))
    for f in ("main.dart.wasm", "main.dart.mjs", "main.dart.js", "main.dart.js_1.part.js", "index.html"):
        open(os.path.join(root, f), "w").write(f)
    for f in ("canvaskit.js", "canvaskit.wasm", "skwasm.js", "skwasm.wasm", "chromium/canvaskit.wasm"):
        open(os.path.join(root, "canvaskit", f), "w").write(f)
    open(os.path.join(root, "assets", "NOTICES"), "w").write("n")
    open(os.path.join(root, "flutter_bootstrap.js"), "w").write(BOOT % rev)
    open(os.path.join(root, "boot_head.js"), "w").write(head)


def run(root, version=SHA, *extra):
    return subprocess.run([sys.executable, SCRIPT, root, version, *extra], capture_output=True, text=True)


def read(root, name):
    return open(os.path.join(root, name), encoding="utf-8").read()


class EngineFolder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_engine_goes_to_its_revision_and_app_to_the_release(self):
        build(self.root)
        r = run(self.root)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", REV, "canvaskit", "skwasm.wasm")))
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", REV, "canvaskit", "chromium", "canvaskit.wasm")))
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", SHA, "main.dart.wasm")))
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", SHA, "main.dart.js_1.part.js")))
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", SHA, "assets", "NOTICES")))
        self.assertFalse(os.path.exists(os.path.join(self.root, "v", SHA, "canvaskit")))
        self.assertFalse(os.path.exists(os.path.join(self.root, "canvaskit")))
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, "v", REV))), ["canvaskit"])
        boot = read(self.root, "flutter_bootstrap.js")
        self.assertIn(f'canvasKitBaseUrl:"v/{REV}/canvaskit"', boot)
        self.assertIn(f'entrypointBaseUrl:"v/{SHA}/"', boot)
        self.assertIn(f'assetBase:"v/{SHA}/"', boot)
        self.assertIn("_flutter.loader.load({config:{", boot)
        head = read(self.root, "boot_head.js")
        self.assertIn(f"var V = 'v/{SHA}';", head)
        self.assertIn(f"var E = 'v/{REV}';", head)
        self.assertEqual(r.stdout.strip().splitlines()[-1], f"engine=v/{REV}")

    def test_no_engine_revision_keeps_the_engine_with_the_release(self):
        build(self.root, rev="not-a-revision")
        r = run(self.root)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.root, "v", SHA, "canvaskit", "skwasm.wasm")))
        self.assertIn(f'canvasKitBaseUrl:"v/{SHA}/canvaskit"', read(self.root, "flutter_bootstrap.js"))
        self.assertIn(f"var E = 'v/{SHA}';", read(self.root, "boot_head.js"))
        self.assertEqual(r.stdout.strip().splitlines()[-1], f"engine=v/{SHA}")

    def test_the_loader_config_is_valid_javascript_object_syntax(self):
        build(self.root)
        run(self.root, SHA, "/s/")
        boot = read(self.root, "flutter_bootstrap.js")
        self.assertIn(f'fontFallbackBaseUrl:"/s/"}},}});', boot)

    def test_missing_engine_placeholder_fails(self):
        build(self.root, head="var V = '__LB_V__';\n")
        r = run(self.root)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("__LB_E__", r.stderr)

    def test_missing_engine_file_fails(self):
        build(self.root)
        os.remove(os.path.join(self.root, "canvaskit", "skwasm.wasm"))
        r = run(self.root)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("skwasm.wasm", r.stderr)


if __name__ == "__main__":
    unittest.main()
