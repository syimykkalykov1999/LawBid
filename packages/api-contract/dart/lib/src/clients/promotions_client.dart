// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_promotion_state_envelope.dart';
import '../models/create_promotion_dto.dart';
import '../models/create_promotion_result_envelope.dart';
import '../models/promotion_quote_envelope.dart';

part 'promotions_client.g.dart';

@RestApi()
abstract class PromotionsClient {
  factory PromotionsClient(Dio dio, {String? baseUrl}) = _PromotionsClient;

  /// Price of promoting a case for N days
  @GET('/promotions/quote')
  Future<PromotionQuoteEnvelope> getPromotionQuote({
    @Query('days') required int days,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My case's current / last promotion and a quote (case owner)
  @GET('/cases/{id}/promotion')
  Future<CasePromotionStateEnvelope> getCasePromotion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Promote my open case: free with credits / a 100 % code, else a checkout URL
  @POST('/cases/{id}/promotions')
  Future<CreatePromotionResultEnvelope> createCasePromotion({
    @Path('id') required String id,
    @Body() required CreatePromotionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
