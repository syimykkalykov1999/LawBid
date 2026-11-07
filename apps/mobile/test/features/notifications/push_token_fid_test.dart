import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// 2026-11-07 (firebase_messaging 17, FCM HTTP v1 `message.fid`): Android
/// and iPhone register their Firebase Installation ID with `kind: fid`; a
/// server from before the field refuses it with a 400, and the app then
/// registers the same address without it (FCM's `message.token` accepts an
/// FID during the transition) instead of staying without push.
void main() {
  Map<String, Object?> body(RequestOptions o) =>
      jsonDecode(jsonEncode(o.data)) as Map<String, Object?>;

  ApiNotificationsRepository repo(FakeHttpAdapter adapter) =>
      ApiNotificationsRepository(
        Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
          ..httpClientAdapter = adapter,
      );

  test('an FID is registered with kind fid', () async {
    final adapter = FakeHttpAdapter((o) async => jsonBody(null, 204));
    await repo(adapter)
        .registerPushToken('fid-0000000000000000000', ios: true, fid: true);
    final sent = adapter.requests.single;
    expect(sent.path, endsWith('/push-tokens'));
    expect(body(sent), {
      'token': 'fid-0000000000000000000',
      'kind': 'fid',
      'platform': 'ios',
      'localReminders': false,
      'chatStyle': false,
    });
  });

  test('a legacy token (browser) is sent without kind', () async {
    final adapter = FakeHttpAdapter((o) async => jsonBody(null, 204));
    await repo(adapter)
        .registerPushToken('legacy-token-0000000000', ios: false, web: true);
    expect(body(adapter.requests.single).containsKey('kind'), isFalse);
  });

  test('an older server without kind: registered again without it', () async {
    final adapter = FakeHttpAdapter((o) async {
      final b = body(o);
      return b.containsKey('kind') || b.containsKey('actorStyle')
          ? apiError(400, 'VALIDATION_ERROR')
          : jsonBody(null, 204);
    });
    await repo(adapter).registerPushToken(
      'fid-0000000000000000000',
      ios: false,
      chatStyle: true,
      actorStyle: true,
      fid: true,
    );
    expect(adapter.requests, hasLength(2));
    final retry = body(adapter.requests.last);
    expect(retry['token'], 'fid-0000000000000000000');
    expect(retry.containsKey('kind'), isFalse);
    expect(retry.containsKey('actorStyle'), isFalse);
  });
}
