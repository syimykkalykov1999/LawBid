import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/web_blob_store.dart';

/// SPEED_MATRIX 2026-11-09 §2.3 (site, Telegram Web / WhatsApp Web): a
/// voice note is downloaded once and kept in the browser's Cache Storage
/// under the message id — the phone keeps `voice_cache_<id>.m4a` the same
/// way (`voiceCachePath`). The second play, a replay after a reload and a
/// play while offline never touch the network. Notes older than [maxAge]
/// are swept on the first write; «Очистить кэш» → «Медиа чатов» and
/// leaving the account drop the whole cache ([clear]).
class VoiceWebCache {
  VoiceWebCache({WebBlobStore? store, this.maxAge = const Duration(days: 30)})
      : _store = store ?? WebBlobStore();

  /// The Cache Storage cache of the notes.
  static const cacheName = 'lawbid_voice';

  final WebBlobStore _store;
  final Duration maxAge;
  bool _swept = false;

  /// Test hook: the clock the sweep compares against.
  DateTime Function() now = DateTime.now;

  /// The note's bytes: from the cache, else from [fetch] (kept when it
  /// answers). Null when [fetch] has nothing — nothing is kept then.
  Future<Uint8List?> bytes(
    String messageId,
    Future<Uint8List?> Function() fetch,
  ) async {
    try {
      final kept = await _store.get(cacheName, messageId);
      if (kept != null && kept.isNotEmpty) return kept;
    } on Object catch (e) {
      debugPrint('voice cache read: $e');
    }
    final fresh = await fetch();
    if (fresh == null || fresh.isEmpty) return null;
    try {
      await _sweep();
      await _store.put(cacheName, messageId, fresh);
    } on Object catch (e) {
      // A full or closed store: the note still plays from memory.
      debugPrint('voice cache write: $e');
    }
    return fresh;
  }

  Future<void> _sweep() async {
    if (_swept) return;
    _swept = true;
    final cutoff = now().subtract(maxAge);
    for (final b in await _store.list(cacheName)) {
      if (b.written.isBefore(cutoff)) await _store.delete(cacheName, b.key);
    }
  }

  Future<void> clear() => _store.clear(cacheName);
}

final voiceWebCacheProvider = Provider<VoiceWebCache>((ref) => VoiceWebCache());
