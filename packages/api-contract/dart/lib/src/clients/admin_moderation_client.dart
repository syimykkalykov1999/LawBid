// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/moderation_action_dto.dart';
import '../models/moderation_action_result_envelope.dart';
import '../models/moderation_card_envelope.dart';
import '../models/moderation_queue_item_list_envelope.dart';
import '../models/status3.dart';
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
    @Query('status') Status3? status = Status3.open,
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
}
