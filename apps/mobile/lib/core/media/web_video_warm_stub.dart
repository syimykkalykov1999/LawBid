import 'package:lawbid/core/media/web_video_warm.dart';

/// Not a browser: the phones warm through HlsPrefetcher and the disk cache.
VideoWarmElements createVideoWarmElements() => _NoElements();

class _NoElements implements VideoWarmElements {
  @override
  void open(String url) {}

  @override
  void close(String url) {}
}
