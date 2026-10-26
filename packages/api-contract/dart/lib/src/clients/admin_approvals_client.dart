// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_approval_envelope.dart';
import '../models/admin_approval_list_envelope.dart';
import '../models/admin_approval_reject_dto.dart';
import '../models/admin_approvals_count_envelope.dart';
import '../models/status.dart';

part 'admin_approvals_client.g.dart';

@RestApi()
abstract class AdminApprovalsClient {
  factory AdminApprovalsClient(Dio dio, {String? baseUrl}) =
      _AdminApprovalsClient;

  /// Requests waiting for a second admin (or decided ones), newest first.
  ///
  /// [status] - pending = waiting for a second admin; done = decided.
  @GET('/admin/approvals')
  Future<AdminApprovalListEnvelope> listAdminApprovals({
    @Query('status') Status? status = Status.pending,
    @Extras() Map<String, dynamic>? extras,
  });

  /// How many this admin could approve now (badge)
  @GET('/admin/approvals/count')
  Future<AdminApprovalsCountEnvelope> countAdminApprovals({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve as the second admin (fresh step-up; never your own request) — the action runs now, once
  @POST('/admin/approvals/{id}/approve')
  Future<AdminApprovalEnvelope> approveAdminApproval({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn it down (or withdraw your own request); nothing runs
  @POST('/admin/approvals/{id}/reject')
  Future<AdminApprovalEnvelope> rejectAdminApproval({
    @Path('id') required String id,
    @Body() required AdminApprovalRejectDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
