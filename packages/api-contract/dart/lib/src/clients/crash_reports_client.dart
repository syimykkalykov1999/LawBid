// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/crash_batch_dto.dart';

part 'crash_reports_client.g.dart';

@RestApi()
abstract class CrashReportsClient {
  factory CrashReportsClient(Dio dio, {String? baseUrl}) = _CrashReportsClient;

  /// The app reports errors (batch of up to 10)
  @POST('/crash-reports')
  Future<void> reportCrashes({
    @Header('x-device-key') required String xDeviceKey,
    @Body() required CrashBatchDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
