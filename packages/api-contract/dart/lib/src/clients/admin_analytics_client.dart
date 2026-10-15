// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/analytics_envelope.dart';

part 'admin_analytics_client.g.dart';

@RestApi()
abstract class AdminAnalyticsClient {
  factory AdminAnalyticsClient(Dio dio, {String? baseUrl}) =
      _AdminAnalyticsClient;

  /// DAU/MAU, the sign-up funnel, retention, churn and purchases by day
  @GET('/admin/analytics')
  Future<AnalyticsEnvelope> getAnalytics({
    @Query('days') num? days = 30,
    @Extras() Map<String, dynamic>? extras,
  });
}
