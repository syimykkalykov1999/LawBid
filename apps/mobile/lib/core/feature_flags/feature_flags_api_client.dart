import 'package:dio/dio.dart';
import 'package:lawbid/core/feature_flags/legal_document.dart';
import 'package:lawbid/core/network/api_error.dart';

/// `GET /config/bootstrap`'s response body
/// (apps/api/src/modules/feature-flags/services/bootstrap.service.ts
/// `BootstrapResponse`): `{data: {flags, app_config, languages,
/// translations_version, legal_documents}}`. Only `flags` and
/// `app_config` are parsed here — `languages`/`translations_version` are
/// redundant with what `L10nCacheController`/`I18nApiClient` already
/// fetch from the dedicated `/i18n/*` endpoints (docs/01_FOUNDATION_AUTH
/// .md §9.4), and `legal_documents` has no consumer yet (the welcome
/// screen's Terms/Privacy links are still the pre-existing "not built
/// yet" stub — see welcome_screen.dart). Parsing fields this client has
/// no use for yet would be exactly the kind of speculative surface
/// .cursorrules warns against; add them here when something actually
/// reads them.
class FeatureFlagsBootstrapResult {
  const FeatureFlagsBootstrapResult({
    required this.flags,
    required this.appConfig,
    this.legalDocuments = const [],
  });
  factory FeatureFlagsBootstrapResult.fromJson(Map<String, dynamic> json) {
    final rawFlags = json['flags'];
    final flags = <String, bool>{};
    if (rawFlags is Map<String, dynamic>) {
      for (final entry in rawFlags.entries) {
        if (entry.value is bool) flags[entry.key] = entry.value as bool;
      }
    }

    final rawConfig = json['app_config'];
    final appConfig = <String, String>{};
    if (rawConfig is Map<String, dynamic>) {
      for (final entry in rawConfig.entries) {
        // Audit 2026-10-02: numeric limits too (files, video, stickers),
        // kept as text — read them with FeatureFlagsState.configInt.
        final v = entry.value;
        if (v is String) {
          appConfig[entry.key] = v;
        } else if (v is num || v is bool) {
          appConfig[entry.key] = '$v';
        }
      }
    }

    final rawDocs = json['legal_documents'];
    final legalDocuments = rawDocs is List
        ? rawDocs
            .map(LegalDocument.tryParse)
            .whereType<LegalDocument>()
            .toList()
        : const <LegalDocument>[];

    return FeatureFlagsBootstrapResult(
      flags: flags,
      appConfig: appConfig,
      legalDocuments: legalDocuments,
    );
  }

  /// `{flagKey: enabled}`, e.g. `{"apple_login": true, "video_posts":
  /// false}` — see `apps/api/prisma/schema.prisma`'s `FeatureFlag` model.
  final Map<String, bool> flags;

  /// `{configKey: value}`, values kept only when they're strings (every
  /// key `seedAppConfig` writes is one — see
  /// `apps/api/prisma/seed.ts`). A non-string value (or a key this
  /// client doesn't recognize) is silently dropped rather than crashing
  /// the parse — `app_config` is meant to grow keys over time without a
  /// client release, per the same reasoning as `defaultFeatureFlags`.
  final Map<String, String> appConfig;

  /// `legal_documents` — consumed by the onboarding consents step
  /// (stage 1.7 mobile, docs/01_FOUNDATION_AUTH.md §10.2 H).
  final List<LegalDocument> legalDocuments;
}

/// `/config/bootstrap` (docs/01_FOUNDATION_AUTH.md §10.2 "A. Splash",
/// §15 "Этап 1.8") — `@Public()` server-side (bootstrap.controller.ts's
/// class doc comment: called before a session exists), so this uses
/// `skipAuth` the same way `I18nApiClient`/`AuthApiClient` do. Same
/// `ApiException.fromDioException` conversion pattern too.
class FeatureFlagsApiClient {
  FeatureFlagsApiClient(this._dio);

  final Dio _dio;

  Future<FeatureFlagsBootstrapResult> getBootstrap() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/config/bootstrap',
        options: Options(extra: const {'skipAuth': true}),
      );
      final envelope = response.data?['data'];
      if (envelope is! Map<String, dynamic>) {
        throw const ApiException(
          code: ApiException.networkErrorCode,
          message: 'Unexpected response shape from the server.',
        );
      }
      return FeatureFlagsBootstrapResult.fromJson(envelope);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
