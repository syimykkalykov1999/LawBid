// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/conversation_envelope.dart';
import '../models/conversation_list_envelope.dart';
import '../models/message_envelope.dart';
import '../models/message_list_envelope.dart';
import '../models/mute_conversation_dto.dart';
import '../models/read_conversation_dto.dart';
import '../models/read_result_envelope.dart';
import '../models/send_message_dto.dart';

part 'chat_client.g.dart';

@RestApi()
abstract class ChatClient {
  factory ChatClient(Dio dio, {String? baseUrl}) = _ChatClient;

  /// My conversations, newest first (§8.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [updatedSince] - Only conversations changed since (ISO time) — catch-up after a reconnect (§8.5).
  @GET('/conversations')
  Future<ConversationListEnvelope> listConversations({
    @Query('cursor') String? cursor,
    @Query('updatedSince') String? updatedSince,
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
  @GET('/conversations/{id}/messages')
  Future<MessageListEnvelope> listMessages({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Query('afterId') String? afterId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send, idempotent on clientMessageId (§8.4)
  @POST('/conversations/{id}/messages')
  Future<MessageEnvelope> sendMessage({
    @Path('id') required String id,
    @Body() required SendMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The recipient played a voice message (OQ-040)
  @POST('/conversations/{id}/messages/{messageId}/listened')
  Future<MessageEnvelope> voiceListened({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark read up to a message (§8.4)
  @POST('/conversations/{id}/read')
  Future<ReadResultEnvelope> readConversation({
    @Path('id') required String id,
    @Body() required ReadConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mute push until a time; null unmutes (§8.4)
  @PATCH('/conversations/{id}/mute')
  Future<ConversationEnvelope> muteConversation({
    @Path('id') required String id,
    @Body() required MuteConversationDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
