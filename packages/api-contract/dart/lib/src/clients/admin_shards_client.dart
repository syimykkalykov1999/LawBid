// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/shard_action_envelope.dart';
import '../models/shard_move_envelope.dart';
import '../models/shards_overview_envelope.dart';
import '../models/split_plan_envelope.dart';
import '../models/split_start_dto.dart';

part 'admin_shards_client.g.dart';

@RestApi()
abstract class AdminShardsClient {
  factory AdminShardsClient(Dio dio, {String? baseUrl}) = _AdminShardsClient;

  /// Databases, shard distribution, recent moves
  @GET('/admin/shards/overview')
  Future<ShardsOverviewEnvelope> overview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Preview: which logical shards move, rows, time, readiness
  @GET('/admin/shards/split-plan')
  Future<SplitPlanEnvelope> splitPlan({
    @Query('toDb') required String toDb,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start the split (step-up + a second admin must approve)
  @POST('/admin/shards/split')
  Future<ShardActionEnvelope> start({
    @Body() required SplitStartDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Live progress of one move
  @GET('/admin/shards/moves/{id}')
  Future<ShardMoveEnvelope> move({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Roll a move back (step-up)
  @POST('/admin/shards/moves/{id}/rollback')
  Future<ShardActionEnvelope> rollback({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Retry a stopped move from its saved step (step-up)
  @POST('/admin/shards/moves/{id}/resume')
  Future<ShardActionEnvelope> resume({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
