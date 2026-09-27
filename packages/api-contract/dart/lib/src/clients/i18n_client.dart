// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/i18n_bundle_envelope.dart';
import '../models/i18n_language_list_envelope.dart';

part 'i18n_client.g.dart';

@RestApi()
abstract class I18nClient {
  factory I18nClient(Dio dio, {String? baseUrl}) = _I18nClient;

  @GET('/i18n/languages')
  Future<I18nLanguageListEnvelope> listLanguages({
    @Extras() Map<String, dynamic>? extras,
  });

  /// GET /i18n/bundle/:lang?since=version. Bypasses the global.
  /// ResponseInterceptor's {data:...} envelope deliberately (@Res().
  /// without `passthrough`, per Nest's documented raw-response-control.
  /// pattern) — that's the only way to send a spec-correct empty-body 304.
  /// for a matching ETag (docs/01_FOUNDATION_AUTH.md §9.3: "Поддержка.
  /// ETag/304"). Every other route in this module returns normally and.
  /// gets the standard envelope.
  ///
  /// ETag/304 is the plain-GET HTTP-cache path (no `since`): if the.
  /// client's If-None-Match matches the language's current version, 304.
  /// with no body. `since` is the separate, explicit delta-poll path.
  /// (§9.3: "полный или дельта-набор + version") — it always returns 200.
  /// with a (possibly empty) JSON body, never a 304, since it's a.
  /// versioned query the client is actively asking for, not a cache.
  /// revalidation.
  ///
  /// [ifNoneMatch] - ETag of the bundle the client already has (ignored with `since`).
  @GET('/i18n/bundle/{lang}')
  Future<I18nBundleEnvelope> getBundle({
    @Path('lang') required String lang,
    @Query('since') num? since,
    @Header('If-None-Match') String? ifNoneMatch,
    @Extras() Map<String, dynamic>? extras,
  });
}
