import 'package:dio/dio.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// docs/05 §8 chats for the app. Throws [ApiException].
abstract interface class ChatRepository {
  Future<CursorPage<Conversation>> conversations(
      {String? cursor, DateTime? updatedSince});
  Future<Conversation> conversation(String id);
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor});

  /// Catch-up after a reconnect (§8.5), oldest first.
  Future<List<ChatMessage>> messagesAfter(String id, String afterId);
  Future<ChatMessage> send(String id, String clientMessageId, String body);
  Future<void> read(String id, String lastReadMessageId);
  Future<Conversation> mute(String id, DateTime? until);
}

class ApiChatRepository implements ChatRepository {
  ApiChatRepository(Dio dio) : _chat = api.ChatClient(dio);

  final api.ChatClient _chat;

  @override
  Future<CursorPage<Conversation>> conversations(
      {String? cursor, DateTime? updatedSince}) async {
    final env = await guardApiCall(() => _chat.listConversations(
          cursor: cursor,
          updatedSince: updatedSince?.toUtc().toIso8601String(),
        ));
    return CursorPage(
      items: env.data.map(ChatMappers.conversation).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Conversation> conversation(String id) async => ChatMappers.conversation(
      (await guardApiCall(() => _chat.getConversation(id: id))).data);

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async {
    final env =
        await guardApiCall(() => _chat.listMessages(id: id, cursor: cursor));
    return CursorPage(
      items: env.data.map(ChatMappers.message).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<List<ChatMessage>> messagesAfter(String id, String afterId) async =>
      (await guardApiCall(() => _chat.listMessages(id: id, afterId: afterId)))
          .data
          .map(ChatMappers.message)
          .toList();

  @override
  Future<ChatMessage> send(
          String id, String clientMessageId, String body) async =>
      ChatMappers.message((await guardApiCall(() => _chat.sendMessage(
                id: id,
                body: api.SendMessageDto(
                    clientMessageId: clientMessageId, body: body),
              )))
          .data);

  @override
  Future<void> read(String id, String lastReadMessageId) => guardApiCall(
        () => _chat.readConversation(
          id: id,
          body: api.ReadConversationDto(lastReadMessageId: lastReadMessageId),
        ),
      );

  @override
  Future<Conversation> mute(String id, DateTime? until) async =>
      ChatMappers.conversation((await guardApiCall(() => _chat.muteConversation(
                id: id,
                body: api.MuteConversationDto(
                    until: until?.toUtc().toIso8601String()),
              )))
          .data);
}

abstract final class ChatMappers {
  static ChatMessage message(api.MessageDto d) => ChatMessage(
        id: d.id,
        conversationId: d.conversationId,
        senderId: d.senderId,
        kind: d.type == api.MessageDtoType.system
            ? MessageKind.system
            : MessageKind.text,
        body: d.body,
        contactMasked: d.contactMasked,
        clientMessageId: d.clientMessageId,
        createdAt: d.createdAt,
      );

  static Conversation conversation(api.ConversationDto d) => Conversation(
        id: d.id,
        caseId: d.caseId,
        caseTitle: d.caseTitle,
        status: switch (d.status) {
          api.ConversationDtoStatus.active => ConversationStatus.active,
          api.ConversationDtoStatus.closed => ConversationStatus.closed,
          _ => ConversationStatus.preAcceptance,
        },
        contactsUnlocked: d.contactsUnlocked,
        counterpart: Counterpart(
          isAttorney:
              d.counterpart.kind == api.ConversationCounterpartDtoKind.attorney,
          id: d.counterpart.id,
          displayName: d.counterpart.displayName,
          username: d.counterpart.username,
          avatarUrl: d.counterpart.avatarUrl,
          verified: d.counterpart.verifiedBadge,
        ),
        lastMessage: d.lastMessage == null ? null : message(d.lastMessage!),
        lastMessageAt: d.lastMessageAt,
        unreadCount: d.unreadCount.toInt(),
        mutedUntil: d.mutedUntil,
        counterpartLastReadId: d.counterpartLastReadMessageId,
        updatedAt: d.updatedAt,
      );

  /// A realtime `message:new` payload (same shape as MessageDto).
  static ChatMessage? fromEvent(Object? data) {
    if (data is! Map) return null;
    final m = data['message'];
    if (m is! Map) return null;
    try {
      return message(api.MessageDto.fromJson(Map<String, dynamic>.from(m)));
    } on Object {
      return null;
    }
  }
}
