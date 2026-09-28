// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';

import 'clients/config_client.dart';
import 'clients/auth_client.dart';
import 'clients/users_client.dart';
import 'clients/i18n_client.dart';
import 'clients/admin_i18n_client.dart';
import 'clients/cases_client.dart';
import 'clients/reviews_client.dart';

/// LawBid API `v0.1.0`.
///
/// LawBid — US legal-services marketplace. Every 2xx JSON body is the envelope {data, meta?: {nextCursor}} and every error is {error: {code, message, details?, requestId}} with `code` from the ErrorCode enum — docs/01_FOUNDATION_AUTH.md §7.
class LawbidApi {
  LawbidApi(Dio dio, {String? baseUrl}) : _dio = dio, _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;

  static String get version => '0.1.0';

  ConfigClient? _config;
  AuthClient? _auth;
  UsersClient? _users;
  I18nClient? _i18n;
  AdminI18nClient? _adminI18n;
  CasesClient? _cases;
  ReviewsClient? _reviews;

  ConfigClient get config => _config ??= ConfigClient(_dio, baseUrl: _baseUrl);

  AuthClient get auth => _auth ??= AuthClient(_dio, baseUrl: _baseUrl);

  UsersClient get users => _users ??= UsersClient(_dio, baseUrl: _baseUrl);

  I18nClient get i18n => _i18n ??= I18nClient(_dio, baseUrl: _baseUrl);

  AdminI18nClient get adminI18n =>
      _adminI18n ??= AdminI18nClient(_dio, baseUrl: _baseUrl);

  CasesClient get cases => _cases ??= CasesClient(_dio, baseUrl: _baseUrl);

  ReviewsClient get reviews =>
      _reviews ??= ReviewsClient(_dio, baseUrl: _baseUrl);
}
