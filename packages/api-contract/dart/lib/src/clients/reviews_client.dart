// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_review_dto.dart';
import '../models/public_review_envelope.dart';
import '../models/public_review_list_envelope.dart';
import '../models/report_review_dto.dart';
import '../models/review_envelope.dart';
import '../models/review_helpful_dto.dart';
import '../models/review_reply_dto.dart';
import '../models/review_report_envelope.dart';
import '../models/review_sort.dart';
import '../models/review_summary_envelope.dart';
import '../models/update_review_dto.dart';

part 'reviews_client.g.dart';

@RestApi()
abstract class ReviewsClient {
  factory ReviewsClient(Dio dio, {String? baseUrl}) = _ReviewsClient;

  /// Review the attorney of a closed case (client, once per case)
  @POST('/cases/{caseId}/review')
  Future<ReviewEnvelope> create({
    @Path('caseId') required String caseId,
    @Body() required CreateReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The client's own review of a case (to edit it)
  @GET('/cases/{caseId}/review')
  Future<ReviewEnvelope> getForCase({
    @Path('caseId') required String caseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit own review within review.edit_window_days (client)
  @PATCH('/reviews/{id}')
  Future<ReviewEnvelope> update({
    @Path('id') required String id,
    @Body() required UpdateReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove my own review
  @DELETE('/reviews/{id}')
  Future<void> removeOwn({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Published reviews of an attorney, newest first.
  ///
  /// [id] - Attorney user id.
  ///
  /// [rating] - Only reviews with this star rating (tap on the bar).
  ///
  /// [sort] - Owner 2026-10-01 (Google-style): relevant (helpful, then newest) · newest · oldest · highest · lowest · helpful.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/attorneys/{id}/reviews')
  Future<PublicReviewListEnvelope> list({
    @Path('id') required String id,
    @Query('limit') int? limit = 20,
    @Query('rating') int? rating,
    @Query('sort') ReviewSort? sort,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Average rating, count and per-star distribution of an attorney.
  ///
  /// [id] - Attorney user id.
  @GET('/attorneys/{id}/reviews/summary')
  Future<ReviewSummaryEnvelope> summary({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Write / edit my open review of an attorney.
  ///
  /// [id] - Attorney user id.
  @PUT('/attorneys/{id}/reviews/mine')
  Future<ReviewEnvelope> upsertOpen({
    @Path('id') required String id,
    @Body() required CreateReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My open review of an attorney (or null).
  ///
  /// [id] - Attorney user id.
  @GET('/attorneys/{id}/reviews/mine')
  Future<ReviewEnvelope> mine({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The reviewed attorney's public reply
  @PUT('/reviews/{id}/reply')
  Future<PublicReviewEnvelope> replyToReview({
    @Path('id') required String id,
    @Body() required ReviewReplyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove my reply
  @DELETE('/reviews/{id}/reply')
  Future<PublicReviewEnvelope> deleteReviewReply({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Helpful" on / off
  @POST('/reviews/{id}/helpful')
  Future<PublicReviewEnvelope> markHelpful({
    @Path('id') required String id,
    @Body() required ReviewHelpfulDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Flag a review against the policy (anyone but the author)
  @POST('/reviews/{id}/report')
  Future<ReviewReportEnvelope> report({
    @Path('id') required String id,
    @Body() required ReportReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
