import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/auth_repository.dart';
import 'package:lawbid/features/settings/active_devices/data/device_session_mapper.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

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
            .map(DeviceSession.fromJson)
            .toList(growable: false),
        nextCursor: next is String && next.isNotEmpty ? next : null,
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
  Future<void> revoke(String sessionId) => _auth.revokeSession(sessionId);

  @override
  Future<void> logoutAll() => _auth.logoutAll();
}
