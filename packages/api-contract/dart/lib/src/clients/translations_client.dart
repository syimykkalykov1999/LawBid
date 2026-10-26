// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/content_translation_envelope.dart';
import '../models/translate_content_dto.dart';

part 'translations_client.g.dart';

@RestApi()
abstract class TranslationsClient {
  factory TranslationsClient(Dio dio, {String? baseUrl}) = _TranslationsClient;

  /// Translate a post, comment, case, bid, review or bio
  @POST('/translations')
  Future<ContentTranslationEnvelope> translate({
    @Body() required TranslateContentDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
