// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/ad_archive_row_list_envelope.dart';
import '../models/ad_rule_list_envelope.dart';
import '../models/attorney_ads_settings_envelope.dart';
import '../models/kind3.dart';
import '../models/update_attorney_ads_settings_dto.dart';

part 'admin_attorney_ads_client.g.dart';

@RestApi()
abstract class AdminAttorneyAdsClient {
  factory AdminAttorneyAdsClient(Dio dio, {String? baseUrl}) =
      _AdminAttorneyAdsClient;

  /// Per-state advertising rules
  @GET('/admin/attorney-ads/settings')
  Future<AttorneyAdsSettingsEnvelope> getAttorneyAdsSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the per-state advertising rules (super admin, fresh 2FA code)
  @PUT('/admin/attorney-ads/settings')
  Future<AttorneyAdsSettingsEnvelope> updateAttorneyAdsSettings({
    @Body() required UpdateAttorneyAdsSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The content checker rule catalogue
  @GET('/admin/attorney-ads/rules')
  Future<AdRuleListEnvelope> listAttorneyAdRules({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Archived versions of attorney ads.
  ///
  /// [state] - 2-letter state code.
  ///
  /// [from] - ISO date, from (inclusive).
  ///
  /// [to] - ISO date, to (exclusive).
  @GET('/admin/attorney-ads/archive')
  Future<AdArchiveRowListEnvelope> listAttorneyAdArchive({
    @Query('attorneyId') String? attorneyId,
    @Query('kind') Kind3? kind,
    @Query('state') String? state,
    @Query('from') String? from,
    @Query('to') String? to,
    @Query('limit') int? limit,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// CSV export of the ad archive (up to 5 000 rows; audited).
  ///
  /// [state] - 2-letter state code.
  ///
  /// [from] - ISO date, from (inclusive).
  ///
  /// [to] - ISO date, to (exclusive).
  @GET('/admin/attorney-ads/archive/export')
  Future<void> exportAttorneyAdArchive({
    @Query('attorneyId') String? attorneyId,
    @Query('kind') Kind3? kind,
    @Query('state') String? state,
    @Query('from') String? from,
    @Query('to') String? to,
    @Query('limit') int? limit,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
