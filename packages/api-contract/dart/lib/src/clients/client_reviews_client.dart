// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/client_review_envelope.dart';
import '../models/client_review_list_envelope.dart';
import '../models/client_review_report_envelope.dart';
import '../models/client_reviews_sort.dart';
import '../models/report_review_dto.dart';
import '../models/review_helpful_dto.dart';
import '../models/review_reply_dto.dart';
import '../models/review_summary_envelope.dart';
import '../models/upsert_client_review_dto.dart';

part 'client_reviews_client.g.dart';

@RestApi()
abstract class ClientReviewsClient {
  factory ClientReviewsClient(Dio dio, {String? baseUrl}) =
      _ClientReviewsClient;

  /// Review the case's client (hired attorney)
  @PUT('/cases/{id}/client-review')
  Future<ClientReviewEnvelope> upsertClientReview({
    @Path('id') required String id,
    @Body() required UpsertClientReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My review of the case client, or null
  @GET('/cases/{id}/client-review')
  Future<ClientReviewEnvelope> getMyClientReview({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Review a client — any attorney or client, once (owner 2026-09-30)
  @PUT('/clients/{id}/reviews/mine')
  Future<ClientReviewEnvelope> upsertOpenClientReview({
    @Path('id') required String id,
    @Body() required UpsertClientReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My review of this client, or null
  @GET('/clients/{id}/reviews/mine')
  Future<ClientReviewEnvelope> getMyOpenClientReview({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my review of a client
  @DELETE('/client-reviews/{id}')
  Future<void> deleteClientReview({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The reviewed person's public reply
  @PUT('/client-reviews/{id}/reply')
  Future<ClientReviewEnvelope> replyToClientReview({
    @Path('id') required String id,
    @Body() required ReviewReplyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove my reply
  @DELETE('/client-reviews/{id}/reply')
  Future<ClientReviewEnvelope> deleteClientReviewReply({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Helpful" on / off
  @POST('/client-reviews/{id}/helpful')
  Future<ClientReviewEnvelope> markClientReviewHelpful({
    @Path('id') required String id,
    @Body() required ReviewHelpfulDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Flag a review against the policy
  @POST('/client-reviews/{id}/report')
  Future<ClientReviewReportEnvelope> reportClientReview({
    @Path('id') required String id,
    @Body() required ReportReviewDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reviews of a client (every signed-in user).
  ///
  /// [rating] - Only reviews with this star rating (tap on the bar).
  @GET('/clients/{id}/reviews')
  Future<ClientReviewListEnvelope> listClientReviews({
    @Path('id') required String id,
    @Query('rating') int? rating,
    @Query('sort') ClientReviewsSort? sort,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Average, count and per-star distribution of a client
  @GET('/clients/{id}/reviews/summary')
  Future<ReviewSummaryEnvelope> clientReviewsSummary({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
