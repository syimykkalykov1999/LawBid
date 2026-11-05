# Third-party notices (apps/mobile)

## flutter_callkit_incoming — MIT

Used in `ios/Runner/AppDelegate.swift` (the VoIP push → CallKit report
pattern of the package's example AppDelegate), tag v3.1.6, commit
27cd33c1665b7fbc4c8032a7866c929103029592,
https://github.com/hiennguyen92/flutter_callkit_incoming

MIT License

Copyright (c) 2021 Hien Nguyen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## fl_chart — MIT

Used as a published dependency (pinned in `pubspec.lock`) for the donut chart
of «Данные и память» (`lib/features/settings/storage/presentation/storage_screen.dart`).
Version 1.3.0, pub.dev archive sha256
5ed69b8be550c6276c8f0bc25c09704fb061018ed1b1681867ad18fcf477e7b7,
https://github.com/imaNNeo/fl_chart (no source copied; the upstream commit of
the release is the one pub.dev publishes for 1.3.0).

MIT License

Copyright (c) 2022 Flutter 4 Fun

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
## livekit_client (LiveKit client-sdk-flutter) — Apache-2.0

Used in `lib/features/calls/application/livekit_rtc.dart` (the peer
connection teardown of `Transport` → `onDispose` and the stats helpers
`getNumValFromReport` / `getStringValFromReport`, with the changes listed
in that file's header), release v2.13.2, commit
7adc5959f735045261e6a81accb5cb6a9ad79a7b,
https://github.com/livekit/client-sdk-flutter. The call screen's
end-of-call order follows its `Room._cleanUp` and the example's
`RoomDisconnectedEvent` → post-frame pop (behaviour, no code copied).
Full licence text: `third_party/licenses/livekit_client-2.13.2-LICENSE.txt`.

NOTICE:

Copyright 2024 LiveKit, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## flutter_displaymode — MIT

Used as a pub dependency (pinned 0.7.0) in `lib/core/platform/high_refresh_rate.dart`:
`FlutterDisplayMode.setHighRefreshRate()` once at startup on Android, so
120 Hz phones do not stay at 60 Hz. https://github.com/ajinasokan/flutter_displaymode

MIT License

Copyright (c) 2020 Ajin Asokan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## battery_plus — BSD-3-Clause

Used as a published dependency (pinned in `pubspec.lock`, version 7.1.2) for
the low power mode (`lib/core/config/low_power.dart`).
https://github.com/fluttercommunity/plus_plugins (no source copied).

Copyright 2017 The Chromium Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## tus-js-client — MIT

The parallel reel upload in `lib/features/reels/data/reels_repository.dart`
follows `parallelUploads` of tus-js-client (https://github.com/tus/tus-js-client):
split into equal pieces, `Upload-Concat: partial`, then `Upload-Concat: final`.

Copyright (c) 2013-2024 Transloadit Ltd and Contributors. Released under the
MIT License, text as for flutter_displaymode above.

## @aws-sdk/lib-storage — Apache-2.0

The parallel part loop in `lib/core/uploads/storage_uploader.dart` follows
`__doConcurrentUpload` and `queueSize = 4` of @aws-sdk/lib-storage
(https://github.com/aws/aws-sdk-js-v3). Copyright Amazon.com, Inc. or its
affiliates. Licensed under the Apache License, Version 2.0, as for
livekit_client above.

## Uppy `RateLimitedQueue` — MIT

The limit logic of `lib/core/transfers/adaptive_limiter.dart` is the Dart form
of `packages/@uppy/utils/src/RateLimitedQueue.ts`, tag `uppy@4.0.0`,
https://github.com/transloadit/uppy. Copyright (c) 2018 Transloadit. MIT
License (full text as in the fl_chart notice above).

## dio `downloadWithChunks` — MIT

The piece download of `lib/core/files/resumable_download.dart` follows
`example_dart/lib/download_with_trunks.dart` of https://github.com/cfug/dio
(branch main, read 2026-11-05). Copyright (c) 2018 Wen Du (wendux), 2023 The
CFUG Team. MIT License (full text as in the fl_chart notice above).
