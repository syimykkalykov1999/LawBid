// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_case_action_dto.dart';
import '../models/admin_case_card_envelope.dart';
import '../models/admin_case_row_list_envelope.dart';
import '../models/admin_case_status.dart';
import '../models/admin_contact_issue_card_envelope.dart';
import '../models/admin_contact_issue_list_envelope.dart';
import '../models/admin_dispute_card_envelope.dart';
import '../models/admin_dispute_list_envelope.dart';
import '../models/status4.dart';
import '../models/status5.dart';

part 'admin_cases_client.g.dart';

@RestApi()
abstract class AdminCasesClient {
  factory AdminCasesClient(Dio dio, {String? baseUrl}) = _AdminCasesClient;

  /// Dispute queue, oldest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/case-disputes')
  Future<AdminDisputeListEnvelope> listCaseDisputes({
    @Query('limit') int? limit = 20,
    @Query('status') Status4? status = Status4.open,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Dispute with the case journal chronology
  @GET('/admin/case-disputes/{id}')
  Future<AdminDisputeCardEnvelope> getCaseDispute({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Не могу связаться" queue, oldest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/contact-issues')
  Future<AdminContactIssueListEnvelope> listContactIssues({
    @Query('limit') int? limit = 20,
    @Query('status') Status5? status = Status5.open,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Report with disclosure details and the client history
  @GET('/admin/contact-issues/{id}')
  Future<AdminContactIssueCardEnvelope> getContactIssue({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// All cases, newest first (filters + search).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Text in the title.
  ///
  /// [stateCode] - Any state of the case.
  ///
  /// [hasReports] - Only cases with / without open reports.
  @GET('/admin/cases')
  Future<AdminCaseRowListEnvelope> listAdminCases({
    @Query('limit') int? limit = 20,
    @Query('cursor') String? cursor,
    @Query('status') AdminCaseStatus? status,
    @Query('q') String? q,
    @Query('clientId') String? clientId,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('stateCode') String? stateCode,
    @Query('hasReports') bool? hasReports,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Case card: description, bids, journal, reports, disputes
  @GET('/admin/cases/{id}')
  Future<AdminCaseCardEnvelope> getAdminCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide an open case (archived: out of the feed, bids rejected, client told why)
  @POST('/admin/cases/{id}/hide')
  Future<AdminCaseCardEnvelope> hideAdminCase({
    @Path('id') required String id,
    @Body() required AdminCaseActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close an open case (active bids rejected)
  @POST('/admin/cases/{id}/close')
  Future<AdminCaseCardEnvelope> closeAdminCase({
    @Path('id') required String id,
    @Body() required AdminCaseActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Archive an open case (active bids rejected)
  @POST('/admin/cases/{id}/archive')
  Future<AdminCaseCardEnvelope> archiveAdminCase({
    @Path('id') required String id,
    @Body() required AdminCaseActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore an archived (or hidden) case to open
  @POST('/admin/cases/{id}/restore')
  Future<AdminCaseCardEnvelope> restoreAdminCase({
    @Path('id') required String id,
    @Body() required AdminCaseActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
