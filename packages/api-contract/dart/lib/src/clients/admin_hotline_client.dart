// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/hotline_live_envelope.dart';

part 'admin_hotline_client.g.dart';

@RestApi()
abstract class AdminHotlineClient {
  factory AdminHotlineClient(Dio dio, {String? baseUrl}) = _AdminHotlineClient;

  /// Hotline now: line, queues, calls (Valkey only)
  @GET('/admin/hotline/live')
  Future<HotlineLiveEnvelope> adminHotlineLive({
    @Extras() Map<String, dynamic>? extras,
  });
}
