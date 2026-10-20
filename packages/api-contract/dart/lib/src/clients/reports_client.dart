// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_report_dto.dart';
import '../models/my_report_list_envelope.dart';

part 'reports_client.g.dart';

@RestApi()
abstract class ReportsClient {
  factory ReportsClient(Dio dio, {String? baseUrl}) = _ReportsClient;

  /// My reports and where they stand (last 50)
  @GET('/reports/mine')
  Future<MyReportListEnvelope> listMyReports({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Report a post, comment, message or user (docs/05 §12.1)
  @POST('/reports')
  Future<void> createReport({
    @Body() required CreateReportDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
