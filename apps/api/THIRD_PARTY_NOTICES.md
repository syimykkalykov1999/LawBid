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

## jsQR 1.4.0 — Apache-2.0 (tests only, devDependency)

https://github.com/cozmo/jsQR — decodes the QR drawn in the PDF in
`src/modules/deals/deal-record.pdf.spec.ts`. Not shipped in the server
image. License: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
(full text in the package's LICENSE file).

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
