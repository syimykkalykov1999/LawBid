// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_cancel_promotion_dto.dart';
import '../models/admin_extend_promotion_dto.dart';
import '../models/admin_grant_promotion_dto.dart';
import '../models/admin_promotion_action_result_envelope.dart';
import '../models/admin_promotion_row_list_envelope.dart';
import '../models/admin_promotion_stats_envelope.dart';
import '../models/case_promotion_status.dart';
import '../models/promotion_settings_dto.dart';
import '../models/promotion_settings_envelope.dart';

part 'admin_promotions_client.g.dart';

@RestApi()
abstract class AdminPromotionsClient {
  factory AdminPromotionsClient(Dio dio, {String? baseUrl}) =
      _AdminPromotionsClient;

  /// Case promotions, newest first
  @GET('/admin/promotions')
  Future<AdminPromotionRowListEnvelope> listAdminPromotions({
    @Query('status') CasePromotionStatus? status,
    @Query('caseId') String? caseId,
    @Query('userId') String? userId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Active promotions and 30-day revenue
  @GET('/admin/promotions/stats')
  Future<AdminPromotionStatsEnvelope> getAdminPromotionStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Case promotion settings
  @GET('/admin/promotions/settings')
  Future<PromotionSettingsEnvelope> getPromotionSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change price / limits / on-off (super admin)
  @PUT('/admin/promotions/settings')
  Future<PromotionSettingsEnvelope> updatePromotionSettings({
    @Body() required PromotionSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Promote a case for free
  @POST('/admin/promotions/grant')
  Future<AdminPromotionActionResultEnvelope> grantAdminPromotion({
    @Body() required AdminGrantPromotionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel a promotion (a paid one is refunded from the Payments screen)
  @POST('/admin/promotions/{id}/cancel')
  Future<AdminPromotionActionResultEnvelope> cancelAdminPromotion({
    @Path('id') required String id,
    @Body() required AdminCancelPromotionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add days to a running promotion
  @POST('/admin/promotions/{id}/extend')
  Future<AdminPromotionActionResultEnvelope> extendAdminPromotion({
    @Path('id') required String id,
    @Body() required AdminExtendPromotionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
