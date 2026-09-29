// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_contact_issue_card_envelope.dart';
import '../models/admin_contact_issue_list_envelope.dart';
import '../models/admin_dispute_card_envelope.dart';
import '../models/admin_dispute_list_envelope.dart';
import '../models/status3.dart';
import '../models/status4.dart';

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
    @Query('status') Status3? status = Status3.open,
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
    @Query('status') Status4? status = Status4.open,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Report with disclosure details and the client history
  @GET('/admin/contact-issues/{id}')
  Future<AdminContactIssueCardEnvelope> getContactIssue({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
