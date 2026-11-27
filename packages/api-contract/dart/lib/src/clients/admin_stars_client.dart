// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/grant_stars_dto.dart';
import '../models/save_stars_settings_dto.dart';
import '../models/star_ledger_item_list_envelope.dart';
import '../models/stars_admin_settings_envelope.dart';
import '../models/stars_balance_envelope.dart';
import '../models/stars_debt_list_envelope.dart';
import '../models/stars_report_envelope.dart';

part 'admin_stars_client.g.dart';

@RestApi()
abstract class AdminStarsClient {
  factory AdminStarsClient(Dio dio, {String? baseUrl}) = _AdminStarsClient;

  /// Stars: packs, the gift fee, the daily brake
  @GET('/admin/stars/settings')
  Future<StarsAdminSettingsEnvelope> adminStarsSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save the stars packs and gift settings
  @PUT('/admin/stars/settings')
  Future<StarsAdminSettingsEnvelope> saveAdminStarsSettings({
    @Body() required SaveStarsSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stars report for «Деньги»
  @GET('/admin/stars/report')
  Future<StarsReportEnvelope> adminStarsReport({
    @Query('days') int? days,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accounts that owe stars after a refund
  @GET('/admin/stars/debts')
  Future<StarsDebtListEnvelope> adminStarsDebts({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stars history of everyone, or of one user
  @GET('/admin/stars/ledger')
  Future<StarLedgerItemListEnvelope> adminStarsLedger({
    @Query('cursor') String? cursor,
    @Query('userId') String? userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add or take back stars by hand, with a reason
  @POST('/admin/stars/grant')
  Future<StarsBalanceEnvelope> grantStars({
    @Body() required GrantStarsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
