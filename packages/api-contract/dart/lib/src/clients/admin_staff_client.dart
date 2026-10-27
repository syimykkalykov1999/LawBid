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
import '../models/staff_appeal_detail_envelope.dart';
import '../models/staff_appeal_item_list_envelope.dart';
import '../models/staff_appeal_receipt_envelope.dart';
import '../models/staff_create_appeal_dto.dart';
import '../models/staff_decide_appeal_dto.dart';
import '../models/staff_decide_result_envelope.dart';
import '../models/staff_flag_decision_dto.dart';
import '../models/staff_flag_decision_result_envelope.dart';
import '../models/staff_flag_list_envelope.dart';
import '../models/staff_my_appeal_list_envelope.dart';
import '../models/staff_rate_envelope.dart';
import '../models/staff_rate_list_envelope.dart';
import '../models/staff_reveal_result_envelope.dart';
import '../models/staff_settings_envelope.dart';
import '../models/staff_signal_list_envelope.dart';
import '../models/state2.dart';
import '../models/state3.dart';

part 'admin_staff_client.g.dart';

@RestApi()
abstract class AdminStaffClient {
  factory AdminStaffClient(Dio dio, {String? baseUrl}) = _AdminStaffClient;

  /// Staff package switches and numbers (all off by default)
  @GET('/admin/staff/settings')
  Future<StaffSettingsEnvelope> getStaffSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Complaints against heads (open / decided), anonymity applied.
  ///
  /// [state] - open = new or seen; decided = resolved. Omitted = all.
  @GET('/admin/appeals')
  Future<StaffAppealItemListEnvelope> listAppeals({
    @Query('limit') num? limit = 50,
    @Query('state') State2? state,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Retaliation red marks (open / closed)
  @GET('/admin/appeals/flags')
  Future<StaffFlagListEnvelope> listFlags({
    @Query('limit') num? limit = 50,
    @Query('state') State3? state,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner-inbox signals about heads and removals (last 30 days)
  @GET('/admin/appeals/signals')
  Future<StaffSignalListEnvelope> listSignals({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reverse a retaliation hold: the person works again (2FA)
  @POST('/admin/appeals/flags/{id}/reverse')
  Future<StaffFlagDecisionResultEnvelope> reverseFlag({
    @Path('id') required String id,
    @Body() required StaffFlagDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Agree with the head: the removal stands, the hold ends (2FA)
  @POST('/admin/appeals/flags/{id}/uphold')
  Future<StaffFlagDecisionResultEnvelope> upholdFlag({
    @Path('id') required String id,
    @Body() required StaffFlagDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One complaint (marks it as seen)
  @GET('/admin/appeals/{id}')
  Future<StaffAppealDetailEnvelope> getAppeal({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decide: fire the head / fire the worker / nothing. Records the decision and names the admin-management call (2FA)
  @POST('/admin/appeals/{id}/decide')
  Future<StaffDecideResultEnvelope> decideAppeal({
    @Path('id') required String id,
    @Body() required StaffDecideAppealDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reveal the name of an anonymous author (2FA, own audit row, daily cap)
  @POST('/admin/appeals/{id}/reveal')
  Future<StaffRevealResultEnvelope> revealAuthor({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// File a complaint against the head of my workspace
  @POST('/admin/workspace/appeals')
  Future<StaffAppealReceiptEnvelope> fileAppeal({
    @Body() required StaffCreateAppealDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My complaints and their status
  @GET('/admin/workspace/appeals/mine')
  Future<StaffMyAppealListEnvelope> myAppeals({
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
