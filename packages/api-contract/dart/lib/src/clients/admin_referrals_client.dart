// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_referral_reason_dto.dart';
import '../models/admin_referral_row_envelope.dart';
import '../models/admin_referral_row_list_envelope.dart';
import '../models/admin_referral_stats_envelope.dart';
import '../models/referral_settings_dto.dart';
import '../models/referral_settings_envelope.dart';
import '../models/referral_status.dart';
import '../models/role2.dart';

part 'admin_referrals_client.g.dart';

@RestApi()
abstract class AdminReferralsClient {
  factory AdminReferralsClient(Dio dio, {String? baseUrl}) =
      _AdminReferralsClient;

  /// Referrals, newest first.
  ///
  /// [role] - Referee's role.
  @GET('/admin/referrals')
  Future<AdminReferralRowListEnvelope> listAdminReferrals({
    @Query('status') ReferralStatus? status,
    @Query('role') Role2? role,
    @Query('referrerId') String? referrerId,
    @Query('refereeId') String? refereeId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Referral totals and rewards issued
  @GET('/admin/referrals/stats')
  Future<AdminReferralStatsEnvelope> getAdminReferralStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Referral program settings
  @GET('/admin/referrals/settings')
  Future<ReferralSettingsEnvelope> getReferralSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the referral program (super admin)
  @PUT('/admin/referrals/settings')
  Future<ReferralSettingsEnvelope> updateReferralSettings({
    @Body() required ReferralSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Qualify a pending referral and issue rewards
  @POST('/admin/referrals/{id}/qualify')
  Future<AdminReferralRowEnvelope> qualifyAdminReferral({
    @Path('id') required String id,
    @Body() required AdminReferralReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Issue the rewards of a qualified referral
  @POST('/admin/referrals/{id}/reward')
  Future<AdminReferralRowEnvelope> rewardAdminReferral({
    @Path('id') required String id,
    @Body() required AdminReferralReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject a referral (fraud, abuse)
  @POST('/admin/referrals/{id}/reject')
  Future<AdminReferralRowEnvelope> rejectAdminReferral({
    @Path('id') required String id,
    @Body() required AdminReferralReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
