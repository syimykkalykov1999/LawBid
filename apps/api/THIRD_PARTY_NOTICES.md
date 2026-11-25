# Third-party notices (apps/api)

Packages used unmodified as npm dependencies, versions pinned in
`apps/api/package.json`.

## qrcode 1.5.4 — MIT

https://github.com/soldair/node-qrcode — encodes the QR of the deal record
PDF (`src/modules/deals/deal-record.pdf.ts`, `qrModules`): the authenticity
check link. Only the QR matrix is used; the squares are drawn by PDFKit.

```
The MIT License (MIT)

Copyright (c) 2012 Ryan Day

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```

## jambonz/realtimedb-helpers 0.8.23 — MIT (copied in part)

https://github.com/jambonz/realtimedb-helpers — the call-center queue helpers
(`lib/sorted-set/sorted-set-length.js`, the ZRANK step of
`lib/sorted-set/sorted-set-position.js`) copied into
`src/modules/hotline/vendor/jambonz-queue.ts` for the call hotline queue
(owner row 87). The npm package ships no LICENSE file; its package.json
declares MIT, author Dave Horton.

```
The MIT License (MIT)

Copyright (c) Dave Horton / jambonz

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## jsQR 1.4.0 — Apache-2.0 (tests only, devDependency)

https://github.com/cozmo/jsQR — decodes the QR drawn in the PDF in
`src/modules/deals/deal-record.pdf.spec.ts`. Not shipped in the server
image. License: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
(full text in the package's LICENSE file).

## @prisma/extension-read-replicas 0.5.0 — Apache-2.0 (pattern copied)

https://github.com/prisma/extension-read-replicas (Prisma Data, Inc.) —
`src/prisma/prisma-read.service.ts` copies from its `src/extension.ts` the
list of model read operations (`readOperations`) and the way a read is sent
to another client (`client[model][operation](args)`, here with the camelCase
delegate our shard router keys on), plus the `__internalParams.transaction`
check that leaves transactions alone. Used when a read copy does not answer
and the read is asked again of the primary (rows 8 / 9, 15.11). License:
Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0 (full text in
the package's LICENSE file). Changed: camelCase delegate, raw SELECT replay.

## async-mutex — MIT

`src/common/vendor/async-mutex/` (Semaphore.ts, SemaphoreInterface.ts, errors.ts), tag v0.5.0, https://github.com/DirtyHairy/async-mutex — copied whole, reformatted only. Used by the byte budget of full file reads (`modules/files/read-budget.ts`, security audit 2026-11-08 L6).

The MIT License (MIT)

Copyright (c) 2016 Christian Speckner <cnspeckn@googlemail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## FFmpeg 8.1 (Alpine package `ffmpeg`) — separate program, not linked

https://ffmpeg.org — installed in the server image only with
`--build-arg WITH_FFMPEG=1` (`apps/api/Dockerfile`; Alpine's build is
GPL-2.0-or-later because it enables GPL parts such as x264). LawBid code does
not include, copy or link any FFmpeg code: it starts the `ffmpeg` program as a
separate process with files in a private temp folder and reads its output
file — the video frame check (`src/modules/media-moderation/video-frames.ts`)
and, owner row 146, the AAC/M4A copy of a browser voice note
(`src/modules/files/processing/voice-transcode.ts`, FFmpeg's own LGPL `aac`
encoder). The source of the exact build is Alpine's `ffmpeg` APKBUILD
(https://gitlab.alpinelinux.org/alpine/aports, `community/ffmpeg`).

## GrowthBook JavaScript SDK — MIT

`src/common/vendor/growthbook/hash.ts` (functions `hashFnv32a` and the
version-2 branch of `hash`), tag v5.2.0, https://github.com/growthbook/growthbook
(`packages/sdk-js/src/util.ts`) — copied as is. Bucketing hash version 2 of
experiments and feature-flag rollouts (owner row 150); its test vectors come
from the SDK's `packages/sdk-js/test/cases.json`. The repository's enterprise
directories are under another licence and are not used.

```
Copyright (c) 2025 GrowthBook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

