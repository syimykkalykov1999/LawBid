// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/client_review_envelope.dart';
import '../models/client_review_list_envelope.dart';
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

  /// Reviews of a client (attorneys and the client only)
  @GET('/clients/{id}/reviews')
  Future<ClientReviewListEnvelope> listClientReviews({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
