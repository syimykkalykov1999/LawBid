import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: the tabs of the chat «Saved».
enum SavedChatTab {
  all(api.SavedChatTab.all),
  media(api.SavedChatTab.media),
  files(api.SavedChatTab.files),
  links(api.SavedChatTab.links);

  const SavedChatTab(this.wire);

  final api.SavedChatTab wire;
}

/// One saved chat message with the chat it comes from.
@immutable
class SavedChatEntry {
  const SavedChatEntry({
    required this.message,
    required this.chat,
    required this.mine,
    required this.savedAt,
  });

  final ChatMessage message;
  final Conversation chat;

  /// The person wrote it.
  final bool mine;
  final DateTime savedAt;
}

/// Owner 2026-10-20: what chats do besides the message flow — «Сохранённое»
/// and the two cards (an attorney, a place).
class ChatExtrasRepository {
  ChatExtrasRepository(Dio dio)
      : _saved = api.ChatSavedClient(dio),
        _chat = api.ChatClient(dio);

  final api.ChatSavedClient _saved;
  final api.ChatClient _chat;

  Future<CursorPage<SavedChatEntry>> saved({
    SavedChatTab tab = SavedChatTab.all,
    String? query,
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _saved.listSavedChat(
        tab: tab.wire,
        q: (query ?? '').trim().isEmpty ? null : query!.trim(),
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: [
        for (final i in env.data)
          SavedChatEntry(
            message: ChatMappers.message(i.message),
            chat: ChatMappers.conversation(i.chat),
            mine: i.mine,
            savedAt: i.savedAt,
          ),
      ],
      nextCursor: env.meta?.nextCursor,
    );
  }

  Future<Set<String>> savedIds() async =>
      (await guardApiCall(_saved.savedChatIds)).data.ids.toSet();

  Future<void> save(String messageId) =>
      guardApiCall(() => _saved.saveChatMessage(messageId: messageId));

  Future<void> unsave(String messageId) =>
      guardApiCall(() => _saved.unsaveChatMessage(messageId: messageId));

  /// Shares the attorney [userId] as a card.
  Future<ChatMessage> sendContact(
    String conversationId,
    String clientMessageId,
    String userId,
  ) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: conversationId,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.contact,
              contactUserId: userId,
            ),
          ),
        ))
            .data,
      );

  /// Shares an address (opens in the phone's maps).
  Future<ChatMessage> sendPlace(
    String conversationId,
    String clientMessageId,
    String address,
  ) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: conversationId,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.place,
              body: address,
            ),
          ),
        ))
            .data,
      );
}

final chatExtrasRepositoryProvider = Provider<ChatExtrasRepository>(
  (ref) => ChatExtrasRepository(ref.watch(dioProvider)),
);
