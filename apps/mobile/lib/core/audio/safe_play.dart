import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';

/// `play()` completes only when playback ends, and its future also carries
/// the audio-session activation failure (iOS: another app or a call holds
/// the session). Fire-and-forget callers used to let that error reach the
/// global handler as a crash; here it is a missed sound, nothing more.
extension SafePlay on AudioPlayer {
  void playSafely() {
    unawaited(
      play().catchError((Object e) {
        if (kDebugMode) debugPrint('audio play skipped: $e');
      }),
    );
  }
}
