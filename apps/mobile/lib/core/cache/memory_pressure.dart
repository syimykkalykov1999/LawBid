import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/media/video_prefetch.dart';
import 'package:lawbid/core/media/web_video_warm.dart';

/// Perf batch 4 (row 127): the phone asked for memory back (iOS
/// `didReceiveMemoryWarning`, Android `onTrimMemory`), delivered by Flutter
/// as `WidgetsBindingObserver.didHaveMemoryPressure` — Apple «Responding to
/// low-memory warnings»: free what can be rebuilt. Flutter empties only its
/// own `imageCache`; the app's copies are freed here:
///
/// - the memory layer of the HTTP cache (the disk copy stays, the next read
///   comes from there);
/// - the video warm-up downloads waiting or running;
/// - the players warmed for the reels next to the one on screen
///   ([MemoryPressure.signal]: a warmed player that is not on screen closes
///   and re-opens at the same spot when it comes back).
///
/// Fewer background kills by the system means fewer cold starts.
abstract final class MemoryPressure {
  /// Counts the warnings since the start; listen to free own copies.
  static final ValueNotifier<int> signal = ValueNotifier<int>(0);
}

class _Observer with WidgetsBindingObserver {
  _Observer(this._onPressure);

  final VoidCallback _onPressure;

  @override
  void didHaveMemoryPressure() => _onPressure();
}

/// Read once at start (`runLawBid`); keeps the observer for the app's life.
final memoryPressureProvider = Provider<void>((ref) {
  void free() {
    try {
      // Memory only: the disk copy is what a cold start reads anyway.
      unawaited(ref.read(httpCacheInterceptorProvider).clear(disk: false));
    } on Object catch (e) {
      debugPrint('memory pressure: http cache: $e');
    }
    HlsPrefetcher.instance.cancelAll();
    if (kIsWeb) WebVideoWarm.instance.clear();
    MemoryPressure.signal.value++;
  }

  final observer = _Observer(free);
  WidgetsBinding.instance.addObserver(observer);
  ref.onDispose(() => WidgetsBinding.instance.removeObserver(observer));
});
