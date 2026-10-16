import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data' show ByteData;

import 'package:flutter/services.dart' show FontLoader;
import 'package:lawbid/core/platform/base_uri.dart';
import 'package:web/web.dart' as web;

final Map<String, Future<void>> _loading = {};

/// Fetches `fonts/noto-<name>.ttf` from our own domain once and registers
/// it as the family `LB Noto <name>`. Never throws: a missing font only
/// leaves the old boxes, it never blocks the app.
Future<void> ensureFont(String name) =>
    _loading.putIfAbsent(name, () => _load(name));

Future<void> _load(String name) async {
  try {
    final url = appBaseUri.resolve('fonts/noto-$name.ttf').toString();
    final response = await web.window.fetch(url.toJS).toDart;
    if (!response.ok) return;
    final buffer = await response.arrayBuffer().toDart;
    final family = name == 'names' ? 'LB Noto Names' : 'LB Noto $name';
    final data = buffer.toDart.asByteData();
    final loader = FontLoader(family)
      // ignore: discarded_futures
      ..addFont(Future<ByteData>.value(data));
    await loader.load();
  } on Object {
    unawaited(_loading.remove(name));
  }
}
