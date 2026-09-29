// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/dashboard_envelope.dart';

part 'admin_dashboard_client.g.dart';

@RestApi()
abstract class AdminDashboardClient {
  factory AdminDashboardClient(Dio dio, {String? baseUrl}) =
      _AdminDashboardClient;

  /// Operational numbers (cached ≤ 60 s)
  @GET('/admin/dashboard')
  Future<DashboardEnvelope> getDashboard({
    @Extras() Map<String, dynamic>? extras,
  });
}
