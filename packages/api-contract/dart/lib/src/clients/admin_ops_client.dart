// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/heavy_jobs_dto.dart';
import '../models/partition_card_list_envelope.dart';
import '../models/partition_mode_dto.dart';
import '../models/partition_pause_dto.dart';
import '../models/replica_status_envelope.dart';
import '../models/replica_toggle_dto.dart';
import '../models/scale_dto.dart';
import '../models/scale_extras_envelope.dart';
import '../models/system_health_envelope.dart';
import '../models/update_ops_settings_dto.dart';

part 'admin_ops_client.g.dart';

@RestApi()
abstract class AdminOpsClient {
  factory AdminOpsClient(Dio dio, {String? baseUrl}) = _AdminOpsClient;

  /// Read copy of the database: state, lag
  @GET('/admin/system-health/db-replica')
  Future<ReplicaStatusEnvelope> getReplica({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create / delete the read copy (step-up)
  @POST('/admin/system-health/db-replica')
  Future<ReplicaStatusEnvelope> setReplica({
    @Body() required ReplicaToggleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tables and their monthly partitioning state
  @GET('/admin/system-health/partitions')
  Future<PartitionCardListEnvelope> getPartitions({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start the online conversion of a table to monthly partitions (step-up)
  @POST('/admin/system-health/partitions/{table}/start')
  Future<PartitionCardListEnvelope> startPartition({
    @Path('table') required String table,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Swap the old table back (step-up)
  @POST('/admin/system-health/partitions/{table}/undo')
  Future<PartitionCardListEnvelope> undoPartition({
    @Path('table') required String table,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete the old copy for good (step-up)
  @POST('/admin/system-health/partitions/{table}/finalize')
  Future<PartitionCardListEnvelope> finalizePartition({
    @Path('table') required String table,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pause / resume a running conversion (step-up)
  @POST('/admin/system-health/partitions/{table}/pause')
  Future<PartitionCardListEnvelope> pausePartition({
    @Path('table') required String table,
    @Body() required PartitionPauseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Try a failed step again (step-up)
  @POST('/admin/system-health/partitions/{table}/retry')
  Future<PartitionCardListEnvelope> retryPartition({
    @Path('table') required String table,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hash tables: «Выкл / Вкл / Авто» of the online conversion (step-up)
  @POST('/admin/system-health/partitions/{table}/mode')
  Future<PartitionCardListEnvelope> setPartitionMode({
    @Path('table') required String table,
    @Body() required PartitionModeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop before the swap: drop the copy, nothing was changed (step-up)
  @POST('/admin/system-health/partitions/{table}/abort')
  Future<PartitionCardListEnvelope> abortPartition({
    @Path('table') required String table,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Traffic lights of every part of the system
  @GET('/admin/system-health')
  Future<SystemHealthEnvelope> getSystemHealth({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Scale page extras: autoscale switches, pooler, search engine
  @GET('/admin/system-health/scale')
  Future<ScaleExtrasEnvelope> getScaleExtras({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cap autoscaling at the minimum / back to normal (needs step-up)
  @POST('/admin/system-health/scale')
  Future<SystemHealthEnvelope> setOpsScale({
    @Body() required ScaleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replace the background worker (needs step-up)
  @POST('/admin/system-health/restart-worker')
  Future<SystemHealthEnvelope> restartOpsWorker({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a new message re-encryption pass (needs step-up)
  @POST('/admin/system-health/message-reencrypt/restart')
  Future<SystemHealthEnvelope> restartMessageReencrypt({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pause / resume heavy background jobs
  @POST('/admin/system-health/heavy-jobs')
  Future<SystemHealthEnvelope> setHeavyJobsPaused({
    @Body() required HeavyJobsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch the automatic reactions on / off
  @PATCH('/admin/system-health/settings')
  Future<SystemHealthEnvelope> updateOpsSettings({
    @Body() required UpdateOpsSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
