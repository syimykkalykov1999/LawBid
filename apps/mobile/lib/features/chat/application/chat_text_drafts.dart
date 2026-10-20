import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-20 (Telegram / WhatsApp): the text typed in a chat and not
/// sent yet, kept per conversation while the app runs. The chats list shows
/// it as «Drafts: …» in red under the name.
class ChatTextDrafts extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() => const {};

  String? of(String conversationId) => state[conversationId];

  /// An empty (or blank) [text] drops the draft.
  void set(String conversationId, String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      if (!state.containsKey(conversationId)) return;
      state = {...state}..remove(conversationId);
      return;
    }
    if (state[conversationId] == text) return;
    state = {...state, conversationId: text};
  }
}

final chatTextDraftsProvider =
    NotifierProvider<ChatTextDrafts, Map<String, String>>(ChatTextDrafts.new);
