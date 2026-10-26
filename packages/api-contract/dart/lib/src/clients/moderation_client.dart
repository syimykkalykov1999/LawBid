// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_appeal_dto.dart';
import '../models/moderation_notice_envelope.dart';
import '../models/moderation_notice_list_envelope.dart';

part 'moderation_client.g.dart';

@RestApi()
abstract class ModerationClient {
  factory ModerationClient(Dio dio, {String? baseUrl}) = _ModerationClient;

  /// Moderation decisions on my posts, comments and messages
  @GET('/moderation/notices')
  Future<ModerationNoticeListEnvelope> moderationNotices({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask moderation to look at a decision again
  @POST('/moderation/appeals')
  Future<ModerationNoticeEnvelope> createModerationAppeal({
    @Body() required CreateAppealDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
