// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_bid_row_list_envelope.dart';
import '../models/admin_bid_status.dart';
import '../models/admin_client_review_row_list_envelope.dart';
import '../models/admin_comment_row_list_envelope.dart';
import '../models/admin_comment_thread.dart';
import '../models/admin_overview_envelope.dart';
import '../models/admin_post_kind.dart';
import '../models/admin_post_row_list_envelope.dart';
import '../models/admin_practice_area_list_envelope.dart';
import '../models/admin_reason_dto.dart';
import '../models/admin_remove_comment_dto.dart';
import '../models/admin_remove_dto.dart';
import '../models/admin_review_row_list_envelope.dart';
import '../models/admin_review_status.dart';
import '../models/broadcast_envelope.dart';
import '../models/broadcast_list_envelope.dart';
import '../models/create_broadcast_dto.dart';
import '../models/create_practice_area_dto.dart';
import '../models/export_entity.dart';
import '../models/media.dart';
import '../models/update_practice_area_dto.dart';

part 'admin_content_client.g.dart';

@RestApi()
abstract class AdminContentClient {
  factory AdminContentClient(Dio dio, {String? baseUrl}) = _AdminContentClient;

  /// Extended numbers for the dashboard
  @GET('/admin/overview')
  Future<AdminOverviewEnvelope> getAdminOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Posts and news, newest first.
  ///
  /// [q] - Search text.
  ///
  /// [media] - Only posts that carry a video (the former "reels").
  @GET('/admin/content/posts')
  Future<AdminPostRowListEnvelope> listAdminPosts({
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('kind') AdminPostKind? kind,
    @Query('media') Media? media,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a post (reason goes to the audit log)
  @POST('/admin/content/posts/{id}/remove')
  Future<void> removeAdminPost({
    @Path('id') required String id,
    @Body() required AdminRemoveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Post or case comments, newest first.
  ///
  /// [q] - Search text.
  @GET('/admin/content/comments')
  Future<AdminCommentRowListEnvelope> listAdminComments({
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('thread') AdminCommentThread? thread,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a comment
  @POST('/admin/content/comments/{id}/remove')
  Future<void> removeAdminComment({
    @Path('id') required String id,
    @Body() required AdminRemoveCommentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reviews of attorneys, newest first.
  ///
  /// [q] - Search text.
  @GET('/admin/content/reviews')
  Future<AdminReviewRowListEnvelope> listAdminReviews({
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide a review
  @POST('/admin/content/reviews/{id}/hide')
  Future<void> hideAdminReview({
    @Path('id') required String id,
    @Body() required AdminRemoveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show a hidden review again
  @POST('/admin/content/reviews/{id}/restore')
  Future<void> restoreAdminReview({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore a post removed or hidden by moderation (reason audited)
  @POST('/admin/content/posts/{id}/restore')
  Future<void> restoreAdminPost({
    @Path('id') required String id,
    @Body() required AdminReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore a post comment removed by moderation
  @POST('/admin/content/comments/{id}/restore')
  Future<void> restoreAdminComment({
    @Path('id') required String id,
    @Body() required AdminReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore a case comment removed by moderation
  @POST('/admin/content/case-comments/{id}/restore')
  Future<void> restoreAdminCaseComment({
    @Path('id') required String id,
    @Body() required AdminReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reviews of clients, newest first.
  ///
  /// [q] - Search text.
  @GET('/admin/content/client-reviews')
  Future<AdminClientReviewRowListEnvelope> listAdminClientReviews({
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('status') AdminReviewStatus? status,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide a review of a client (author notified)
  @POST('/admin/content/client-reviews/{id}/hide')
  Future<void> hideAdminClientReview({
    @Path('id') required String id,
    @Body() required AdminReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show a hidden / removed review of a client
  @POST('/admin/content/client-reviews/{id}/restore')
  Future<void> restoreAdminClientReview({
    @Path('id') required String id,
    @Body() required AdminReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// All bids, newest first.
  ///
  /// [q] - Search text.
  @GET('/admin/bids')
  Future<AdminBidRowListEnvelope> listAdminBids({
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('status') AdminBidStatus? status,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every qualification with usage counts
  @GET('/admin/practice-areas')
  Future<AdminPracticeAreaListEnvelope> listAdminPracticeAreas({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a qualification
  @POST('/admin/practice-areas')
  Future<AdminPracticeAreaListEnvelope> createAdminPracticeArea({
    @Body() required CreatePracticeAreaDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename, reorder or switch off a qualification
  @PATCH('/admin/practice-areas/{id}')
  Future<AdminPracticeAreaListEnvelope> updateAdminPracticeArea({
    @Path('id') required String id,
    @Body() required UpdatePracticeAreaDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sent broadcasts (last 100)
  @GET('/admin/broadcasts')
  Future<BroadcastListEnvelope> listAdminBroadcasts({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send a push + in-app message to an audience
  @POST('/admin/broadcasts')
  Future<BroadcastEnvelope> sendAdminBroadcast({
    @Body() required CreateBroadcastDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// CSV export (up to 50 000 rows). Every export is audited; `users` (phones, emails) needs X-Justification.
  ///
  /// [xJustification] - Required for entity=users: why contacts are exported (10–500 chars, encodeURIComponent for non-ASCII).
  @GET('/admin/export/{entity}')
  Future<void> exportAdminCsv({
    @Path('entity') required ExportEntity entity,
    @Header('X-Justification') String? xJustification,
    @Extras() Map<String, dynamic>? extras,
  });
}
