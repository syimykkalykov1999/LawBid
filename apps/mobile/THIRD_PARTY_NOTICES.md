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

## desktop_drop (MixinNetwork/flutter-plugins) — Apache-2.0

Used as a pub.dev package, unchanged: dragging files onto the website.
https://github.com/MixinNetwork/flutter-plugins/tree/main/packages/desktop_drop

Licensed under the Apache License, Version 2.0. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
