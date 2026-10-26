// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/appeal_decision_dto.dart';
import '../models/appeal_decision_result_envelope.dart';
import '../models/appeal_item_list_envelope.dart';
import '../models/journal_item_list_envelope.dart';
import '../models/moderation_action_dto.dart';
import '../models/moderation_action_result_envelope.dart';
import '../models/moderation_card_envelope.dart';
import '../models/moderation_queue_item_list_envelope.dart';
import '../models/status11.dart';
import '../models/status12.dart';
import '../models/target_type.dart';
import '../models/type2.dart';

part 'admin_moderation_client.g.dart';

@RestApi()
abstract class AdminModerationClient {
  factory AdminModerationClient(Dio dio, {String? baseUrl}) =
      _AdminModerationClient;

  /// Reports grouped by object, oldest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/moderation/queue')
  Future<ModerationQueueItemListEnvelope> moderationQueue({
    @Query('targetType') TargetType? targetType,
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
}
