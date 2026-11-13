// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/ai_worker_id_envelope.dart';
import '../models/ai_worker_item_status.dart';
import '../models/ai_worker_items_envelope.dart';
import '../models/ai_worker_lane.dart';
import '../models/ai_worker_reviewed_envelope.dart';
import '../models/ai_worker_run_started_envelope.dart';
import '../models/ai_worker_status_envelope.dart';
import '../models/approve_bulk_ai_items_dto.dart';
import '../models/create_ai_role_dto.dart';
import '../models/review_ai_items_dto.dart';
import '../models/start_ai_run_dto.dart';
import '../models/update_ai_role_dto.dart';

part 'admin_ai_worker_client.g.dart';

@RestApi()
abstract class AdminAiWorkerClient {
  factory AdminAiWorkerClient(Dio dio, {String? baseUrl}) =
      _AdminAiWorkerClient;

  /// AI worker: roles, runs, money, proposals
  @GET('/admin/ai-worker')
  Future<AiWorkerStatusEnvelope> getAiWorker({
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: the review queue (proposals)
  @GET('/admin/ai-worker/items')
  Future<AiWorkerItemsEnvelope> getAiWorkerItems({
    @Query('status') AiWorkerItemStatus? status,
    @Query('lane') AiWorkerLane? lane,
    @Query('runId') String? runId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: write a role once
  @POST('/admin/ai-worker/roles')
  Future<AiWorkerIdEnvelope> createAiRole({
    @Body() required CreateAiRoleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: change a role
  @PATCH('/admin/ai-worker/roles/{id}')
  Future<AiWorkerIdEnvelope> updateAiRole({
    @Path('id') required String id,
    @Body() required UpdateAiRoleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: put a role away (kept for history)
  @POST('/admin/ai-worker/roles/{id}/archive')
  Future<AiWorkerIdEnvelope> archiveAiRole({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: start a background mass run of a role
  @POST('/admin/ai-worker/roles/{id}/runs')
  Future<AiWorkerRunStartedEnvelope> startAiRun({
    @Path('id') required String id,
    @Body() required StartAiRunDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: stop a run
  @POST('/admin/ai-worker/runs/{id}/cancel')
  Future<AiWorkerIdEnvelope> cancelAiRun({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: approve or reject proposals (one or many)
  @POST('/admin/ai-worker/items/review')
  Future<AiWorkerReviewedEnvelope> reviewAiItems({
    @Body() required ReviewAiItemsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI worker: approve the whole confident («bulk») list
  @POST('/admin/ai-worker/items/approve-bulk')
  Future<AiWorkerReviewedEnvelope> approveBulkAiItems({
    @Body() required ApproveBulkAiItemsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