## ONNX Runtime Web (onnxruntime-web 1.31.1, onnxruntime-common 1.31.1) — MIT

https://github.com/microsoft/onnxruntime — npm dependency, unmodified.
Runs the learned posts ranker (F2) inside the API:
`src/modules/recommendations/ranker/post-ranker.service.ts`. The WebAssembly
build is used because the native `onnxruntime-node` does not load on the
Alpine (musl) API image. Its own dependencies: flatbuffers 25.x
(Apache-2.0), guid-typescript 1.x (ISC), platform 1.3.x (MIT); long and
protobufjs were already in the tree.

```
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Offline ranker training (ml/feed-ranker) — not shipped in the API image

Python tools run by hand to train the posts ranker, pinned in
`ml/feed-ranker/requirements.txt`, used unmodified: LightGBM 4.7.0 (MIT,
Copyright (c) Microsoft Corporation, Copyright (c) The LightGBM developers),
onnxmltools 1.16.0 and onnx 1.23.2 (Apache-2.0), onnxruntime 1.32.0 (MIT),
numpy 2.5.5 and scikit-learn 1.9.1 (BSD-3-Clause), pg8000 1.31.6
(BSD-3-Clause). Only the model they produce (an ONNX file) reaches the API.

## Sentry JavaScript SDK 11.11.0 migration guide — MIT

The `dataCollection` block that keeps the Sentry 10 restrictive defaults
(`src/telemetry/sentry.ts`) is copied from MIGRATION.md «If you want to keep the v10 default
behavior», https://github.com/getsentry/sentry-javascript

MIT License — Copyright (c) 2019 Functional Software, Inc. dba Sentry

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SecLists 10k most common passwords — MIT (data copied in part)

`src/modules/auth/data/common-passwords.ts` holds the 8+ character entries
of `Passwords/Common-Credentials/10k-most-common.txt` from
https://github.com/danielmiessler/SecLists (MIT License, Copyright (c) 2018
Daniel Miessler). The list refuses well-known passwords at sign-up.

## Noto Sans fonts — SIL Open Font License 1.1

`assets/fonts/noto/*.ttf` (and Noto Sans CJK fetched at run time) are
embedded as subsets in the PDFs the server makes (`src/common/pdf-fonts`).
Copyright 2022 The Noto Project Authors; Noto Sans CJK Copyright 2014-2021
Adobe. Full licence: `assets/fonts/noto/OFL.txt`. The OFL allows embedding
in documents with no further condition.

## Server-only packages with a non-permissive licence (licence audit 2026-11-17)

These run only inside our API / admin server containers. Nothing of them
is sent to a phone or a browser, so no licence obligation is triggered
(LGPL, EPL and FSL bind only redistribution). Listed with their source so
anyone receiving a container image still has the notice and the source.

- `@img/sharp-libvips-*` 1.3.4 (libvips and its libraries) — LGPL-3.0-or-later,
  prebuilt, loaded dynamically by `sharp` 0.35.5 (Apache-2.0). Source:
  https://github.com/lovell/sharp-libvips (tag v1.3.4), https://github.com/libvips/libvips.
- `libheif-js` 1.23.5 (libheif compiled to JavaScript, used by `heic-decode`
  to read iPhone HEIC photos on the server) — LGPL-3.0. Source:
  https://github.com/catdad-experiments/libheif-js, https://github.com/strukturag/libheif.
- `elkjs` 0.11.1 — EPL-2.0, part of Prisma Studio inside the `prisma` CLI
  (migrations only; Studio is never started in production). Source:
  https://github.com/kieler/elkjs.
- `sentry` 0.45.0 (Sentry CLI, pulled by `@sentry/node` through
  `@sentry/bundler-plugins`, never executed by us) — FSL-1.1-Apache-2.0:
  any use except a competing product to Sentry is allowed, and each release
  becomes Apache-2.0 two years after it is published. Source:
  https://github.com/getsentry/cli.
- `jszip` 3.10.2 (inside `exceljs`) — dual "MIT or GPL-3.0"; we use it under MIT.
