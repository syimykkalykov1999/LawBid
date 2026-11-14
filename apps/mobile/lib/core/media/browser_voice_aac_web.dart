import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// web/js/voice_aac.js, loaded the first time a WebM note is converted
/// (an absolute path: the app's code lives under v/<sha>/).
extension type _Module._(JSObject _) implements JSObject {
  external JSPromise<web.Blob?> toAac(
    JSString url,
    JSNumber bitRate,
    JSNumber sampleRate,
  );
}

_Module? _module;

/// Owner rows 101/102: a browser's Opus/WebM voice note → AAC in MP4 (the
/// iPhone app plays only that) where the browser has an AAC encoder. The
/// new blob: link, the old one released; null = keep the WebM note.
Future<String?> browserVoiceToAac(
  String url, {
  required int bitRate,
  required int sampleRate,
}) async {
  try {
    final module = _module ??=
        (await importModule('/js/voice_aac.js'.toJS).toDart) as _Module;
    final blob =
        await module.toAac(url.toJS, bitRate.toJS, sampleRate.toJS).toDart;
    if (blob == null) return null;
    final out = web.URL.createObjectURL(blob);
    web.URL.revokeObjectURL(url);
    return out;
  } on Object {
    return null;
  }
}
