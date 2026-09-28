// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_review_dto.dart';
import '../models/public_review_list_envelope.dart';
import '../models/report_review_dto.dart';
import '../models/review_envelope.dart';
import '../models/review_report_envelope.dart';
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

  /// Edit own review within review.edit_window_days (client)
  @PATCH('/reviews/{id}')
  Future<ReviewEnvelope> update({
    @Path('id') required String id,
    @Body() required UpdateReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Published reviews of an attorney, newest first.
  ///
  /// [id] - Attorney user id.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/attorneys/{id}/reviews')
  Future<PublicReviewListEnvelope> list({
    @Path('id') required String id,
    @Query('limit') int? limit = 20,
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

  /// Report a review to moderation (the reviewed attorney)
  @POST('/reviews/{id}/report')
  Future<ReviewReportEnvelope> report({
    @Path('id') required String id,
    @Body() required ReportReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
