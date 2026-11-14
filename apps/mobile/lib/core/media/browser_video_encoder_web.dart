import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/browser_video_compressor.dart';
import 'package:web/web.dart' as web;

/// The browser encoder: web/js/video_compress.js, loaded the first time a
/// video is sent (an absolute path: the app's code lives under v/<sha>/).
BrowserVideoEncoder createBrowserVideoEncoder() => _JsEncoder();

extension type _Module._(JSObject _) implements JSObject {
  external JSPromise<web.Blob?> compress(
    JSString url,
    JSNumber maxShortSide,
    JSNumber frameRate,
    JSNumber bitrateKbps,
    JSFunction onProgress,
  );
  external JSPromise<JSAny?> cancel();
}

class _JsEncoder implements BrowserVideoEncoder {
  static const _path = '/js/video_compress.js';
  _Module? _module;

  @override
  bool get supported =>
      globalContext.has('VideoEncoder') && globalContext.has('VideoDecoder');

  @override
  Future<XFile?> encode(
    XFile source, {
    required int maxShortSide,
    required int frameRate,
    required int bitrateKbps,
    void Function(double progress)? onProgress,
  }) async {
    final module =
        _module ??= (await importModule(_path.toJS).toDart) as _Module;
    final blob = await module
        .compress(
          source.path.toJS,
          maxShortSide.toJS,
          frameRate.toJS,
          bitrateKbps.toJS,
          ((JSNumber p) => onProgress?.call(p.toDartDouble.clamp(0, 1))).toJS,
        )
        .toDart;
    if (blob == null) return null;
    return XFile(
      web.URL.createObjectURL(blob),
      mimeType: 'video/mp4',
      length: blob.size,
      name: 'video.mp4',
    );
  }

  @override
  Future<void> cancel() async {
    await _module?.cancel().toDart;
  }
}
