import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-11-04 (N-03): the «Awaiting reply» label of a case chat must
/// go away when the talk is over. Telegram / WhatsApp do not nag about a
/// «thanks» either, and Gmail lets you mark a thread «no reply needed».
/// Two ways it goes: a closing phrase («спасибо», «bye») as the last message,
/// or «No reply needed» in the chat's long-press menu until a new message.

/// Lower case, letters and digits only, single spaces.
String normalizeClosing(String text) => text
    .toLowerCase()
    .replaceAll(RegExp(r'[^\p{L}\p{N}\s]', unicode: true), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// The closing phrases (thanks / bye) of [t]'s language plus English, each
/// normalised. Lives in l10n (`chat.closing.phrases`, «|»-separated).
Set<String> closingPhrasesOf(Translator t) {
  const key = 'chat.closing.phrases';
  final out = <String>{};
  for (final tr in <Translator>[t, const StaticTranslatorEn()]) {
    final raw = tr.t(key);
    if (raw == key) continue;
    for (final p in raw.split('|')) {
      final n = normalizeClosing(p);
      if (n.isNotEmpty) out.add(n);
    }
  }
  return out;
}

/// The whole message is only closing phrases («thanks», «thanks, bye»), not
/// «thanks, but …». Words are matched as whole phrases from [phrases].
bool isClosingMessage(String body, Set<String> phrases) {
  final words = normalizeClosing(body).split(' ');
  if (words.length == 1 && words.first.isEmpty) return false;
  if (words.length > 8) return false;
  // reachable[i]: the first i words are made of phrases only.
  final reachable = List<bool>.filled(words.length + 1, false)..[0] = true;
  for (var i = 0; i < words.length; i++) {
    if (!reachable[i]) continue;
    for (var j = i + 1; j <= words.length; j++) {
      if (phrases.contains(words.sublist(i, j).join(' '))) reachable[j] = true;
    }
  }
  return reachable[words.length];
}

final closingPhrasesProvider = Provider<Set<String>>(
  (ref) => closingPhrasesOf(ref.watch(translatorProvider)),
);

/// «No reply needed»: chat id → id of the message that was dismissed. A newer
/// incoming message has another id, so the label comes back by itself.
/// Stored on the phone per user (the label itself is worked out on the phone).
class AwaitingReplyDismissed extends Notifier<Map<String, String>> {
  static const _prefix = 'chat.no_reply.';

  String? get _key {
    final me = ref.read(currentUserIdProvider);
    return me == null ? null : '$_prefix$me';
  }

  @override
  Map<String, String> build() {
    ref.watch(currentUserIdProvider);
    final key = _key;
    if (key == null) return const {};
    try {
      final raw = ref.read(localKvStoreProvider).getString(key);
      if (raw == null) return const {};
      final json = jsonDecode(raw);
      if (json is! Map) return const {};
      return {
        for (final e in json.entries)
          if (e.key is String && e.value is String)
            e.key as String: e.value as String,
      };
    } on Object {
      return const {};
    }
  }

  Future<void> dismiss(String conversationId, String messageId) async {
    state = {...state, conversationId: messageId};
    final key = _key;
    if (key == null) return;
    try {
      await ref.read(localKvStoreProvider).setString(key, jsonEncode(state));
    } on Object {
      // Kept for this run at least.
    }
  }
}

final awaitingReplyDismissedProvider =
    NotifierProvider<AwaitingReplyDismissed, Map<String, String>>(
  AwaitingReplyDismissed.new,
);

/// The label shows when the other side wrote last (not a system line), it is
/// not just «thanks» / «bye», and I did not mark it «no reply needed».
bool awaitsMyReply(
  Conversation c, {
  required String? me,
  required Set<String> closing,
  required Map<String, String> dismissed,
}) {
  final last = c.lastMessage;
  if (last == null || last.senderId == me || last.kind == MessageKind.system) {
    return false;
  }
  if (dismissed[c.id] == last.id) return false;
  if (last.kind == MessageKind.text && isClosingMessage(last.body, closing)) {
    return false;
  }
  return true;
}
