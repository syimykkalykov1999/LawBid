import 'dart:async';
import 'dart:convert' show base64;
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:flutter/painting.dart' show Size;
import 'package:web/web.dart' as web;

/// Owner 2026-10-18 (iPhone, browser): a picked video showed nothing and
/// could not be posted. The video player waits for «can play», which iOS
/// Safari never sends for a video nobody tapped play on, so the length was
/// never known. The length and size come with the metadata instead, which
/// every browser loads on its own.
const _probeTimeout = Duration(seconds: 20);
const _frameTimeout = Duration(seconds: 12);

/// The widest frame we draw (the cover and the trim strip are small).
const _maxFrameWidth = 720;

web.HTMLVideoElement _video(String url, {required String preload}) =>
    web.HTMLVideoElement()
      ..preload = preload
      ..muted = true
      ..playsInline = true
      ..src = url;

void _release(web.HTMLVideoElement v) {
  v
    ..pause()
    ..removeAttribute('src')
    ..load();
}

Future<({int totalMs, Size size})?> probeVideoUrl(String url) async {
  final v = _video(url, preload: 'metadata');
  final done = Completer<({int totalMs, Size size})?>();
  final subs = <StreamSubscription<web.Event>>[
    v.onLoadedMetadata.listen((_) {
      final d = v.duration;
      if (done.isCompleted) return;
      done.complete(
        d.isFinite && d > 0
            ? (
                totalMs: (d * 1000).round(),
                size: Size(v.videoWidth.toDouble(), v.videoHeight.toDouble()),
              )
            : null,
      );
    }),
    v.onError.listen((_) {
      if (!done.isCompleted) done.complete(null);
    }),
  ];
  v.load();
  try {
    return await done.future.timeout(_probeTimeout, onTimeout: () => null);
  } finally {
    for (final s in subs) {
      s.cancel().ignore();
    }
    _release(v);
  }
}

/// One JPEG frame at [ms], drawn from the video into a canvas; null when
/// the browser does not give it (fails soft: the screen shows a plain block).
Future<Uint8List?> videoFrameUrl(String url, int ms, {int quality = 45}) async {
  final v = _video(url, preload: 'auto');
  final subs = <StreamSubscription<web.Event>>[];
  Future<bool> next(Stream<web.Event> s) {
    final c = Completer<bool>();
    subs
      ..add(
        s.listen((_) {
          if (!c.isCompleted) c.complete(true);
        }),
      )
      ..add(
        v.onError.listen((_) {
          if (!c.isCompleted) c.complete(false);
        }),
      );
    return c.future.timeout(_frameTimeout, onTimeout: () => false);
  }

  try {
    final loaded = next(v.onLoadedData);
    v.load();
    if (!await loaded) return null;
    final end = v.duration.isFinite ? v.duration : 0.0;
    final at = (ms / 1000).clamp(0.0, end);
    // A frame exactly at 0 is often black: step in a little.
    final seeked = next(v.onSeeked);
    v.currentTime = at <= 0 ? 0.05 : at;
    if (!await seeked) return null;
    final w = v.videoWidth;
    final h = v.videoHeight;
    if (w <= 0 || h <= 0) return null;
    final scale = w > _maxFrameWidth ? _maxFrameWidth / w : 1.0;
    final canvas = web.HTMLCanvasElement()
      ..width = (w * scale).round()
      ..height = (h * scale).round();
    canvas.context2D.drawImage(
      v,
      0,
      0,
      canvas.width.toDouble(),
      canvas.height.toDouble(),
    );
    final data = canvas.toDataURL('image/jpeg', (quality / 100).toJS);
    final comma = data.indexOf(',');
    if (comma < 0) return null;
    return base64.decode(data.substring(comma + 1));
  } on Object {
    return null;
  } finally {
    for (final s in subs) {
      s.cancel().ignore();
    }
    _release(v);
  }
}
