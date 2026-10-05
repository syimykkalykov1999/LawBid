// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/set_user_storage_quota_dto.dart';
import '../models/storage_cleanup_result_envelope.dart';
import '../models/storage_overview_envelope.dart';
import '../models/storage_settings_envelope.dart';
import '../models/update_storage_settings_dto.dart';
import '../models/user_storage_quota_envelope.dart';

part 'admin_storage_client.g.dart';

@RestApi()
abstract class AdminStorageClient {
  factory AdminStorageClient(Dio dio, {String? baseUrl}) = _AdminStorageClient;

  /// Storage: usage, savings, growth, settings
  @GET('/admin/storage')
  Future<StorageOverviewEnvelope> getStorageOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the storage switches and limits
  @PUT('/admin/storage/settings')
  Future<StorageSettingsEnvelope> updateStorageSettings({
    @Body() required UpdateStorageSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Run the cleanup now (unused files, abandoned uploads)
  @POST('/admin/storage/cleanup')
  Future<StorageCleanupResultEnvelope> runStorageCleanup({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set or clear one user's storage cap
  @PUT('/admin/storage/users/{id}/quota')
  Future<UserStorageQuotaEnvelope> setUserStorageQuota({
    @Path('id') required String id,
    @Body() required SetUserStorageQuotaDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
