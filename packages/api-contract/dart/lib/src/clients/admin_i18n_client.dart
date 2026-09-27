// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/i18n_import_mode.dart';
import '../models/i18n_import_report_envelope.dart';

part 'admin_i18n_client.g.dart';

@RestApi()
abstract class AdminI18nClient {
  factory AdminI18nClient(Dio dio, {String? baseUrl}) = _AdminI18nClient;

  /// [file] - xlsx or csv in the docs/01 §9.2 format, ≤ 10 MB.
  @MultiPart()
  @POST('/admin/i18n/import')
  Future<I18nImportReportEnvelope> importTranslations({
    @Part(name: 'file') required MultipartFile file,
    @Query('mode') I18nImportMode? mode,
    @Extras() Map<String, dynamic>? extras,
  });

  @GET('/admin/i18n/export')
  @DioResponseType(ResponseType.stream)
  Stream<String> exportTranslations({@Extras() Map<String, dynamic>? extras});
}
