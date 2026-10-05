// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/heavy_jobs_dto.dart';
import '../models/scale_dto.dart';
import '../models/system_health_envelope.dart';
import '../models/update_ops_settings_dto.dart';

part 'admin_ops_client.g.dart';

@RestApi()
abstract class AdminOpsClient {
  factory AdminOpsClient(Dio dio, {String? baseUrl}) = _AdminOpsClient;

  /// Traffic lights of every part of the system
  @GET('/admin/system-health')
  Future<SystemHealthEnvelope> getSystemHealth({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replace the background worker (needs step-up)
  @POST('/admin/system-health/restart-worker')
  Future<SystemHealthEnvelope> restartOpsWorker({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pause / resume heavy background jobs
  @POST('/admin/system-health/heavy-jobs')
  Future<SystemHealthEnvelope> setHeavyJobsPaused({
    @Body() required HeavyJobsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cap autoscaling at the minimum / back to normal (needs step-up)
  @POST('/admin/system-health/scale')
  Future<SystemHealthEnvelope> setOpsScale({
    @Body() required ScaleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch the automatic reactions on / off
  @PATCH('/admin/system-health/settings')
  Future<SystemHealthEnvelope> updateOpsSettings({
    @Body() required UpdateOpsSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
