import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-22 (CCPA, checklist §26): the «Do not sell or share»
/// switch reads `doNotSell` from `GET /users/me/privacy` and writes it with
/// `PATCH /users/me/privacy { doNotSell }`; an older server without the
/// field reads as "off".
void main() {
  const base = {
    'lastSeen': 'everyone',
    'messageFrom': 'contacts',
    'callFrom': 'nobody',
    'photoFrom': 'everyone',
    'aboutFrom': 'everyone',
    'groupAddFrom': 'everyone',
  };

  test('reads doNotSell (absent = false) and PATCHes it', () async {
    final adapter = FakeHttpAdapter((o) async {
      if (o.method == 'PATCH') {
        final body = jsonDecode(jsonEncode(o.data)) as Map<String, Object?>;
        return ok({...base, 'doNotSell': body['doNotSell']});
      }
      return ok(base);
    });
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
    final repo = ApiPrivacyRepository(dio);

    final first = await repo.settings();
    expect(first.doNotSell, isFalse);
    expect(first.callFrom, Audience.nobody);

    final after = await repo.setDoNotSell(value: true);
    expect(after.doNotSell, isTrue);
    expect(after.messageFrom, Audience.contacts);
    final patch = adapter.requests.last;
    expect(patch.method, 'PATCH');
    expect(patch.path, endsWith('/users/me/privacy'));
    expect(jsonDecode(jsonEncode(patch.data)), {'doNotSell': true});
  });

  test('a PATCH answer without a body: the settings are read back',
      () async {
    final adapter = FakeHttpAdapter((o) async {
      if (o.method == 'PATCH') return jsonBody(null, 204);
      return ok({...base, 'doNotSell': true});
    });
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
    final after = await ApiPrivacyRepository(dio).setDoNotSell(value: true);
    expect(after.doNotSell, isTrue);
  });
}
