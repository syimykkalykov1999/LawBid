// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/desk_status_envelope.dart';
import '../models/dispute_piecework_dto.dart';
import '../models/lease_envelope.dart';
import '../models/lease_kind_body_dto.dart';
import '../models/lease_ok_envelope.dart';
import '../models/lease_queue_kind.dart';
import '../models/my_leases_envelope.dart';
import '../models/next_lease_result_envelope.dart';
import '../models/piecework_dispute_result_envelope.dart';
import '../models/piecework_overview_envelope.dart';
import '../models/piecework_rerun_result_envelope.dart';
import '../models/set_desk_status_dto.dart';
import '../models/set_staff_rate_dto.dart';
import '../models/skip_lease_dto.dart';
import '../models/skip_lease_result_envelope.dart';
import '../models/staff_rate_envelope.dart';
import '../models/staff_rate_list_envelope.dart';
import '../models/staff_settings_envelope.dart';
import '../models/team_reassign_dto.dart';
import '../models/team_release_dto.dart';
import '../models/team_release_result_envelope.dart';
import '../models/team_view_envelope.dart';

part 'admin_staff_client.g.dart';

@RestApi()
abstract class AdminStaffClient {
  factory AdminStaffClient(Dio dio, {String? baseUrl}) = _AdminStaffClient;

  /// Staff package switches and numbers (all off by default)
  @GET('/admin/staff/settings')
  Future<StaffSettingsEnvelope> getStaffSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Team tiles: status and «in work by X» (owner or workspace head)
  @GET('/admin/desk/lease/team')
  Future<TeamViewEnvelope> getLeaseTeam({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take an item (or everything) away from a person; fresh 2FA code + audit row
  @POST('/admin/desk/lease/team/{adminId}/release')
  Future<TeamReleaseResultEnvelope> releaseLeaseTeamMember({
    @Path('adminId') required String adminId,
    @Body() required TeamReleaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hand a held item to another person; fresh 2FA code + audit row
  @POST('/admin/desk/lease/team/{adminId}/reassign')
  Future<LeaseEnvelope> reassignLeaseTeamMember({
    @Path('adminId') required String adminId,
    @Body() required TeamReassignDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My status, the items in my hands, capacity and wrap-up
  @GET('/admin/desk/lease/me')
  Future<MyLeasesEnvelope> getMyDeskLeases({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Следующий»: leases the oldest free item of the queue to me (one item, one worker)
  @POST('/admin/desk/lease/next')
  Future<NextLeaseResultEnvelope> nextDeskLease({
    @Body() required LeaseKindBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// I am still working on it: the lease runs again.
  ///
  /// [kind] - Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.
  @POST('/admin/desk/lease/{kind}/{id}/renew')
  Future<LeaseEnvelope> renewDeskLease({
    @Path('kind') required LeaseQueueKind kind,
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Let go: the item goes back to the queue.
  ///
  /// [kind] - Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.
  @POST('/admin/desk/lease/{kind}/{id}/release')
  Future<LeaseOkEnvelope> releaseDeskLease({
    @Path('kind') required LeaseQueueKind kind,
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Пропустить» with a reason from the list (a few per hour); the item goes to someone else.
  ///
  /// [kind] - Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.
  @POST('/admin/desk/lease/{kind}/{id}/skip')
  Future<SkipLeaseResultEnvelope> skipDeskLease({
    @Path('kind') required LeaseQueueKind kind,
    @Path('id') required String id,
    @Body() required SkipLeaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The item is closed: the lease ends (support gets a short wrap-up before the next one).
  ///
  /// [kind] - Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.
  @POST('/admin/desk/lease/{kind}/{id}/done')
  Future<LeaseOkEnvelope> doneDeskLease({
    @Path('kind') required LeaseQueueKind kind,
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My status: online / away / offline
  @GET('/admin/desk/status')
  Future<DeskStatusEnvelope> getDeskStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Отошёл» by hand (true) or back on (false)
  @POST('/admin/desk/status')
  Future<DeskStatusEnvelope> setDeskStatus({
    @Body() required SetDeskStatusDto body,
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
