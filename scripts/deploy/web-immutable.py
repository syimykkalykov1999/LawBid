#!/usr/bin/env python3
"""Moves the web build's heavy, never-changing-under-one-name files under
v/<version>/ so every one of them can be cached for a year (`immutable`).

Why: Flutter names the engine and the app the same in every build
(main.dart.wasm, canvaskit/..., assets/...), so the page could only tell the
browser "ask me again" (a 304 round trip per file on every visit). Under a
folder that carries the release, the URL changes with the release, and the
browser asks for nothing at all on a repeat visit (Instagram / WhatsApp Web
do the same with hashed file names).

What it does, in a built `build/web`:
  1. moves main.dart.* (+ lazy parts), canvaskit/, assets/ to v/<version>/
  2. points the Flutter loader at that folder (flutter_bootstrap.js: the
     entrypointBaseUrl / canvasKitBaseUrl / assetBase config)
  3. fills the version placeholder in boot_head.js (__LB_V__), which injects
     the preload hints

Stays at the root (asked again each time, small): index.html, spa.html,
flutter_bootstrap.js, flutter.js, manifest.json, version.json, boot_*.js,
sqlite3.wasm / drift_worker.js (the database's files; Dart refers to them
by name), icons/, pay.*, firebase-messaging-sw.js.

Usage: scripts/deploy/web-immutable.py apps/mobile/build/web <version>
"""
import os
import re
import shutil
import sys


def main() -> None:
    root, version = sys.argv[1], sys.argv[2]
    if not re.fullmatch(r"[0-9A-Za-z._-]{6,64}", version):
        sys.exit(f"bad version: {version!r}")
    vdir = os.path.join(root, "v", version)
    os.makedirs(vdir, exist_ok=True)

    moved = []
    for name in sorted(os.listdir(root)):
        if name == "v":
            continue
        if name in ("canvaskit", "assets") or name.startswith("main.dart."):
            shutil.move(os.path.join(root, name), os.path.join(vdir, name))
            moved.append(name)
    for must in ("main.dart.wasm", "main.dart.mjs", "main.dart.js", "canvaskit", "assets"):
        if must not in moved:
            sys.exit(f"the build has no {must}")

    prefix = f"v/{version}"

    # 2. the loader's folders (a config object is merged in the load call).
    path = os.path.join(root, "flutter_bootstrap.js")
    boot = open(path, encoding="utf-8").read()
    config = (
        "config:{"
        f'entrypointBaseUrl:"{prefix}/",'
        f'canvasKitBaseUrl:"{prefix}/canvaskit",'
        f'assetBase:"{prefix}/"'
        "},"
    )
    if "_flutter.loader.load({" not in boot:
        sys.exit("flutter_bootstrap.js: no _flutter.loader.load({ call")
    boot = boot.replace("_flutter.loader.load({", "_flutter.loader.load({" + config, 1)
    open(path, "w", encoding="utf-8").write(boot)

    # 3. boot_head.js: where the version folder is (it injects the preload hints
    # of the WebAssembly build: the browser starts the app's download while it
    # still reads the page, not after flutter.js ran).
    path = os.path.join(root, "boot_head.js")
    js = open(path, encoding="utf-8").read()
    if "__LB_V__" not in js:
        sys.exit("boot_head.js: no __LB_V__ placeholder")
    open(path, "w", encoding="utf-8").write(js.replace("__LB_V__", prefix))

    shown = ", ".join(n for n in moved if ".part." not in n)
    print(f"moved to {prefix}/: {shown} ({len(moved)} entries with the lazy parts)")


if __name__ == "__main__":
    main()
