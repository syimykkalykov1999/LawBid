// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_report_dto.dart';

part 'reports_client.g.dart';

@RestApi()
abstract class ReportsClient {
  factory ReportsClient(Dio dio, {String? baseUrl}) = _ReportsClient;

  /// Report a post, comment, message or user (docs/05 §12.1)
  @POST('/reports')
  Future<void> createReport({
    @Body() required CreateReportDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
