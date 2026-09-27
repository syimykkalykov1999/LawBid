// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/bootstrap_envelope.dart';

part 'config_client.g.dart';

@RestApi()
abstract class ConfigClient {
  factory ConfigClient(Dio dio, {String? baseUrl}) = _ConfigClient;

  @GET('/config/bootstrap')
  Future<BootstrapEnvelope> getBootstrap({
    @Extras() Map<String, dynamic>? extras,
  });
}
