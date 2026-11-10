import 'package:flutter/foundation.dart';
import 'package:lawbid/core/media/web_video_warm_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/media/web_video_warm_web.dart'
    as impl;

/// What a browser can open to read the start of a video without playing
/// it: an `<video preload="metadata">` that is never put on the page.
abstract interface class VideoWarmElements {
  /// The browser's elements, or nothing where there is no browser.
  factory VideoWarmElements() => impl.createVideoWarmElements();

  /// Starts reading the head of [url] (container header, first frames).
  void open(String url);

  /// Stops it and lets the browser drop what it read.
  void close(String url);
}

/// B-c2 (b), 2026-11-09: the site's reels start sooner. In the browser the
/// player opens the MP4 copy (`VideoInfo.prefersMp4`: a browser cannot play
/// HLS by itself and the app ships no hls.js), so the phone's warm-up
/// (`HlsPrefetcher`: playlist + first segment through the disk cache) has
/// nothing to read there, and the disk cache itself (a loopback proxy,
/// `VideoCache`) cannot exist in a tab without a service worker. What does
/// work in every browser is what the HTML spec gives `preload="metadata"`:
/// a detached `<video>` element reads the head of the file (Bunny edge and
/// the browser's HTTP cache are warm), and the real player that opens the
/// same URL a moment later starts from those bytes.
///
/// Bounded like the phone (Meta's preload manager, Instagram): at most
/// [maxElements] heads at once, only the pages past the two neighbours whose
/// players are already open (`WarmPlan.players`), and only when the same
/// gate as the phone allows it (admin «Выкл» / data saver: [allow]).
class WebVideoWarm {
  WebVideoWarm({VideoWarmElements? elements, this.maxElements = 2})
      : _elements = elements ?? VideoWarmElements();

  static final WebVideoWarm instance = WebVideoWarm();

  final VideoWarmElements _elements;

  /// At most this many heads are read at once.
  final int maxElements;

  /// The phone's gate (prefetch_policy.dart). Default: allowed.
  bool Function() allow = () => true;

  final _open = <String>[];

  @visibleForTesting
  List<String> get warming => List.unmodifiable(_open);

  /// Keeps the heads of [urls] (nearest first) warm; the ones no longer
  /// wished for are closed.
  void warm(Iterable<String> urls) {
    final wanted = allow()
        ? urls
            .where((u) => u.startsWith('https://'))
            .toSet()
            .take(maxElements)
            .toList()
        : const <String>[];
    for (final u in List.of(_open)) {
      if (!wanted.contains(u)) {
        _open.remove(u);
        _elements.close(u);
      }
    }
    for (final u in wanted) {
      if (_open.contains(u)) continue;
      _open.add(u);
      _elements.open(u);
    }
  }

  /// The viewer left the reels.
  void clear() => warm(const []);
}
