import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/translation/presentation/translate_action.dart';

/// Owner 2026-10-20 (Telegram): «Перевести» lives in the long-press menu of
/// a message, never under it. Off until the admin switches `chat_translate`
/// on; while off nothing shows and no language model is downloaded.

/// Translations the person asked for, by message id. A message is in this
/// map while its translation is shown; «Показать оригинал» removes it.
final chatTranslationsProvider =
    NotifierProvider<ChatTranslations, Map<String, String>>(
  ChatTranslations.new,
);

/// See [chatTranslationsProvider].
class ChatTranslations extends Notifier<Map<String, String>> {
  final _cache = <String, String>{};

  @override
  Map<String, String> build() => const {};

  /// Shows the cached translation of [id], or the original when [text] is
  /// null.
  void show(String id, String? text) {
    final next = {...state};
    if (text == null) {
      next.remove(id);
    } else {
      _cache[id] = text;
      next[id] = text;
    }
    state = next;
  }

  /// The translation done earlier, if any.
  String? cached(String id) => _cache[id];
}

/// Whether the menu of [m] offers translation: flag on, someone else's
/// plain text.
bool canTranslateChatMessage(
  WidgetRef ref,
  ChatMessage m, {
  required bool mine,
}) =>
    !mine &&
    !m.revoked &&
    m.kind == MessageKind.text &&
    m.body.trim().isNotEmpty &&
    ref.read(featureFlagsControllerProvider).isEnabled('chat_translate');

/// Translates [m] on the phone (ML Kit, free); the paid server only when the
/// phone has no model for the pair. A second call shows the original.
Future<void> toggleChatTranslation(
  BuildContext context,
  WidgetRef ref,
  String threadId,
  ChatMessage m,
) async {
  final notifier = ref.read(chatTranslationsProvider.notifier);
  if (ref.read(chatTranslationsProvider).containsKey(m.id)) {
    notifier.show(m.id, null);
    return;
  }
  final cached = notifier.cached(m.id);
  if (cached != null) {
    notifier.show(m.id, cached);
    return;
  }
  final text = await translateOnRequest(
    context,
    ref,
    m.body,
    server: (target) =>
        ref.read(chatRepositoryProvider).translate(threadId, m.id, target),
  );
  if (text != null) notifier.show(m.id, text);
}
