// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_partner_adjustment_dto.dart';
import '../models/admin_partner_commission_row_envelope.dart';
import '../models/admin_partner_commission_row_list_envelope.dart';
import '../models/admin_partner_detail_envelope.dart';
import '../models/admin_partner_pay_dto.dart';
import '../models/admin_partner_pay_result_envelope.dart';
import '../models/admin_partner_reason_dto.dart';
import '../models/admin_partner_row_envelope.dart';
import '../models/admin_partner_row_list_envelope.dart';
import '../models/admin_partner_stats_envelope.dart';
import '../models/create_partner_dto.dart';
import '../models/link_partner_user_dto.dart';
import '../models/partner_commission_kind.dart';
import '../models/partner_commission_status.dart';
import '../models/partner_settings_dto.dart';
import '../models/partner_settings_envelope.dart';
import '../models/partner_status.dart';
import '../models/update_partner_dto.dart';

part 'admin_partners_client.g.dart';

@RestApi()
abstract class AdminPartnersClient {
  factory AdminPartnersClient(Dio dio, {String? baseUrl}) =
      _AdminPartnersClient;

  /// Partners, newest first.
  ///
  /// [q] - Name, email, label or code.
  @GET('/admin/partners')
  Future<AdminPartnerRowListEnvelope> listAdminPartners({
    @Query('status') PartnerStatus? status,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Make a user a partner (own rates optional)
  @POST('/admin/partners')
  Future<AdminPartnerRowEnvelope> createAdminPartner({
    @Body() required CreatePartnerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Partner program totals
  @GET('/admin/partners/stats')
  Future<AdminPartnerStatsEnvelope> getAdminPartnerStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Partner program defaults
  @GET('/admin/partners/settings')
  Future<PartnerSettingsEnvelope> getPartnerSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the partner program defaults (super admin)
  @PUT('/admin/partners/settings')
  Future<PartnerSettingsEnvelope> updatePartnerSettings({
    @Body() required PartnerSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Commissions (accruals) across partners, newest first
  @GET('/admin/partners/commissions')
  Future<AdminPartnerCommissionRowListEnvelope> listAdminPartnerCommissions({
    @Query('partnerId') String? partnerId,
    @Query('status') PartnerCommissionStatus? status,
    @Query('kind') PartnerCommissionKind? kind,
    @Query('period') String? period,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Commissions as CSV (up to 50 000 rows; audited)
  @GET('/admin/partners/commissions/export.csv')
  Future<void> exportAdminPartnerCommissions({
    @Query('partnerId') String? partnerId,
    @Query('status') PartnerCommissionStatus? status,
    @Query('kind') PartnerCommissionKind? kind,
    @Query('period') String? period,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Release a held commission for payout
  @POST('/admin/partners/commissions/{id}/approve')
  Future<AdminPartnerCommissionRowEnvelope> approveAdminPartnerCommission({
    @Path('id') required String id,
    @Body() required AdminPartnerReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Put a commission on manual hold
  @POST('/admin/partners/commissions/{id}/hold')
  Future<AdminPartnerCommissionRowEnvelope> holdAdminPartnerCommission({
    @Path('id') required String id,
    @Body() required AdminPartnerReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reverse a commission (fraud, refund); a paid one becomes a deduction
  @POST('/admin/partners/commissions/{id}/reverse')
  Future<AdminPartnerCommissionRowEnvelope> reverseAdminPartnerCommission({
    @Path('id') required String id,
    @Body() required AdminPartnerReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark one approved commission paid
  @POST('/admin/partners/commissions/{id}/pay')
  Future<AdminPartnerCommissionRowEnvelope> payAdminPartnerCommission({
    @Path('id') required String id,
    @Body() required AdminPartnerPayDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One partner: rates, who joined, commissions
  @GET('/admin/partners/{id}')
  Future<AdminPartnerDetailEnvelope> getAdminPartner({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change rates, rule, hold, label, status
  @PATCH('/admin/partners/{id}')
  Future<AdminPartnerRowEnvelope> updateAdminPartner({
    @Path('id') required String id,
    @Body() required UpdatePartnerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attach a real account to a partner created without one (code and earnings move with it)
  @POST('/admin/partners/{id}/link-user')
  Future<AdminPartnerRowEnvelope> linkAdminPartnerUser({
    @Path('id') required String id,
    @Body() required LinkPartnerUserDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One-off bonus (+) or deduction (−), approved at once
  @POST('/admin/partners/{id}/adjustments')
  Future<AdminPartnerCommissionRowEnvelope> adjustAdminPartner({
    @Path('id') required String id,
    @Body() required AdminPartnerAdjustmentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pay everything approved for the partner (one payout)
  @POST('/admin/partners/{id}/pay')
  Future<AdminPartnerPayResultEnvelope> payAdminPartner({
    @Path('id') required String id,
    @Body() required AdminPartnerPayDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
