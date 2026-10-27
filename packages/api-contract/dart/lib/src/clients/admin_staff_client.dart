// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/desk_decisions_envelope.dart';
import '../models/desk_heartbeat_dto.dart';
import '../models/desk_heartbeat_result_envelope.dart';
import '../models/desk_settings_envelope.dart';
import '../models/desk_status_envelope.dart';
import '../models/dispute_piecework_dto.dart';
import '../models/done_lease_dto.dart';
import '../models/lease_envelope.dart';
import '../models/lease_kind_body_dto.dart';
import '../models/lease_ok_envelope.dart';
import '../models/lease_queue_kind.dart';
import '../models/my_leases_envelope.dart';
import '../models/next_lease_result_envelope.dart';
import '../models/piecework_dispute_result_envelope.dart';
import '../models/piecework_overview_envelope.dart';
import '../models/piecework_rerun_result_envelope.dart';
import '../models/reveal_pii_dto.dart';
import '../models/reveal_pii_result_envelope.dart';
import '../models/review_current_envelope.dart';
import '../models/review_golden_body_dto.dart';
import '../models/review_golden_issued_envelope.dart';
import '../models/review_golden_list_envelope.dart';
import '../models/review_me_envelope.dart';
import '../models/review_next_envelope.dart';
import '../models/review_stats_envelope.dart';
import '../models/review_team_envelope.dart';
import '../models/review_verdict_body_dto.dart';
import '../models/review_verdict_result_envelope.dart';
import '../models/set_desk_status_dto.dart';
import '../models/set_staff_rate_dto.dart';
import '../models/skip_lease_dto.dart';
import '../models/skip_lease_result_envelope.dart';
import '../models/staff_ai_hint_envelope.dart';
import '../models/staff_ai_summary_envelope.dart';
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
import '../models/staff_people_list_envelope.dart';
import '../models/staff_person_detail_envelope.dart';
import '../models/staff_rate_envelope.dart';
import '../models/staff_rate_list_envelope.dart';
import '../models/staff_rating_sort.dart';
import '../models/staff_rating_status.dart';
import '../models/staff_reveal_result_envelope.dart';
import '../models/staff_settings_envelope.dart';
import '../models/staff_shortlist_envelope.dart';
import '../models/staff_signal_list_envelope.dart';
import '../models/staff_suggestion_kind.dart';
import '../models/staff_suggestion_list_envelope.dart';
import '../models/staff_suggestion_status.dart';
import '../models/staff_watermark_envelope.dart';
import '../models/staff_workspace_name.dart';
import '../models/state2.dart';
import '../models/state3.dart';
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

  /// Switches and timers the one-page desk needs (whitelist)
  @GET('/admin/workspace/desk-settings')
  Future<DeskSettingsEnvelope> deskSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// My own closed items per day (nightly counters), newest first
  @GET('/admin/workspace/desk-decisions')
  Future<DeskDecisionsEnvelope> deskDecisions({
    @Query('days') num? days = 14,
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
    @Body() DoneLeaseDto? body,
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

  /// Presence signal of an open desk (every 15 s): online / away / offline
  @POST('/admin/desk/heartbeat')
  Future<DeskHeartbeatResultEnvelope> deskHeartbeat({
    @Body() required DeskHeartbeatDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Staff rating list (latest nightly snapshot), worst first.
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/people')
  Future<StaffPeopleListEnvelope> staffPeople({
    @Query('limit') num? limit = 50,
    @Query('offset') num? offset = 0,
    @Query('status') StaffRatingStatus? status,
    @Query('workspace') StaffWorkspaceName? workspace,
    @Query('sort') StaffRatingSort? sort,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One person: rating, components, evidence and suggestions
  @GET('/admin/staff/people/{adminId}')
  Future<StaffPersonDetailEnvelope> staffPerson({
    @Path('adminId') required String adminId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The short list: the worst and the best (≤ 20 each).
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/shortlist')
  Future<StaffShortlistEnvelope> staffShortlist({
    @Query('workspace') StaffWorkspaceName? workspace,
    @Extras() Map<String, dynamic>? extras,
  });

  /// What the system suggests about people (open by default).
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/suggestions')
  Future<StaffSuggestionListEnvelope> staffSuggestions({
    @Query('limit') num? limit = 50,
    @Query('offset') num? offset = 0,
    @Query('status') StaffSuggestionStatus? status,
    @Query('kind') StaffSuggestionKind? kind,
    @Query('workspace') StaffWorkspaceName? workspace,
    @Extras() Map<String, dynamic>? extras,
  });

  /// May I re-check? (404 for everyone who may not)
  @GET('/admin/workspace/review/me')
  Future<ReviewMeEnvelope> reviewMe({@Extras() Map<String, dynamic>? extras});

  /// «Следующий» of the re-check: leases one pending sample to me (two reviewers never get the same one)
  @POST('/admin/workspace/review/next')
  Future<ReviewNextEnvelope> reviewNext({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The sample I hold now, if any
  @GET('/admin/workspace/review/current')
  Future<ReviewCurrentEnvelope> reviewCurrent({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verdict on the sample I hold: confirmed / overturned (with reasons) / unclear
  @POST('/admin/workspace/review/{id}/verdict')
  Future<ReviewVerdictResultEnvelope> reviewVerdict({
    @Path('id') required String id,
    @Body() required ReviewVerdictBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Let go of the sample without a verdict
  @POST('/admin/workspace/review/{id}/release')
  Future<ReviewVerdictResultEnvelope> reviewRelease({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Golden tasks and how workers did on them (owner, head)
  @GET('/admin/workspace/review/golden')
  Future<ReviewGoldenListEnvelope> reviewGolden({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark a confirmed decision as a golden task for a worker (owner, head)
  @POST('/admin/workspace/review/golden')
  Future<ReviewGoldenIssuedEnvelope> reviewMarkGolden({
    @Body() required ReviewGoldenBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Returned rate and re-check results per worker (latest nightly snapshot; owner, head)
  @GET('/admin/workspace/review/team')
  Future<ReviewTeamEnvelope> reviewTeam({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-check numbers per workspace and reviewer calibration (owner: all, head: own workspace)
  @GET('/admin/workspace/review/stats')
  Future<ReviewStatsEnvelope> reviewStats({
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

  /// Show one masked phone / e-mail / document number in full (audited, limited per day)
  @POST('/admin/pii/reveal')
  Future<RevealPiiResultEnvelope> reveal({
    @Body() required RevealPiiDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Whether the panel draws the faint watermark with the admin name, and its text
  @GET('/admin/pii/watermark')
  Future<StaffWatermarkEnvelope> watermark({
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI suggestion for an item the caller holds (one call, 3 s timeout, cached; a suggestion only).
  ///
  /// [kind] - Queue kind of the item: support_ticket, report, verification.
  ///
  /// [itemId] - The item the caller holds.
  @GET('/admin/desk/ai/hint/{kind}/{itemId}')
  Future<StaffAiHintEnvelope> staffAiHint({
    @Path('kind') required String kind,
    @Path('itemId') required String itemId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Evidence text under a recommendation: AI text if written, else the rule-based template.
  ///
  /// [suggestionId] - staff_suggestions.id.
  @GET('/admin/desk/ai/summary/{suggestionId}')
  Future<StaffAiSummaryEnvelope> staffAiSummary({
    @Path('suggestionId') required String suggestionId,
    @Extras() Map<String, dynamic>? extras,
  });
}
