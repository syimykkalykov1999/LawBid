// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_bid_item_list_envelope.dart';
import '../models/case_deleted_envelope.dart';
import '../models/case_detail_for_attorney_envelope.dart';
import '../models/case_envelope.dart';
import '../models/case_feed_item_list_envelope.dart';
import '../models/case_summary_list_envelope.dart';
import '../models/client_contacts_envelope.dart';
import '../models/contact_issue_report_envelope.dart';
import '../models/create_case_dto.dart';
import '../models/create_contact_issue_dto.dart';
import '../models/filter.dart';
import '../models/saved_item_dto.dart';
import '../models/sort.dart';
import '../models/update_case_dto.dart';

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
  @GET('/cases')
  Future<CaseFeedItemListEnvelope> listCaseFeed({
    @Query('limit') int? limit = 20,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
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

  /// "My cases" tabs (client, docs/04 §11.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/cases')
  Future<CaseSummaryListEnvelope> listMyCases({
    @Query('cursor') String? cursor,
    @Query('filter') Filter? filter = Filter.active,
    @Query('limit') int? limit = 20,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Record a view, deduplicated per (attorney, case) (docs/04 §4.3)
  @POST('/cases/{id}/view')
  Future<void> recordCaseView({
    @Path('id') required String id,
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
}
