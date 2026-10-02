// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_client_badge_approve_dto.dart';
import '../models/admin_client_badge_bulk_approve_dto.dart';
import '../models/admin_client_badge_bulk_reject_dto.dart';
import '../models/admin_client_badge_bulk_result_envelope.dart';
import '../models/admin_client_badge_envelope.dart';
import '../models/admin_client_badge_reason_dto.dart';
import '../models/admin_client_badge_row_list_envelope.dart';
import '../models/status9.dart';
import '../models/sub_status.dart';

part 'admin_client_badge_client.g.dart';

@RestApi()
abstract class AdminClientBadgeClient {
  factory AdminClientBadgeClient(Dio dio, {String? baseUrl}) =
      _AdminClientBadgeClient;

  /// Requests, newest first (filter by status).
  ///
  /// [q] - Name or @username.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/client-badges')
  Future<AdminClientBadgeRowListEnvelope> listAdminClientBadges({
    @Query('status') Status9? status,
    @Query('subStatus') SubStatus? subStatus,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve many requests at once (skips invalid ones)
  @POST('/admin/client-badges/bulk-approve')
  Future<AdminClientBadgeBulkResultEnvelope> bulkApproveAdminClientBadges({
    @Body() required AdminClientBadgeBulkApproveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject many pending requests with one reason
  @POST('/admin/client-badges/bulk-reject')
  Future<AdminClientBadgeBulkResultEnvelope> bulkRejectAdminClientBadges({
    @Body() required AdminClientBadgeBulkRejectDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One request with short-lived links to documents
  @GET('/admin/client-badges/{id}')
  Future<AdminClientBadgeEnvelope> getAdminClientBadge({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve (free: true = give the badge for nothing)
  @POST('/admin/client-badges/{id}/approve')
  Future<AdminClientBadgeEnvelope> approveAdminClientBadge({
    @Path('id') required String id,
    @Body() required AdminClientBadgeApproveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject a pending request with a reason
  @POST('/admin/client-badges/{id}/reject')
  Future<AdminClientBadgeEnvelope> rejectAdminClientBadge({
    @Path('id') required String id,
    @Body() required AdminClientBadgeReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take the badge away and stop the subscription
  @POST('/admin/client-badges/{id}/revoke')
  Future<AdminClientBadgeEnvelope> revokeAdminClientBadge({
    @Path('id') required String id,
    @Body() required AdminClientBadgeReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
