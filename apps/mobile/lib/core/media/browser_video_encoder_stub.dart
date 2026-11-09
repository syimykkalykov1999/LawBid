import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/browser_video_compressor.dart';

/// Not a browser: never used (the phone has its own encoder).
BrowserVideoEncoder createBrowserVideoEncoder() => const _None();

class _None implements BrowserVideoEncoder {
  const _None();

  @override
  bool get supported => false;

  @override
  Future<XFile?> encode(
    XFile source, {
    required int maxShortSide,
    required int frameRate,
    void Function(double progress)? onProgress,
  }) async =>
      null;

  @override
  Future<void> cancel() async {}
}
