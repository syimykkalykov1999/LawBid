# Third-party notices (apps/mobile)

## flutter_callkit_incoming — MIT

Used in `ios/Runner/AppDelegate.swift` (the VoIP push → CallKit report
pattern of the package's example AppDelegate, and its README `onDecline`
server call), and in `android/.../LawbidApplication.kt` + `CallDecline.kt`
(the README «MainApplication.kt» `CallkitEventCallback` decline flow),
tag v3.1.6, commit
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

## Flutter SDK motion code (framework 3.47.5) — BSD-3-Clause

Owner row 88 (2026-11-13), copied or adapted from the Flutter framework,
https://github.com/flutter/flutter (`packages/flutter/lib/src`):
`CupertinoPageTransitionsBuilder` duration and delegated transition
(`cupertino/route.dart`) in `lib/core/navigation/back_swipe.dart`;
`FadeForwardsPageTransitionsBuilder` fades without its slide
(`material/page_transitions_theme.dart`) in the same file; `BottomSheet`
drag and `CupertinoSheetRoute` release logic (`material/bottom_sheet.dart`,
`cupertino/sheet.dart`) and the top edge of `ClampingScrollPhysics`
(`widgets/scroll_physics.dart`) in
`lib/core/design_system/widgets/bars/app_sheet_handle.dart`; the shimmer of
the Flutter cookbook "Create a shimmer loading effect" (docs.flutter.dev) in
`lib/core/design_system/widgets/feedback/app_skeleton.dart`;
`SpringSimulation` springs in `reply_swipe.dart` and `photo_gallery.dart`.
Row 88, second part: the floating, snapping header of
`RenderSliverFloatingPersistentHeader` / `FloatingHeaderSnapConfiguration`
(`rendering/sliver_persistent_header.dart`) in
`lib/features/feed/presentation/widgets/feed_chrome.dart`; the
`CupertinoDialogRoute` entrance (1.3 → 1 scale, fade-only exit, the iOS
standard spring) (`cupertino/route.dart`) in
`lib/core/design_system/widgets/feedback/app_dialog.dart`; the
`_PredictiveBackGestureDetector` hand-off to the route
(`material/predictive_back_page_transitions_builder.dart`) in
`lib/core/navigation/system_back.dart`; `Hero`, `AnimatedSwitcher` and
`SpringSimulation` in `photo_gallery.dart` and
`lib/features/stories/presentation/story_viewer_screen.dart`.

Copyright 2014 The Flutter Authors. All rights reserved.
Licensed under the BSD 3-Clause license; full text as in the battery_plus
entry above (the same licence, with "The Flutter Authors" as copyright
holder): https://github.com/flutter/flutter/blob/master/LICENSE

## flutter_chat_ui (flyerhq) — Apache-2.0

The insert animation of a new chat message in
`lib/features/chat/presentation/chat_insert_motion.dart` follows
`ChatAnimatedList` / `ChatMessage` of flutter_chat_ui 2.12.0
(https://github.com/flyerhq/flutter_chat_ui, `packages/flutter_chat_ui/lib/src`):
Fade over Size over Scale on `Curves.linearToEaseOut`, 250 ms
(`insertAnimationDuration`), scaled from `centerRight` for sent and
`centerLeft` for received messages. Copyright (c) Flyer Chat authors.
Licensed under the Apache License, Version 2.0, as for livekit_client above.

## open_filex — BSD-3-Clause

Dependency from pub.dev (not copied): opens a downloaded document in the system
viewer (`lib/core/files/open_local_file_native.dart`), version 5.0.0,
https://github.com/javaherisaber/open_filex. Copyright 2018 crazecoder.

## firebase_messaging (FlutterFire) — BSD-3-Clause

`android/.../FlutterPushReceiver.kt` subclasses the plugin's
`FlutterFirebaseMessagingReceiver` and copies its package-private
`FlutterFirebaseMessagingUtils.isApplicationForeground` as is
(firebase_messaging 17.0.1, https://github.com/firebase/flutterfire,
`packages/firebase_messaging/firebase_messaging/android`). Copyright 2017 The
Chromium Authors. All rights reserved. BSD-3-Clause license (the package's
LICENSE file): redistribution in source and binary forms, with or without
modification, is permitted provided the copyright notice, this list of
conditions and the disclaimer are retained, and neither the name of Google
Inc. nor the names of its contributors are used to endorse derived products
without permission. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED.

## Android developer guide «Loading large bitmaps efficiently» — Apache-2.0

`calculateInSampleSize` in `android/.../ChatNotifications.kt` (the two-pass
`inJustDecodeBounds` decode of a push avatar) is the guide's Kotlin sample as
is (https://developer.android.com/topic/performance/graphics/load-bitmap,
read 2026-11-13). Code samples on that site are licensed under the Apache
License, Version 2.0, as for livekit_client above.

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

## Unicode CLDR 48.0 language names — Unicode License v3

`lib/core/l10n/language_display_names.dart` is generated by
`tool/gen_language_display_names.mjs` from the CLDR data in Node's ICU
(`Intl.DisplayNames`, ICU 78.3 / CLDR 48.0): the name of each app
language in each app language (sweep C-c6, 2026-11-09). Nothing edited
by hand. https://cldr.unicode.org, https://www.unicode.org/license.txt

UNICODE LICENSE V3

Copyright © 1991-2025 Unicode, Inc.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

## Mediabunny 1.62.1 — MPL-2.0 (owner exception 2026-11-08)

`web/vendor/mediabunny-1.62.1/mediabunny.min.js` is the file
`dist/bundles/mediabunny.min.mjs` of the npm package `mediabunny@1.62.1`
(https://github.com/Vanilagy/mediabunny, https://mediabunny.dev), used
**unmodified**: the bytes are exactly the published ones (only the file name
ends in `.js` so every static host serves it as JavaScript), SHA-256
`b365395e7cd4b130553a1203fc23c52c035aedf6d1e07d6fedb4663745b5c790`. None of
its files are edited. The source of this version is available from the
links above and from the npm package. Our own glue,
`web/js/video_compress.js`, only calls its public API (WebCodecs video
re-encode before upload, loaded when a video is sent). The owner approved
this MPL-2.0 dependency as an exception to Rule #1 (answer «Да»,
2026-11-08). Its licence text, also in `web/vendor/mediabunny-1.62.1/LICENSE`:

```
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.
```
