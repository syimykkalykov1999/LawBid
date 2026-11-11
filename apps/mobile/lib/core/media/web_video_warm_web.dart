import 'package:lawbid/core/media/web_video_warm.dart';
import 'package:web/web.dart' as web;

/// The browser half of [WebVideoWarm] (package:web, compiles to wasm).
VideoWarmElements createVideoWarmElements() => _BrowserElements();

class _BrowserElements implements VideoWarmElements {
  final _videos = <String, web.HTMLVideoElement>{};

  @override
  void open(String url) {
    if (_videos.containsKey(url)) return;
    // Never on the page, never played: muted and inline so no browser
    // treats it as media that wants the screen or the speaker.
    final v = web.HTMLVideoElement()
      ..muted = true
      ..playsInline = true
      ..preload = 'metadata'
      ..src = url;
    _videos[url] = v;
  }

  @override
  void close(String url) {
    final v = _videos.remove(url);
    if (v == null) return;
    // The HTML spec's way to stop a media element's download.
    v
      ..removeAttribute('src')
      ..load();
  }
}
