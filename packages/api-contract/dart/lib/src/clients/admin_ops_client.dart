// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/heavy_jobs_dto.dart';
import '../models/post_status_incident_dto.dart';
import '../models/queue_retry_result_envelope.dart';
import '../models/scale_dto.dart';
import '../models/scale_extras_envelope.dart';
import '../models/search_index_status_envelope.dart';
import '../models/start_search_reindex_dto.dart';
import '../models/status_page_envelope.dart';
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

  /// Retry failed background jobs and replay Stripe dead letters (needs step-up)
  @POST('/admin/system-health/queues/retry-failed')
  Future<QueueRetryResultEnvelope> retryFailedJobs({
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

  /// Incidents shown on the public status page
  @GET('/admin/status-page')
  Future<StatusPageEnvelope> getStatusPage({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Post an incident on the public status page
  @POST('/admin/status-page/incidents')
  Future<StatusPageEnvelope> createIncident({
    @Body() required PostStatusIncidentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark a posted incident as resolved
  @POST('/admin/status-page/incidents/{id}/resolve')
  Future<StatusPageEnvelope> resolveIncident({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Search index generations, aliases, counts and reindex progress
  @GET('/admin/system-health/search-index')
  Future<SearchIndexStatusEnvelope> searchIndexStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a zero-downtime reindex (needs step-up)
  @POST('/admin/system-health/search-index/start')
  Future<SearchIndexStatusEnvelope> start({
    @Body() required StartSearchReindexDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verify, then swap the read alias; later the write alias (needs step-up)
  @POST('/admin/system-health/search-index/swap')
  Future<SearchIndexStatusEnvelope> swap({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel the build or go back to the old index (needs step-up)
  @POST('/admin/system-health/search-index/rollback')
  Future<SearchIndexStatusEnvelope> rollback({
    @Extras() Map<String, dynamic>? extras,
  });
}
