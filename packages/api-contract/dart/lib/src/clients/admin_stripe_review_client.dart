// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/status13.dart';
import '../models/stripe_dispute_evidence_envelope.dart';
import '../models/stripe_dispute_submit_result_envelope.dart';
import '../models/stripe_review_item_envelope.dart';
import '../models/stripe_review_item_list_envelope.dart';
import '../models/stripe_review_kind.dart';
import '../models/stripe_review_resolve_dto.dart';
import '../models/stripe_review_summary_envelope.dart';

part 'admin_stripe_review_client.g.dart';

@RestApi()
abstract class AdminStripeReviewClient {
  factory AdminStripeReviewClient(Dio dio, {String? baseUrl}) =
      _AdminStripeReviewClient;

  /// The review queue, most urgent deadline first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/stripe-review')
  Future<StripeReviewItemListEnvelope> listOpen({
    @Query('status') Status13? status,
    @Query('kind') StripeReviewKind? kind,
    @Query('limit') int? limit,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Open / overdue counts and the dispute rate
  @GET('/admin/stripe-review/summary')
  Future<StripeReviewSummaryEnvelope> reviewSummary({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark an item handled (one 2FA code)
  @POST('/admin/stripe-review/{id}/resolve')
  Future<StripeReviewItemEnvelope> resolveReview({
    @Path('id') required String id,
    @Body() required StripeReviewResolveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Dismiss an item as not needing action (one 2FA code)
  @POST('/admin/stripe-review/{id}/dismiss')
  Future<StripeReviewItemEnvelope> dismissReview({
    @Path('id') required String id,
    @Body() required StripeReviewResolveDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The evidence packet we would send for a dispute
  @GET('/admin/stripe-review/disputes/{paymentId}/evidence')
  Future<StripeDisputeEvidenceEnvelope> disputeEvidence({
    @Path('paymentId') required String paymentId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rebuild the evidence draft in Stripe (not submitted)
  @POST('/admin/stripe-review/disputes/{paymentId}/draft')
  Future<StripeDisputeEvidenceEnvelope> disputeDraft({
    @Path('paymentId') required String paymentId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send the evidence to the bank through Stripe (final; one 2FA code)
  @POST('/admin/stripe-review/disputes/{paymentId}/submit')
  Future<StripeDisputeSubmitResultEnvelope> disputeSubmit({
    @Path('paymentId') required String paymentId,
    @Extras() Map<String, dynamic>? extras,
  });
}
