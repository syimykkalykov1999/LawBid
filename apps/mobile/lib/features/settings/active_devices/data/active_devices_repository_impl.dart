import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/auth_repository.dart';
import 'package:lawbid/features/settings/active_devices/data/device_session_mapper.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// `GET /auth/sessions` with cursor support (docs/01 §7 `meta.nextCursor`).
///
/// Today the endpoint returns the whole list and no `meta` (apps/api
/// AuthController.listSessions), so the first page comes back with
/// `nextCursor == null` and the list simply ends — nothing breaks. If the
/// API starts paginating, the `cursor` query parameter and `meta.nextCursor`
/// are already honoured here and in the UI.
class ActiveDevicesApiClient {
  ActiveDevicesApiClient(this._dio);

  final Dio _dio;

  Future<CursorPage<DeviceSession>> fetchPage({String? cursor}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/auth/sessions',
        queryParameters: cursor == null ? null : {'cursor': cursor},
      );
      final body = response.data;
      final data = body?['data'];
      if (data is! List) {
        throw const ApiException(
          code: ApiException.networkErrorCode,
          message: 'Unexpected response shape from the server.',
        );
      }
      final meta = body?['meta'];
      final next = meta is Map<String, dynamic> ? meta['nextCursor'] : null;
      return CursorPage(
        items: data
            .cast<Map<String, dynamic>>()
            // Sweep B-c9: the generated contract model, not a hand parser.
            .map((j) => DeviceSession.fromDto(api.SessionDto.fromJson(j)))
            .toList(growable: false),
        nextCursor: next is String && next.isNotEmpty ? next : null,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// STAGE2_SECURITY #12: `DELETE /auth/sessions/:id` with the single-use
  /// `X-Reauth-Token` the re-auth sheet returned.
  Future<void> endSessionWithReauth(String sessionId, String reauthToken) =>
      _send('DELETE', '/auth/sessions/$sessionId', reauthToken);

  /// STAGE2_SECURITY #12: `POST /auth/logout-others` with the token.
  Future<void> logoutOthersWithReauth(String reauthToken) =>
      _send('POST', '/auth/logout-others', reauthToken);

  Future<void> _send(String method, String path, String reauthToken) async {
    try {
      await _dio.request<Object?>(
        path,
        options: Options(
          method: method,
          headers: {'X-Reauth-Token': reauthToken},
        ),
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}

/// [ActiveDevicesRepository] over the live API. Listing goes through
/// [ActiveDevicesApiClient] (it needs the envelope's `meta`); revoke and
/// sign-out-everywhere reuse the existing [AuthRepository] calls so there
/// is one implementation of each auth endpoint.
class ActiveDevicesRepositoryImpl implements ActiveDevicesRepository {
  ActiveDevicesRepositoryImpl(this._api, this._auth);

  final ActiveDevicesApiClient _api;
  final AuthRepository _auth;

  @override
  Future<CursorPage<DeviceSessionInfo>> fetchPage({String? cursor}) async {
    final page = await _api.fetchPage(cursor: cursor);
    return CursorPage(
      items: page.items.map(DeviceSessionMapper.toDomain).toList(),
      nextCursor: page.nextCursor,
    );
  }

  @override
  Future<void> revoke(String sessionId, {String? reauthToken}) =>
      reauthToken == null
          ? _auth.revokeSession(sessionId)
          : _api.endSessionWithReauth(sessionId, reauthToken);

  /// R2-A #9: `POST /auth/logout-others`. A server one release older has
  /// no such route (404): then the other sessions are ended one by one
  /// (`DELETE /auth/sessions/:id`, which every server has) — never
  /// `logout-all`, which signs this phone out too.
  @override
  Future<void> logoutOthers({String? reauthToken}) async {
    if (reauthToken != null) {
      await _api.logoutOthersWithReauth(reauthToken);
      return;
    }
    try {
      await _auth.logoutOthers();
    } on ApiException catch (e) {
      if (e.statusCode != 404) rethrow;
      final others = <String>[];
      String? cursor;
      do {
        final page = await fetchPage(cursor: cursor);
        others.addAll(
          page.items.where((s) => !s.isCurrent).map((s) => s.sessionId),
        );
        cursor = page.nextCursor;
      } while (cursor != null);
      for (final id in others) {
        await revoke(id);
      }
    }
  }
}
