// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_review_appeal_list_envelope.dart';
import '../models/admin_review_appeals_decision_dto.dart';
import '../models/admin_review_appeals_decision_result_envelope.dart';
import '../models/review_appeal_status.dart';

part 'admin_review_appeals_client.g.dart';

@RestApi()
abstract class AdminReviewAppealsClient {
  factory AdminReviewAppealsClient(Dio dio, {String? baseUrl}) =
      _AdminReviewAppealsClient;

  /// Appeals by status, oldest first
  @GET('/admin/review-appeals')
  Future<AdminReviewAppealListEnvelope> listReviewAppeals({
    @Query('status') ReviewAppealStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept or reject appeals in bulk
  @POST('/admin/review-appeals/decide')
  Future<AdminReviewAppealsDecisionResultEnvelope> decideReviewAppeals({
    @Body() required AdminReviewAppealsDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
