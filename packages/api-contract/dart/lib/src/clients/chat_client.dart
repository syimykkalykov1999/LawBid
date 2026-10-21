// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/chat_folder_counts_envelope.dart';
import '../models/chat_storage_envelope.dart';
import '../models/conversation_envelope.dart';
import '../models/conversation_folder.dart';
import '../models/conversation_list_envelope.dart';
import '../models/delete_scope.dart';
import '../models/delivered_conversation_dto.dart';
import '../models/delivered_result_envelope.dart';
import '../models/edit_message_dto.dart';
import '../models/message_envelope.dart';
import '../models/message_list_envelope.dart';
import '../models/message_translation_envelope.dart';
import '../models/messages_filter.dart';
import '../models/mute_calls_dto.dart';
import '../models/mute_conversation_dto.dart';
import '../models/organize_conversation_dto.dart';
import '../models/pins_envelope.dart';
import '../models/react_message_dto.dart';
import '../models/read_conversation_dto.dart';
import '../models/read_result_envelope.dart';
import '../models/requests_count_envelope.dart';
import '../models/send_message_dto.dart';
import '../models/set_disappearing_dto.dart';
import '../models/start_direct_chat_dto.dart';
import '../models/translate_message_dto.dart';

part 'chat_client.g.dart';

@RestApi()
abstract class ChatClient {
  factory ChatClient(Dio dio, {String? baseUrl}) = _ChatClient;

  /// My conversations, newest first (§8.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [updatedSince] - Only conversations changed since (ISO time) — catch-up after a reconnect (§8.5).
  ///
  /// [folder] - Owner 2026-10-01: all · primary (case chats by default) · general · waiting (marked "waiting for my answer") · requests (OQ-043, message requests sent to me) · cases (Owner 2026-10-21: only the chats tied to a case) · archive (Owner 2026-10-20: my archived chats; every other folder leaves them out).
  ///
  /// [q] - Owner 2026-10-18: search my chats — the other person's name (any alphabet, typos, word order) or @username, the case title, or the words of any message. Items then carry matchedMessage.
  @GET('/conversations')
  Future<ConversationListEnvelope> listConversations({
    @Query('cursor') String? cursor,
    @Query('updatedSince') String? updatedSince,
    @Query('folder') ConversationFolder? folder,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Waiting / Requests folder badges (owner 2026-10-01)
  @GET('/conversations/folders/counts')
  Future<ChatFolderCountsEnvelope> folderCounts({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Message requests waiting for me (OQ-043)
  @GET('/conversations/requests/count')
  Future<RequestsCountEnvelope> requestsCount({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Open the direct chat with a person ("Message" on a profile)
  @POST('/conversations/direct')
  Future<ConversationEnvelope> startDirectChat({
    @Body() required StartDirectChatDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept a message request (OQ-043)
  @POST('/conversations/{id}/request/accept')
  Future<ConversationEnvelope> acceptMessageRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a message request (OQ-043)
  @POST('/conversations/{id}/request/decline')
  Future<ConversationEnvelope> declineMessageRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One conversation
  @GET('/conversations/{id}')
  Future<ConversationEnvelope> getConversation({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Messages, newest first; or after an id (§8.5).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [afterId] - Messages after this one, oldest first — catch-up after a reconnect (§8.5).
  ///
  /// [only] - OQ-047: only photos and documents (the chat's "Files" screen).
  @GET('/conversations/{id}/messages')
  Future<MessageListEnvelope> listMessages({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Query('afterId') String? afterId,
    @Query('only') MessagesFilter? only,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send, idempotent on clientMessageId (§8.4)
  @POST('/conversations/{id}/messages')
  Future<MessageEnvelope> sendMessage({
    @Path('id') required String id,
    @Body() required SendMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Files in this chat: how many of each kind, bytes, the cap
  @GET('/conversations/{id}/storage')
  Future<ChatStorageEnvelope> getConversationStorage({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The recipient played a voice message (OQ-040)
  @POST('/conversations/{id}/messages/{messageId}/listened')
  Future<MessageEnvelope> voiceListened({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Translate one message into a language (owner 2026-10-04)
  @POST('/conversations/{id}/messages/{messageId}/translate')
  Future<MessageTranslationEnvelope> translateMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Body() required TranslateMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark read up to a message (§8.4)
  @POST('/conversations/{id}/read')
  Future<ReadResultEnvelope> readConversation({
    @Path('id') required String id,
    @Body() required ReadConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The device received messages up to this one (two grey ticks)
  @POST('/conversations/{id}/delivered')
  Future<DeliveredResultEnvelope> deliveredConversation({
    @Path('id') required String id,
    @Body() required DeliveredConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My folder (primary/general/auto), "waiting for my answer", a pinned note, pin to top
  @PATCH('/conversations/{id}/organize')
  Future<ConversationEnvelope> organizeConversation({
    @Path('id') required String id,
    @Body() required OrganizeConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mute push until a time; null unmutes (§8.4)
  @PATCH('/conversations/{id}/mute')
  Future<ConversationEnvelope> muteConversation({
    @Path('id') required String id,
    @Body() required MuteConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Calls of this chat ring silently (or not)
  @PATCH('/conversations/{id}/calls-mute')
  Future<ConversationEnvelope> muteChatCalls({
    @Path('id') required String id,
    @Body() required MuteCallsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Disappearing messages: 24 h / 7 d / 90 d for new messages; null = off
  @PATCH('/conversations/{id}/disappearing')
  Future<ConversationEnvelope> setDisappearing({
    @Path('id') required String id,
    @Body() required SetDisappearingDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit your text message within the edit window
  @PATCH('/conversations/{id}/messages/{messageId}')
  Future<MessageEnvelope> editChatMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Body() required EditMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a message for me or (within the window) for everyone.
  ///
  /// [scope] - me: only for the viewer; all: for everyone (time window).
  @DELETE('/conversations/{id}/messages/{messageId}')
  Future<void> deleteChatMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Query('scope') required DeleteScope scope,
    @Extras() Map<String, dynamic>? extras,
  });

  /// React with one emoji (null removes it)
  @PUT('/conversations/{id}/messages/{messageId}/reaction')
  Future<MessageEnvelope> reactToChatMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Body() required ReactMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pin a message to the top of the chat
  @POST('/conversations/{id}/messages/{messageId}/pin')
  Future<MessageEnvelope> pinChatMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unpin a message
  @DELETE('/conversations/{id}/messages/{messageId}/pin')
  Future<MessageEnvelope> unpinChatMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The chat's pinned messages
  @GET('/conversations/{id}/pins')
  Future<PinsEnvelope> listChatPins({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
