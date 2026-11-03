// Copyright 2024 LiveKit, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Copied from livekit/client-sdk-flutter v2.13.2
// (7adc5959f735045261e6a81accb5cb6a9ad79a7b, the published `livekit_client`
// 2.13.2 package):
// - [disposePeerConnection]: the body of `Transport._` → `onDispose`,
//   lib/src/core/transport.dart lines 240-270.
// - [getNumValFromReport], [getStringValFromReport]: lib/src/stats/stats.dart
//   lines 192-204.
// Changes (LawBid): the transport's debounce lines are left out (we have no
// renegotiation debounce); `logger.warning` became [onError]; the copy is a
// top-level function over a plain `RTCPeerConnection`.

// Kept as in the original (the copy is not restyled).
// ignore_for_file: cascade_invocations, omit_local_variable_types

import 'package:flutter_webrtc/flutter_webrtc.dart' as rtc;

/// Tears a peer connection down the LiveKit way: no callback fires any
/// more, every sender is removed, then `close()` and `dispose()`.
Future<void> disposePeerConnection(
  rtc.RTCPeerConnection pc, {
  void Function(String message)? onError,
}) async {
  // Ensure callbacks won't fire any more
  pc.onRenegotiationNeeded = null;
  pc.onIceCandidate = null;
  pc.onConnectionState = null;
  pc.onIceConnectionState = null;
  pc.onTrack = null;

  // Remove all senders
  List<rtc.RTCRtpSender> senders = [];
  try {
    senders = await pc.getSenders();
  } catch (err) {
    onError?.call('getSenders() failed with error: $err');
  }

  for (final e in senders) {
    try {
      await pc.removeTrack(e);
    } catch (err) {
      onError?.call('removeTrack() failed with error: $err');
    }
  }

  await pc.close();
  await pc.dispose();
}

num? getNumValFromReport(Map<dynamic, dynamic> values, String key) {
  if (values.containsKey(key)) {
    return (values[key] is String)
        ? num.tryParse(values[key] as String)
        : values[key] as num;
  }
  return null;
}

String? getStringValFromReport(Map<dynamic, dynamic> values, String key) {
  if (values.containsKey(key)) {
    return values[key] as String;
  }
  return null;
}
