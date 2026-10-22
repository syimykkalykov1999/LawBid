// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/board_case_task_list_envelope.dart';
import '../models/case_activity_list_envelope.dart';
import '../models/case_bid_item_list_envelope.dart';
import '../models/case_deleted_envelope.dart';
import '../models/case_detail_for_attorney_envelope.dart';
import '../models/case_envelope.dart';
import '../models/case_feed_item_list_envelope.dart';
import '../models/case_summary_list_envelope.dart';
import '../models/case_tasks_envelope.dart';
import '../models/case_update_list_envelope.dart';
import '../models/case_views_dto.dart';
import '../models/case_workspace_envelope.dart';
import '../models/cases_feed_sort.dart';
import '../models/client_contacts_envelope.dart';
import '../models/contact_issue_report_envelope.dart';
import '../models/create_case_dto.dart';
import '../models/create_case_task_dto.dart';
import '../models/create_case_update_dto.dart';
import '../models/create_contact_issue_dto.dart';
import '../models/dispute_case_dto.dart';
import '../models/filter.dart';
import '../models/min_urgency.dart';
import '../models/period.dart';
import '../models/saved_item_dto.dart';
import '../models/scope.dart';
import '../models/sort.dart';
import '../models/still_needed_answer_dto.dart';
import '../models/task_done_dto.dart';
import '../models/task_submission_dto.dart';
import '../models/update_case_dto.dart';
import '../models/update_case_urgency_dto.dart';
import '../models/update_private_details_dto.dart';
import '../models/workspace_file_list_envelope.dart';

part 'cases_client.g.dart';

@RestApi()
abstract class CasesClient {
  factory CasesClient(Dio dio, {String? baseUrl}) = _CasesClient;

