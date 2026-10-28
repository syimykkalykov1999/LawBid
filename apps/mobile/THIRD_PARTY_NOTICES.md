# Third-party notices (apps/mobile)

## flutter_callkit_incoming — MIT

Used in `ios/Runner/AppDelegate.swift` (the VoIP push → CallKit report
pattern of the package's example AppDelegate), tag v3.1.6, commit
27cd33c1665b7fbc4c8032a7866c929103029592,
https://github.com/hiennguyen92/flutter_callkit_incoming

Owner 2026-10-28 (calls variant A): the package itself is vendored in
`third_party/flutter_callkit_incoming/` (v3.1.6 as published, plus upstream
pull request #872 head 4ae62216da7afcaf33efea9aed21d1f4a6623383 by
mhammad-bouali, «dismiss the full-screen incoming call when it ends»).
Its LICENSE file is kept there. `example/` is not copied.

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


## livekit_client (LiveKit Flutter SDK) — Apache-2.0

Owner 2026-10-28 (calls variant A): the calls' media (dependency
`livekit_client: 2.13.2`, tag v2.13.2, commit
7adc5959f735045261e6a81accb5cb6a9ad79a7b,
https://github.com/livekit/client-sdk-flutter). The room calls in
`lib/features/calls/application/livekit_call_media.dart` follow its
`example/lib/widgets/controls.dart`.

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

## LiveKit Flutter CallKit example — Apache-2.0

Copyright 2026 LiveKit. https://github.com/livekit-examples/flutter-callkit,
commit ab61c43432d2772c8c76981c9e8ed1f7140956b8. Copied: the CallKit audio
pattern of `ios/Runner/AppDelegate.swift` (`setWebRTCAudioAvailable`,
`configureCallAudioSession`, `didActivate` / `didDeactivate`) into our
`ios/Runner/AppDelegate.swift`, and `lib/main.dart`'s
`AudioSessionManagementMode.externalCallSystem` start-up step and room
connect / microphone order into `livekit_call_media.dart`. Licensed under
the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).

## Jitsi Meet — PictureInPictureModule — Apache-2.0

Copyright @ 2017-present 8x8, Inc. https://github.com/jitsi/jitsi-meet,
commit f765042bf280cbd7dcd4a9bbdb63b09e9e4d3259,
`android/sdk/src/main/java/org/jitsi/meet/sdk/PictureInPictureModule.java`
→ `android/app/src/main/java/com/lawbid/lawbid/PictureInPictureModule.java`
(React Native bindings replaced by a plain class; the file header lists the
changes). Licensed under the Apache License, Version 2.0
(http://www.apache.org/licenses/LICENSE-2.0).
