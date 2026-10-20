// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/i18n_import_mode.dart';
import '../models/i18n_import_report_envelope.dart';
import '../models/i18n_texts_envelope.dart';
import '../models/reset_i18n_text_dto.dart';
import '../models/translate_i18n_text_dto.dart';
import '../models/translated_i18n_text_envelope.dart';
import '../models/update_i18n_text_dto.dart';
import '../models/update_i18n_text_many_dto.dart';

part 'admin_i18n_client.g.dart';

@RestApi()
abstract class AdminI18nClient {
  factory AdminI18nClient(Dio dio, {String? baseUrl}) = _AdminI18nClient;

  /// Owner 2026-10-18: the texts under a key prefix in every language.
  /// (admin «Справочник»: `guide.`).
  @GET('/admin/i18n/texts')
  Future<I18nTextsEnvelope> listTexts({
    @Query('prefix') required String prefix,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One text in one language; phones get it on their next bundle sync.
  @PUT('/admin/i18n/texts')
  Future<void> updateText({
    @Body() required UpdateI18nTextDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Перевести на все языки»: a machine-translation preview of the.
  /// edited text into every other language (nothing is saved).
  @POST('/admin/i18n/texts/translate')
  Future<TranslatedI18nTextEnvelope> translateText({
    @Body() required TranslateI18nTextDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The confirmed preview: one text in many languages at once.
  @PUT('/admin/i18n/texts/many')
  Future<void> updateTextMany({
    @Body() required UpdateI18nTextManyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Сбросить к встроенному тексту» (one language or all).
  @POST('/admin/i18n/texts/reset')
  Future<void> resetText({
    @Body() required ResetI18nTextDto body,
    @Extras() Map<String, dynamic>? extras,
  });

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
