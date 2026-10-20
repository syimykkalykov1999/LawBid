// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/saved_chat_ids_envelope.dart';
import '../models/saved_chat_item_list_envelope.dart';
import '../models/saved_chat_tab.dart';

part 'chat_saved_client.g.dart';

@RestApi()
abstract class ChatSavedClient {
  factory ChatSavedClient(Dio dio, {String? baseUrl}) = _ChatSavedClient;

  /// My saved chat messages, newest saved first.
  ///
  /// [tab] - media = photos, videos and voice notes; files = documents; links = messages with a link.
  ///
  /// [q] - Text in the message, the file name, the sender or the chat title.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/saved-chat')
  Future<SavedChatItemListEnvelope> listSavedChat({
    @Query('tab') SavedChatTab? tab,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ids of my saved chat messages
  @GET('/saved-chat/ids')
  Future<SavedChatIdsEnvelope> savedChatIds({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a chat message; idempotent
  @PUT('/saved-chat/{messageId}')
  Future<void> saveChatMessage({
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a chat message from the saved; idempotent
  @DELETE('/saved-chat/{messageId}')
  Future<void> unsaveChatMessage({
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });
}
