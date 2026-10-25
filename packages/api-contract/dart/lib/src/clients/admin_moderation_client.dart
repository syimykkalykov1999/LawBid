// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/appeal_decision_dto.dart';
import '../models/appeal_decision_result_envelope.dart';
import '../models/appeal_item_list_envelope.dart';
import '../models/auto_action_list_envelope.dart';
import '../models/auto_metrics_envelope.dart';
import '../models/decision_dto.dart';
import '../models/journal_item_list_envelope.dart';
import '../models/moderation_action_dto.dart';
import '../models/moderation_action_result_envelope.dart';
import '../models/moderation_card_envelope.dart';
import '../models/moderation_queue_item_list_envelope.dart';
import '../models/note_dto.dart';
import '../models/reporter_row_list_envelope.dart';
import '../models/restrict_reporter_dto.dart';
import '../models/status11.dart';
import '../models/status12.dart';
import '../models/status13.dart';
import '../models/status_result_envelope.dart';
import '../models/strike_list_envelope.dart';
import '../models/target_type.dart';
import '../models/type2.dart';

part 'admin_moderation_client.g.dart';

@RestApi()
abstract class AdminModerationClient {
  factory AdminModerationClient(Dio dio, {String? baseUrl}) =
      _AdminModerationClient;

  /// Reports grouped by object, oldest first.
  ///
  /// [priority] - Only objects flagged for priority review (verified attorneys).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/moderation/queue')
  Future<ModerationQueueItemListEnvelope> moderationQueue({
    @Query('targetType') TargetType? targetType,
    @Query('priority') bool? priority,
    @Query('cursor') String? cursor,
    @Query('status') Status11? status = Status11.open,
    @Query('limit') int? limit = 20,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Object, its reports, author and history
  @GET('/admin/moderation/targets/{type}/{id}')
  Future<ModerationCardEnvelope> moderationCard({
    @Path('type') required Type2 type,
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// hide / remove / warn / suspend / restore / dismiss (reason required)
  @POST('/admin/moderation/targets/{type}/{id}/actions')
  Future<ModerationActionResultEnvelope> moderationAct({
    @Path('type') required Type2 type,
    @Path('id') required String id,
    @Body() required ModerationActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Appeals against moderation decisions.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/moderation/appeals')
  Future<AppealItemListEnvelope> moderationAppealsQueue({
    @Query('cursor') String? cursor,
    @Query('status') Status12? status = Status12.pending,
    @Query('limit') int? limit = 20,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept (restores the content) or reject an appeal; note required
  @POST('/admin/moderation/appeals/{id}/decision')
  Future<AppealDecisionResultEnvelope> decideModerationAppeal({
    @Path('id') required String id,
    @Body() required AppealDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Journal of moderation decisions, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/moderation/journal')
  Future<JournalItemListEnvelope> moderationJournal({
    @Query('limit') int? limit = 30,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reporters by how many of their reports were dismissed
  @GET('/admin/moderation/reporters')
  Future<ReporterRowListEnvelope> listReporters({
    @Query('onlyRestricted') bool? onlyRestricted,
    @Query('appeals') bool? appeals,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Lift a reporter warning or pause
  @POST('/admin/moderation/reporters/{userId}/clear')
  Future<void> clearReporter({
    @Path('userId') required String userId,
    @Body() required NoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pause a reporter by hand
  @POST('/admin/moderation/reporters/{userId}/restrict')
  Future<void> restrictReporter({
    @Path('userId') required String userId,
    @Body() required RestrictReporterDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve or reject a reporter appeal
  @POST('/admin/moderation/reporters/{userId}/appeal-decision')
  Future<StatusResultEnvelope> decideReporterAppeal({
    @Path('userId') required String userId,
    @Body() required DecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Strikes (all, or of one user)
  @GET('/admin/moderation/strikes')
  Future<StrikeListEnvelope> listStrikes({
    @Query('userId') String? userId,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Revoke a strike (lifts its limit)
  @POST('/admin/moderation/strikes/{id}/revoke')
  Future<void> revokeStrike({
    @Path('id') required String id,
    @Body() required NoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Automatic decisions: waiting appeals, decided ones, or the priority-review list
  @GET('/admin/moderation/auto-actions')
  Future<AutoActionListEnvelope> listAuto({
    @Query('limit') int? limit,
    @Query('status') Status13? status = Status13.pending,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve (restores account, content and strikes) or reject an appeal
  @POST('/admin/moderation/auto-actions/{id}/decision')
  Future<StatusResultEnvelope> decideAuto({
    @Path('id') required String id,
    @Body() required DecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close a priority-review entry
  @POST('/admin/moderation/auto-actions/{id}/close-review')
  Future<void> closeReview({
    @Path('id') required String id,
    @Body() required NoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Automatic actions per day, appeal rate, overturn rate and the alarm
  @GET('/admin/moderation/auto-metrics')
  Future<AutoMetricsEnvelope> autoMetrics({
    @Query('days') int? days,
    @Extras() Map<String, dynamic>? extras,
  });
}
