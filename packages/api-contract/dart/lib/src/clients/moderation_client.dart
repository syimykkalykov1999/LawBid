// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/appeal_message_dto.dart';
import '../models/auto_action_envelope.dart';
import '../models/create_appeal_dto.dart';
import '../models/moderation_notice_envelope.dart';
import '../models/moderation_notice_list_envelope.dart';
import '../models/my_standing_envelope.dart';
import '../models/reporting_status_envelope.dart';

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

  /// My strikes, current limit, reporting status and automatic decisions
  @GET('/moderation/standing')
  Future<MyStandingEnvelope> myStanding({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Appeal a warning or pause of my reports
  @POST('/moderation/reporting-appeal')
  Future<ReportingStatusEnvelope> appealReporting({
    @Body() required AppealMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Appeal an automatic moderation decision
  @POST('/moderation/auto-actions/{id}/appeal')
  Future<AutoActionEnvelope> appealAuto({
    @Path('id') required String id,
    @Body() required AppealMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
