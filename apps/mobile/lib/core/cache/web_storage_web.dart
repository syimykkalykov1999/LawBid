import 'dart:js_interop';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/cache/web_storage.dart';
import 'package:web/web.dart' as web;

/// The browser half of [WebStorageInfo] (package:web, compiles to wasm).
WebStorageInfo createWebStorageInfo() => _Browser();

class _Browser implements WebStorageInfo {
  @override
  Future<({int usage, int quota})?> estimate() async {
    try {
      final e = await web.window.navigator.storage.estimate().toDart;
      return (usage: e.usage, quota: e.quota);
    } on Object catch (e) {
      // Old browsers, private windows.
      debugPrint('storage estimate: $e');
      return null;
    }
  }

  @override
  Future<List<String>> cacheNames() async {
    try {
      final keys = await web.window.caches.keys().toDart;
      return [for (final k in keys.toDart) k.toDart];
    } on Object catch (e) {
      debugPrint('cache storage keys: $e');
      return const [];
    }
  }
}
