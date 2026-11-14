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
  1. moves main.dart.* (+ lazy parts) and assets/ to v/<version>/, and the
     engine (canvaskit/) to v/<engineRevision>/canvaskit (row 170, 14.11):
     the engine is the same file in every build of one Flutter version
     (1.2 MB skwasm.wasm / 2.3 MB canvaskit.wasm, brotli), so its url now
     changes only when the engine changes and a returning visitor keeps it
     across our deploys. The revision is the one the build itself declares
     (`_flutter.buildConfig.engineRevision`, 40 hex). A build that does not
     declare one keeps the engine under v/<version>/ as before.
  2. points the Flutter loader at that folder (flutter_bootstrap.js: the
     entrypointBaseUrl / canvasKitBaseUrl / assetBase config)
  3. fills the placeholders in boot_head.js (__LB_V__ the app's folder,
     __LB_E__ the engine's folder), which injects the preload hints
  4. (optional third argument, B-c13) sets the engine's fontFallbackBaseUrl:
     the fallback Noto fonts from our own host (scripts/deploy/web-font-base.sh
     prints "/s/" once the host serves them); empty = engine default
     (fonts.gstatic.com)

Stays at the root (asked again each time, small): index.html, spa.html,
flutter_bootstrap.js, flutter.js, manifest.json, version.json, boot_*.js, coi_sw.js,
sqlite3.wasm / drift_worker.js (the database's files; Dart refers to them
by name), icons/, pay.*, firebase-messaging-sw.js, passkeys_bundle.js.

Usage: scripts/deploy/web-immutable.py apps/mobile/build/web <version> [font base]
Prints `engine=<folder>` as its last line (v/<engineRevision> or v/<version>).
"""
import os
import re
import shutil
import sys

ENGINE_REV = re.compile(r'"engineRevision"\s*:\s*"([0-9a-f]{40})"')


def engine_revision(boot: str) -> str:
    """The engine revision the build declares, or "" (then the engine stays
    in the release folder)."""
    m = ENGINE_REV.search(boot)
    return m.group(1) if m else ""


def main() -> None:
    root, version = sys.argv[1], sys.argv[2]
    font_base = sys.argv[3] if len(sys.argv) > 3 else ""
    if not re.fullmatch(r"[0-9A-Za-z._-]{6,64}", version):
        sys.exit(f"bad version: {version!r}")
    # A path ("/s/") or an https URL ending in "/", nothing that could leave
    # the JS string it is written into.
    if font_base and not re.fullmatch(r"(/|https://[0-9A-Za-z.-]+/)[0-9A-Za-z._/-]*/", font_base):
        sys.exit(f"bad font base: {font_base!r}")
    # Owner row 173 (2026-11-14), build flag WEB_SKWASM_THREADS (repository
    # variable, web-deploy.yml): "auto" (default) = the loader's own choice,
    # skwasm on a worker thread whenever the page is cross-origin isolated
    # (admin switch web.cross_origin_isolation, coi_sw.js); "single" = always
    # one thread, even on an isolated page (the loader's documented
    # forceSingleThreadedSkwasm), a kill switch that needs only a redeploy.
    threads = os.environ.get("WEB_SKWASM_THREADS", "auto") or "auto"
    if threads not in ("auto", "single"):
        sys.exit(f"bad WEB_SKWASM_THREADS: {threads!r} (auto or single)")
    path = os.path.join(root, "flutter_bootstrap.js")
    boot = open(path, encoding="utf-8").read()
    if "_flutter.loader.load({" not in boot:
        sys.exit("flutter_bootstrap.js: no _flutter.loader.load({ call")
    rev = engine_revision(boot)
    if rev == version:
        rev = ""
    prefix = f"v/{version}"
    engine = f"v/{rev}" if rev else prefix
    vdir = os.path.join(root, prefix)
    edir = os.path.join(root, engine)
    os.makedirs(vdir, exist_ok=True)
    os.makedirs(edir, exist_ok=True)

    moved = []
    for name in sorted(os.listdir(root)):
        if name == "v":
            continue
        if name == "canvaskit":
            shutil.move(os.path.join(root, name), os.path.join(edir, name))
            moved.append(name)
        elif name == "assets" or name.startswith("main.dart."):
            shutil.move(os.path.join(root, name), os.path.join(vdir, name))
            moved.append(name)
    for must in ("main.dart.wasm", "main.dart.mjs", "main.dart.js", "canvaskit", "assets"):
        if must not in moved:
            sys.exit(f"the build has no {must}")
    for must in ("canvaskit.js", "canvaskit.wasm", "skwasm.js", "skwasm.wasm"):
        if not os.path.isfile(os.path.join(edir, "canvaskit", must)):
            sys.exit(f"the engine has no canvaskit/{must}")

    # 2. the loader's folders (a config object is merged in the load call;
    # canvasKitBaseUrl is the documented loader key, docs.flutter.dev
    # "Customizing web app initialization").
    config = (
        "config:{"
        f'entrypointBaseUrl:"{prefix}/",'
        f'canvasKitBaseUrl:"{engine}/canvaskit",'
        f'assetBase:"{prefix}/"'
        + (f',fontFallbackBaseUrl:"{font_base}"' if font_base else "")
        + (",forceSingleThreadedSkwasm:true" if threads == "single" else "")
        + "},"
    )
    boot = boot.replace("_flutter.loader.load({", "_flutter.loader.load({" + config, 1)
    open(path, "w", encoding="utf-8").write(boot)

    # 3. boot_head.js: where the version folder is (it injects the preload hints
    # of the WebAssembly build: the browser starts the app's download while it
    # still reads the page, not after flutter.js ran).
    path = os.path.join(root, "boot_head.js")
    js = open(path, encoding="utf-8").read()
    for ph in ("__LB_V__", "__LB_E__"):
        if ph not in js:
            sys.exit(f"boot_head.js: no {ph} placeholder")
    js = js.replace("__LB_V__", prefix).replace("__LB_E__", engine)
    open(path, "w", encoding="utf-8").write(js)

    shown = ", ".join(n for n in moved if ".part." not in n and n != "canvaskit")
    print(f"moved to {prefix}/: {shown} ({len(moved) - 1} entries with the lazy parts)")
    print(f"engine (canvaskit/) in {engine}/" + ("" if rev else " (no engineRevision in the build: kept with the release)"))
    print(f"skwasm threads: {threads}")
    print(f"engine={engine}")


if __name__ == "__main__":
    main()
