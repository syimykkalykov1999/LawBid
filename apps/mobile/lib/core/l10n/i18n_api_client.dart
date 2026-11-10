import 'package:dio/dio.dart';

import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

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

  /// Sweep B-c9: parsed by the generated contract model
  /// (packages/api-contract/dart, json_serializable), not by hand.
  factory I18nLanguageDto.fromJson(Map<String, dynamic> json) =>
      I18nLanguageDto.fromApi(api.I18nLanguageDto.fromJson(json));

  factory I18nLanguageDto.fromApi(api.I18nLanguageDto d) => I18nLanguageDto(
        code: d.code,
        nameNative: d.nameNative,
        isActive: d.isActive,
        isRtl: d.isRtl,
        sort: d.sort,
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

  /// Sweep B-c9: the generated contract model does the parsing.
  factory I18nBundleResult.fromJson(Map<String, dynamic> json) {
    final d = api.I18nBundleDto.fromJson(json);
    return I18nBundleResult(
      lang: d.lang,
      version: d.version,
      translations: d.translations,
    );
  }

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

  /// How long the language list is served from the phone (R-385).
  static const languagesWindow = Duration(hours: 1);

  /// `GET /i18n/languages` — the active-language catalog
  /// (`I18nLanguagesService.listActive`). Unlike `getBundle` below, this
  /// route does NOT bypass the backend's `ResponseInterceptor`, so the
  /// body is the standard `{data: [...]}` envelope every other endpoint in
  /// this app uses.
  Future<List<I18nLanguageDto>> getLanguages() async {
    try {
      // R-385: the list changes a few times a year — an hour from the
      // phone (cold starts and the picker ask nothing), then a cheap 304.
      final response = await _dio.get<Map<String, dynamic>>(
        '/i18n/languages',
        options: Options(
          extra: {
            'skipAuth': true,
            'noRetry': true,
            ...cacheFor(languagesWindow),
          },
        ),
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
  /// "bundle?since="). A plain 200 JSON body the first
  /// time. Owner 2026-10-23 (web pass): the server tags a delta with its
  /// `since` too, so the app's HTTP cache (`HttpCacheInterceptor`, which adds
  /// `If-None-Match` by itself) turns the same call after a reload into an
  /// empty 304.
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
