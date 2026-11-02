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
    expect(first.callFrom, {Audience.nobody});
    expect(first.followAudiences, isFalse);

    final after = await repo.setDoNotSell(value: true);
    expect(after.doNotSell, isTrue);
    expect(after.messageFrom, {Audience.contacts});
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

  test('owner 2026-10-28: reads the sets and sends a set', () async {
    final adapter = FakeHttpAdapter((o) async {
      final sets = {
        ...base,
        'lastSeenAudiences': ['everyone'],
        'messageFromAudiences': ['contacts', 'following'],
        'callFromAudiences': ['nobody'],
        'photoFromAudiences': ['everyone'],
        'aboutFromAudiences': ['everyone', 'from-the-future'],
        'groupAddFromAudiences': ['everyone'],
      };
      if (o.method == 'PATCH') {
        return ok({
          ...sets,
          'callFrom': 'contacts',
          'callFromAudiences': ['followers'],
        });
      }
      return ok(sets);
    });
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
    final repo = ApiPrivacyRepository(dio);
    final first = await repo.settings();
    expect(first.followAudiences, isTrue);
    expect(first.messageFrom, {Audience.contacts, Audience.following});
    expect(first.aboutFrom, {Audience.everyone});
    final after = await repo.change(
      PrivacyField.callFrom,
      Audience.followers,
      followAudiences: true,
    );
    expect(after.callFrom, {Audience.followers});
    final patch = adapter.requests.last;
    expect(patch.method, 'PATCH');
    expect(jsonDecode(jsonEncode(patch.data)), {
      'callFromAudiences': ['followers'],
    });
  });

  test('a server one version older gets the old single value', () async {
    final adapter = FakeHttpAdapter((o) async => ok(base));
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
    await ApiPrivacyRepository(dio)
        .change(PrivacyField.lastSeen, Audience.nobody, followAudiences: false);
    expect(jsonDecode(jsonEncode(adapter.requests.last.data)), {
      'lastSeen': 'nobody',
    });
  });
}
