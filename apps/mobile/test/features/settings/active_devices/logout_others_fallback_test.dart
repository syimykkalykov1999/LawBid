import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/settings/active_devices/data/active_devices_repository_impl.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../../helpers/stub_auth_repository.dart';

/// R2-A #9, expand/contract: the new app asks `POST /auth/logout-others`.
/// A server one release older answers 404 — then the other sessions end one
/// by one, and `logout-all` (which also signs THIS phone out) is never sent.
class _Auth extends StubAuthRepository {
  _Auth({this.status});

  /// The answer of logout-others: null = it worked.
  final int? status;
  int others = 0;
  int all = 0;
  final revoked = <String>[];

  @override
  Future<void> logoutOthers() async {
    others++;
    final code = status;
    if (code != null) {
      throw ApiException(code: 'X', message: 'no', statusCode: code);
    }
  }

  @override
  Future<void> logoutAll() async => all++;

  @override
  Future<void> revokeSession(String sessionId) async => revoked.add(sessionId);
}

DeviceSession _s(String id, {bool current = false}) => DeviceSession(
      sessionId: id,
      deviceId: 'd$id',
      deviceName: 'Device $id',
      platform: 'ios',
      appVersion: '1.0.0',
      lastUsedAt: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      isCurrent: current,
    );

class _Pages extends ActiveDevicesApiClient {
  _Pages() : super(Dio());

  @override
  Future<CursorPage<DeviceSession>> fetchPage({String? cursor}) async =>
      cursor == null
          ? CursorPage(
              items: [_s('1', current: true), _s('2')],
              nextCursor: 'p2',
            )
          : CursorPage(items: [_s('3')]);
}

void main() {
  test('a current server: one logout-others call, nothing else', () async {
    final auth = _Auth();
    await ActiveDevicesRepositoryImpl(_Pages(), auth).logoutOthers();
    expect(auth.others, 1);
    expect(auth.revoked, isEmpty);
    expect(auth.all, 0);
  });

  test('an older server (404): the others end one by one, never logout-all',
      () async {
    final auth = _Auth(status: 404);
    await ActiveDevicesRepositoryImpl(_Pages(), auth).logoutOthers();
    expect(auth.revoked, ['2', '3']);
    expect(auth.all, 0);
  });

  test('any other failure is shown, nothing is ended', () async {
    final auth = _Auth(status: 500);
    await expectLater(
      ActiveDevicesRepositoryImpl(_Pages(), auth).logoutOthers(),
      throwsA(isA<ApiException>()),
    );
    expect(auth.revoked, isEmpty);
    expect(auth.all, 0);
  });
}
