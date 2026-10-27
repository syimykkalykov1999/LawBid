// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/dispute_piecework_dto.dart';
import '../models/piecework_dispute_result_envelope.dart';
import '../models/piecework_overview_envelope.dart';
import '../models/piecework_rerun_result_envelope.dart';
import '../models/set_staff_rate_dto.dart';
import '../models/staff_rate_envelope.dart';
import '../models/staff_rate_list_envelope.dart';
import '../models/staff_settings_envelope.dart';

part 'admin_staff_client.g.dart';

@RestApi()
abstract class AdminStaffClient {
  factory AdminStaffClient(Dio dio, {String? baseUrl}) = _AdminStaffClient;

  /// Staff package switches and numbers (all off by default)
  @GET('/admin/staff/settings')
  Future<StaffSettingsEnvelope> getStaffSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Piecework rates, newest first (owner only)
  @GET('/admin/staff/rates')
  Future<StaffRateListEnvelope> listStaffRates({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set a rate: closes the open one of the same kind and workspace (owner only)
  @PUT('/admin/staff/rates')
  Future<StaffRateEnvelope> setStaffRate({
    @Body() required SetStaffRateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// End a rate now (owner only)
  @DELETE('/admin/staff/rates/{id}')
  Future<StaffRateEnvelope> endStaffRate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Piecework pay of everyone for a month, with day lines and rates.
  ///
  /// [period] - Month, YYYY-MM (default: this month, UTC).
  @GET('/admin/staff/piecework')
  Future<PieceworkOverviewEnvelope> staffPieceworkOverview({
    @Query('period') String? period,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hold a day: its pending payroll accrual is canceled, the nightly run leaves it
  @POST('/admin/staff/piecework/{adminId}/{day}/dispute')
  Future<PieceworkDisputeResultEnvelope> disputeStaffPiecework({
    @Path('adminId') required String adminId,
    @Path('day') required String day,
    @Body() required DisputePieceworkDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recount one finished day of one person (also lifts a dispute)
  @POST('/admin/staff/piecework/{adminId}/{day}/rerun')
  Future<PieceworkRerunResultEnvelope> rerunStaffPiecework({
    @Path('adminId') required String adminId,
    @Path('day') required String day,
    @Extras() Map<String, dynamic>? extras,
  });
}
