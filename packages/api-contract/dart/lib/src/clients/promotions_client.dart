// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_promotion_envelope.dart';
import '../models/case_promotion_state_envelope.dart';
import '../models/create_promotion_dto.dart';
import '../models/create_promotion_result_envelope.dart';
import '../models/my_promotion_list_envelope.dart';
import '../models/promotion_click_result_envelope.dart';
import '../models/promotion_quote_envelope.dart';
import '../models/promotion_target.dart';

part 'promotions_client.g.dart';

@RestApi()
abstract class PromotionsClient {
  factory PromotionsClient(Dio dio, {String? baseUrl}) = _PromotionsClient;

  /// Price of promoting a case for N days.
  ///
  /// [dailyBudgetCents] - Owner 2026-10-05: daily budget; default from the admin.
  @GET('/promotions/quote')
  Future<PromotionQuoteEnvelope> getPromotionQuote({
    @Query('days') required int days,
    @Query('dailyBudgetCents') int? dailyBudgetCents,
    @Query('target') PromotionTarget? target,
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

  /// My post's current / last promotion and a quote (author)
  @GET('/posts/{id}/promotion')
  Future<CasePromotionStateEnvelope> getPostPromotion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Promote my post (Instagram-style): free with credits / a 100 % code, else a checkout URL
  @POST('/posts/{id}/promotions')
  Future<CreatePromotionResultEnvelope> createPostPromotion({
    @Path('id') required String id,
    @Body() required CreatePromotionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My promotions with reach, clicks and progress
  @GET('/me/promotions')
  Future<MyPromotionListEnvelope> listMyPromotions({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop my running / unpaid promotion early
  @POST('/promotions/{id}/stop')
  Future<CasePromotionEnvelope> stopPromotion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A promoted post / case was opened (stats)
  @POST('/promotions/{id}/click')
  Future<PromotionClickResultEnvelope> clickPromotion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
