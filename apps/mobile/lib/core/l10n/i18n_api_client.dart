import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';

/// One row of `GET /i18n/languages` (docs/01_FOUNDATION_AUTH.md §9.3) —
/// field-for-field the backend's `i18n_languages` table
/// (apps/api/prisma/schema.prisma `model I18nLanguage`): `code`,
/// `name_native`, `is_active`, `is_rtl`, `sort`. Kept snake_case-in/
/// camelCase-out the same way the rest of this app's DTOs do (see
/// `auth_dtos.dart`) — the backend's `ResponseInterceptor` doesn't
/// transform casing.
class I18nLanguageDto {
  const I18nLanguageDto({
    required this.code,
    required this.nameNative,
    required this.isActive,
    required this.isRtl,
    required this.sort,
  });
  factory I18nLanguageDto.fromJson(Map<String, dynamic> json) =>
      I18nLanguageDto(
        code: json['code'] as String,
        nameNative: json['name_native'] as String,
        isActive: json['is_active'] as bool,
        isRtl: json['is_rtl'] as bool,
        sort: json['sort'] as int,
      );

  /// ISO 639-1 code, e.g. `en`, `ru` (file 01 §9.2).
  final String code;
  final String nameNative;
  final bool isActive;
  final bool isRtl;
  final int sort;
}

/// `GET /i18n/bundle/:lang?since=version`'s response body
/// (apps/api/src/modules/i18n/controllers/i18n.controller.ts:
/// `{data: {lang, version, translations}}`). `translations` is the full
/// bundle when the request omitted `since`, or only the keys whose
/// server-side version is newer than `since` otherwise (possibly empty —
/// see [I18nApiClient.getBundle]'s doc comment).
class I18nBundleResult {
  const I18nBundleResult({
    required this.lang,
    required this.version,
    required this.translations,
  });
  factory I18nBundleResult.fromJson(Map<String, dynamic> json) =>
      I18nBundleResult(
        lang: json['lang'] as String,
        version: json['version'] as int,
        translations: (json['translations'] as Map<String, dynamic>).map(
          (key, value) => MapEntry(key, value as String),
        ),
      );

  final String lang;
  final int version;
  final Map<String, String> translations;
}

/// `/i18n/*` endpoints (docs/01_FOUNDATION_AUTH.md §9.3/§9.4) — both
/// `@Public()` server-side (i18n.controller.ts's class doc comment: the
/// Flutter client calls these before a session exists, same reasoning as
/// `AuthApiClient`'s token-issuing methods), so every call here uses
/// `skipAuth` the same way `AuthApiClient` does. Same
/// `ApiException.fromDioException` conversion pattern too — see that
/// file's doc comment.
class I18nApiClient {
  I18nApiClient(this._dio);

  final Dio _dio;

  ///
  /// `noRetry` (stage 1.7 mobile): both calls are best-effort background
  /// refreshes with a compiled-in/Drift fallback and are re-attempted on
  /// the next launch or language switch — RetryInterceptor's backoff would
  /// only hold sockets/timers open for data the UI never waits on.
  Options get _skipAuth =>
      Options(extra: const {'skipAuth': true, 'noRetry': true});

  /// `GET /i18n/languages` — the active-language catalog
  /// (`I18nLanguagesService.listActive`). Unlike `getBundle` below, this
  /// route does NOT bypass the backend's `ResponseInterceptor`, so the
  /// body is the standard `{data: [...]}` envelope every other endpoint in
  /// this app uses.
  Future<List<I18nLanguageDto>> getLanguages() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/i18n/languages',
        options: _skipAuth,
      );
      final envelope = response.data?['data'];
      if (envelope is! List) {
        throw const ApiException(
          code: ApiException.networkErrorCode,
          message: 'Unexpected response shape from the server.',
        );
      }
      return envelope
          .cast<Map<String, dynamic>>()
          .map(I18nLanguageDto.fromJson)
          .toList(
            growable: false,
          );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `GET /i18n/bundle/:lang?since=version` — `since == null` requests the
  /// full bundle (first-ever sync for [lang]); a non-null `since` requests
  /// only the keys changed after that bundle version
  /// (docs/01_FOUNDATION_AUTH.md §9.3's "полный или дельта-набор", §9.4's
  /// "bundle?since="). Always a plain 200 JSON body: this client never
  /// sends `If-None-Match`, so the backend's separate ETag/304
  /// conditional-GET path (only taken when `since` is absent AND the
  /// request's `If-None-Match` matches — see i18n.controller.ts) never
  /// fires here. That path exists for a browser-style "revalidate what I
  /// already have" GET; the `since=`-based delta this client uses is the
  /// mechanism §9.4 actually names for the background-refresh flow, and it
  /// needs no separate empty-body branch since it's always a normal 200.
  Future<I18nBundleResult> getBundle(String lang, {int? since}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/i18n/bundle/$lang',
        queryParameters: since != null ? {'since': since} : null,
        options: _skipAuth,
      );
      final envelope = response.data?['data'];
      if (envelope is! Map<String, dynamic>) {
        throw const ApiException(
          code: ApiException.networkErrorCode,
          message: 'Unexpected response shape from the server.',
        );
      }
      return I18nBundleResult.fromJson(envelope);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
