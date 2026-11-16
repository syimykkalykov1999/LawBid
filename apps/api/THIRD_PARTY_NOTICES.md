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
