// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/quick_reply_envelope.dart';
import '../models/quick_reply_input_dto.dart';
import '../models/quick_reply_list_envelope.dart';

part 'quick_replies_client.g.dart';

@RestApi()
abstract class QuickRepliesClient {
  factory QuickRepliesClient(Dio dio, {String? baseUrl}) = _QuickRepliesClient;

  /// My quick replies in my order
  @GET('/quick-replies')
  Future<QuickReplyListEnvelope> listQuickReplies({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a quick reply (at most 50)
  @POST('/quick-replies')
  Future<QuickReplyEnvelope> createQuickReply({
    @Body() required QuickReplyInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change a quick reply
  @PATCH('/quick-replies/{id}')
  Future<QuickReplyEnvelope> updateQuickReply({
    @Path('id') required String id,
    @Body() required QuickReplyInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a quick reply; idempotent
  @DELETE('/quick-replies/{id}')
  Future<void> deleteQuickReply({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