  /// Publish a case (client, docs/04 §3.1-§3.4)
  @POST('/cases')
  Future<CaseEnvelope> createCase({
    @Body() required CreateCaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney case feed (docs/04 §4.2).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [practiceAreaId] - Leaf practice area id.
  ///
  /// [state] - Two-letter state code.
  ///
  /// [states] - Owner 2026-10-06: several states at once (comma-separated) — cases in any of them; joins `state` when both are sent.
  ///
  /// [scope] - Owner 2026-10-04: "licensed" = cases in states with a verified licence (default); "all" = browse open cases of own practices in every state (view only).
  ///
  /// [sort] - Owner 2026-10-13: for_you = ranked for this attorney (practice, states, freshness, budget, few offers, no offer yet); the cursor is then a position in the ranked list.
  ///
  /// [practiceCategory] - Practice category code: cases of any of its leaves (owner 2026-09-30, OQ-034 topic slider).
  ///
  /// [practice] - Owner 2026-09-30: any qualification (category with its subcategories, or one subcategory) — every open case of it in the attorney's licensed states, own practices or not.
  ///
  /// [budgetMin] - Whole dollars.
  ///
  /// [budgetMax] - Whole dollars.
  ///
  /// [budgetUnknown] - Only cases with "clarify later".
  ///
  /// [budgetPercent] - Include cases with a percent (contingency) budget. Combined with a dollar range or "clarify later" the options are OR-ed.
  ///
  /// [percentMax] - With budgetPercent: only percent budgets up to this whole percent.
  ///
  /// [noBids] - Only cases nobody has bid on yet.
  ///
  /// [minUrgency] - Owner 2026-10-05: only cases at least this urgent today (a dated case by its days left; past dates excluded).
  ///
  /// [hasDeadline] - Owner 2026-10-05: only cases with a date (court hearing, filing deadline…) still ahead.
  @GET('/cases')
  Future<CaseFeedItemListEnvelope> listCaseFeed({
    @Query('limit') int? limit = 20,
    @Query('scope') Scope? scope = Scope.licensed,
    @Query('period') Period? period = Period.all,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('states') String? states,
    @Query('sort') CasesFeedSort? sort,
    @Query('practiceCategory') String? practiceCategory,
    @Query('practice') String? practice,
    @Query('budgetMin') num? budgetMin,
    @Query('budgetMax') num? budgetMax,
    @Query('budgetUnknown') bool? budgetUnknown,
    @Query('budgetPercent') bool? budgetPercent,
    @Query('percentMax') num? percentMax,
    @Query('noBids') bool? noBids,
    @Query('minUrgency') MinUrgency? minUrgency,
    @Query('hasDeadline') bool? hasDeadline,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit an open case (client, docs/04 §3.5)
  @PATCH('/cases/{id}')
  Future<CaseEnvelope> updateCase({
    @Path('id') required String id,
    @Body() required UpdateCaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Soft-delete a case (client, open/archived only, docs/04 §3.5)
  @DELETE('/cases/{id}')
  Future<CaseDeletedEnvelope> deleteCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Case detail for an attorney (docs/04 §4.3, no client field)
  @GET('/cases/{id}')
  Future<CaseDetailForAttorneyEnvelope> getCaseDetail({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the private details («Подробности») — the client, while the case is open or in work (audit 2026-10-19)
  @PATCH('/cases/{id}/private-details')
  Future<CaseEnvelope> updateCasePrivateDetails({
    @Path('id') required String id,
    @Body() required UpdatePrivateDetailsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change how urgent a case is or its date — the client (open or hired) or the hired attorney; the other side is told (owner 2026-10-05)
  @PATCH('/cases/{id}/urgency')
  Future<CaseEnvelope> updateCaseUrgency({
    @Path('id') required String id,
    @Body() required UpdateCaseUrgencyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close a case without choosing a bid (client, docs/04 §3.5)
  @POST('/cases/{id}/close')
  Future<CaseEnvelope> closeCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore an archived case (client, docs/04 §10.1)
  @POST('/cases/{id}/restore')
  Future<CaseEnvelope> restoreCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Still relevant" — resets the staleness timer (docs/04 §10.2)
  @POST('/cases/{id}/keep-alive')
  Future<CaseEnvelope> keepCaseAlive({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Answer «Вам ещё нужен адвокат?» — still_needed / wait_better / not_needed (closes the case) / make_not_urgent (owner, OQ-054)
  @POST('/cases/{id}/still-needed')
  Future<CaseEnvelope> answerStillNeeded({
    @Path('id') required String id,
    @Body() required StillNeededAnswerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Bring a paused case back into the attorneys' feed (owner, OQ-054)
  @POST('/cases/{id}/resume')
  Future<CaseEnvelope> resumeCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "My cases" tabs (client, docs/04 §11.1).
  ///
  /// [q] - Words of the case: title, description, city, state, topic (any language).
  ///
  /// [updatedSince] - Owner 2026-10-22 (client economy plan, package E): only my cases changed since (ISO); meta.deletedIds = cases that left this tab (status moved, deleted); meta.syncedAt = pass it back next time. Older than 7 days → 409 SYNC_TOO_OLD.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/cases')
  Future<CaseSummaryListEnvelope> listMyCases({
    @Query('filter') Filter? filter = Filter.active,
    @Query('limit') int? limit = 20,
    @Query('q') String? q,
    @Query('practice') String? practice,
    @Query('state') String? state,
    @Query('updatedSince') DateTime? updatedSince,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Record a view, deduplicated per (attorney, case) (docs/04 §4.3).
  ///
  /// Deprecated (owner 2026-10-22): send the ids in POST /cases/views instead — one request for many cases.
  @Deprecated('This method is marked as deprecated')
  @POST('/cases/{id}/view')
  Future<void> recordCaseView({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Record views of several cases (batch; replaces POST /cases/:id/view)
  @POST('/cases/views')
  Future<void> recordCaseViews({
    @Body() required CaseViewsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a case (docs/04 §4.3 "Сохранить", §11.2)
  @POST('/saved-items')
  Future<void> saveItem({
    @Body() required SavedItemDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unsave a case
  @DELETE('/saved-items')
  Future<void> unsaveItem({
    @Body() required SavedItemDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Bids on my case with the attorney summary (client, docs/04 §5.2; sort newest / lowest_price / highest_rating).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/cases/{id}/bids')
  Future<CaseBidItemListEnvelope> listCaseBids({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Query('sort') Sort? sort = Sort.newest,
    @Query('limit') int? limit = 20,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Client contacts for the attorney whose bid was accepted (active subscription required, docs/04 §8)
  @GET('/cases/{id}/contacts')
  Future<ClientContactsEnvelope> getCaseContacts({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Can’t reach the client" report (attorney, docs/04 §8.4)
  @POST('/cases/{id}/contact-issues')
  Future<ContactIssueReportEnvelope> reportContactIssue({
    @Path('id') required String id,
    @Body() required CreateContactIssueDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Files, open tasks and updates of an accepted case
  @GET('/cases/{id}/workspace')
  Future<CaseWorkspaceEnvelope> caseWorkspace({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Case files with notes and where they came from
  @GET('/cases/{id}/files')
  Future<WorkspaceFileListEnvelope> listCaseFiles({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tasks of every case in work, for the Mine › Tasks board
  @GET('/users/me/case-tasks')
  Future<BoardCaseTaskListEnvelope> caseTaskBoard({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tasks of an accepted case (private ones: attorney only)
  @GET('/cases/{id}/tasks')
  Future<CaseTasksEnvelope> listCaseTasks({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a task: the attorney any kind, the client a for-client or joint one
  @POST('/cases/{id}/tasks')
  Future<CaseTasksEnvelope> createCaseTask({
    @Path('id') required String id,
    @Body() required CreateCaseTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark a task done / not done (same for both sides)
  @POST('/cases/{id}/tasks/{taskId}/done')
  Future<CaseTasksEnvelope> setCaseTaskDone({
    @Path('id') required String id,
    @Path('taskId') required String taskId,
    @Body() required TaskDoneDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: close a task for the client
  @POST('/cases/{id}/tasks/{taskId}/close')
  Future<CaseTasksEnvelope> closeCaseTask({
    @Path('id') required String id,
    @Path('taskId') required String taskId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: reopen a closed task
  @POST('/cases/{id}/tasks/{taskId}/reopen')
  Future<CaseTasksEnvelope> reopenCaseTask({
    @Path('id') required String id,
    @Path('taskId') required String taskId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Client: add a note and files to a task for the client
  @POST('/cases/{id}/tasks/{taskId}/submissions')
  Future<CaseTasksEnvelope> submitCaseTask({
    @Path('id') required String id,
    @Path('taskId') required String taskId,
    @Body() required TaskSubmissionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tick / untick one checklist line of a task
  @POST('/cases/{id}/tasks/{taskId}/items/{itemId}/done')
  Future<CaseTasksEnvelope> setCaseTaskItemDone({
    @Path('id') required String id,
    @Path('taskId') required String taskId,
    @Path('itemId') required String itemId,
    @Body() required TaskDoneDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Everything that happened in the case
  @GET('/cases/{id}/activity')
  Future<CaseActivityListEnvelope> listCaseActivity({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark the Updates tab as read
  @POST('/cases/{id}/updates/seen')
  Future<void> markCaseUpdatesSeen({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Updates feed of an accepted case
  @GET('/cases/{id}/updates')
  Future<CaseUpdateListEnvelope> listCaseUpdates({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add an update (text and files), either side
  @POST('/cases/{id}/updates')
  Future<CaseUpdateListEnvelope> addCaseUpdate({
    @Path('id') required String id,
    @Body() required CreateCaseUpdateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Either side "Done": in_progress → pending_completion (docs/04 §10.1)
  @POST('/cases/{id}/complete')
  Future<CaseEnvelope> completeCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The other side confirms completion: → closed (docs/04 §10.1)
  @POST('/cases/{id}/confirm-completion')
  Future<CaseEnvelope> confirmCaseCompletion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The other side disputes completion: → disputed (docs/04 §10.1)
  @POST('/cases/{id}/dispute')
  Future<CaseEnvelope> disputeCase({
    @Path('id') required String id,
    @Body() required DisputeCaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
