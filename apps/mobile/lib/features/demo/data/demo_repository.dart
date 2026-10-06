import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';

/// Owner 2026-10-05 — `/demo/*` (docs/ops/demo-world.md). Plain [Dio] calls
/// on the app's shared client (every interceptor applies): the endpoints
/// are newer than the generated `package:lawbid_api`; switch to the
/// generated client once openapi.json is regenerated.
class DemoRepository {
  DemoRepository(this._dio);

  final Dio _dio;

  /// `GET /demo/me` — real JWT. Non-partners get `enabled: false`.
  Future<DemoMe> me() => guardApiCall(() async {
        final r = await _dio.get<Object?>('/demo/me');
        return DemoMe.fromJson(_data(r));
      });

  /// `POST /demo/accounts` — creates the account and returns its session.
  Future<DemoSession> create(DemoRole role) => guardApiCall(() async {
        final r = await _dio.post<Object?>(
          '/demo/accounts',
          data: {'role': role.wire},
          options: RequestFlags.createOptions(),
        );
        return DemoSession.fromJson(_data(r));
      });

  /// `POST /demo/accounts/:id/session` — enters an existing account again.
  Future<DemoSession> enter(String id) => guardApiCall(() async {
        final r = await _dio.post<Object?>('/demo/accounts/$id/session');
        return DemoSession.fromJson(_data(r));
      });

  /// `DELETE /demo/accounts/:id` — the demo user and all its data.
  Future<void> delete(String id) =>
      guardApiCall(() => _dio.delete<Object?>('/demo/accounts/$id'));

  /// `POST /demo/invites/redeem` — PUBLIC: a blogger's 8-character code.
  /// Throws DEMO_CODE_INVALID / DEMO_DISABLED / DEMO_UNAVAILABLE.
  Future<DemoSession> redeem(String code) => guardApiCall(() async {
        final r = await _dio.post<Object?>(
          '/demo/invites/redeem',
          data: {'code': code},
          options: Options(
            extra: const {
              RequestFlags.skipAuth: true,
              RequestFlags.noRetry: true,
            },
          ),
        );
        return DemoSession.fromJson(_data(r));
      });

  /// Success envelope `{data: {...}}` (docs/01 §7) — tolerant of a bare
  /// object too.
  static Map<String, dynamic> _data(Response<Object?> r) {
    final body = r.data;
    if (body is Map<String, dynamic>) {
      final data = body['data'];
      if (data is Map<String, dynamic>) return data;
      return body;
    }
    throw const ApiException(
      code: ApiException.networkErrorCode,
      message: 'Unexpected response shape from the server.',
    );
  }
}
