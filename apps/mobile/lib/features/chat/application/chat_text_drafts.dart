import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-20 (Telegram / WhatsApp): the text typed in a chat and not
/// sent yet, kept per conversation. The chats list shows it as «Drafts: …»
/// in red under the name. Owner 2026-10-20: drafts also survive an app
/// restart — they are written to the device (per account), a moment after
/// the last keystroke.
class ChatTextDrafts extends Notifier<Map<String, String>> {
  Timer? _flush;

  late String _key;
  SharedPreferences? _store;
  Map<String, String> _latest = const {};

  @override
  Map<String, String> build() {
    _key = 'chat.textDrafts.v1.${ref.read(currentUserIdProvider)}';
    try {
      _store = ref.read(sharedPreferencesProvider);
    } on Object {
      // No device storage (a test without it): drafts live in memory only.
      _store = null;
    }
    ref.onDispose(() {
      if (_flush?.isActive ?? false) {
        _flush!.cancel();
        _write(_latest);
      }
    });
    return _latest = _load();
  }

  Map<String, String> _load() {
    final raw = _store?.getString(_key);
    if (raw == null) return const {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const {};
      return {
        for (final e in decoded.entries)
          if (e.key is String && e.value is String)
            e.key as String: e.value as String,
      };
    } on FormatException {
      return const {};
    }
  }

  String? of(String conversationId) => state[conversationId];

  /// An empty (or blank) [text] drops the draft.
  void set(String conversationId, String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      if (!state.containsKey(conversationId)) return;
      state = {...state}..remove(conversationId);
    } else {
      if (state[conversationId] == text) return;
      state = {...state, conversationId: text};
    }
    _latest = state;
    _flush?.cancel();
    _flush = Timer(const Duration(milliseconds: 400), () => _write(_latest));
  }

  void _write(Map<String, String> drafts) {
    final prefs = _store;
    if (prefs == null) return;
    unawaited(
      (drafts.isEmpty
              ? prefs.remove(_key)
              : prefs.setString(_key, jsonEncode(drafts)))
          .catchError((Object _) => false),
    );
  }
}

final chatTextDraftsProvider =
    NotifierProvider<ChatTextDrafts, Map<String, String>>(ChatTextDrafts.new);
