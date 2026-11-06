import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

import '../../helpers/fake_http_adapter.dart';

Map<String, dynamic> _me() => {
      'id': 'u1',
      'role': 'attorney',
      'status': 'active',
      'firstName': 'Jane',
      'lastName': 'Doe',
      'email': 'a@b.co',
      'emailVerified': true,
      'phone': null,
      'phoneVerified': false,
      'uiLanguage': 'en',
      'theme': 'system',
      'requiredConsentsGranted': true,
      'pendingLegalDocuments': <Object>[],
      'passwordSet': true,
      'passwordRequired': false,
      'avatarFileId': 'f1',
      'avatarUrl': 'https://cdn.test/new',
      'onboarding': {'currentStep': null, 'completedAt': null, 'data': null},
      'missing': <String>[],
      'profile': {
        'username': 'jane.doe',
        'languages': <String>['en'],
        'firms': <String>[],
      },
    };

ResponseBody _json(Map<String, dynamic> data, String etag) =>
    ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        'content-type': ['application/json'],
        'etag': [etag],
      },
    );

/// Owner 2026-11-04: the 10 minutes `GET /attorneys/:username` may be served
/// from the device used to outlive a new photo, so the profile went on
/// showing the old answer even after it was read again.
void main() {
  test('attaching a photo ends the cached window of my public profile',
      () async {
    final adapter = FakeHttpAdapter(
      (o) async => o.method == 'PATCH'
          ? _json(_me(), 'W/"me"')
          : _json({'avatarUrl': o.headers['If-None-Match'] ?? 'old'}, 'W/"p"'),
    );
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(HttpCacheInterceptor());
    final repo = ApiAvatarUploadRepository(
      apiDio: dio,
      storageDio: Dio(),
      users: UsersApiClient(dio),
    );
    final tenMinutes = cachedFor(const Duration(minutes: 10));
    await dio.get<dynamic>('/attorneys/jane.doe', options: tenMinutes);
    await dio.get<dynamic>('/attorneys/jane.doe', options: tenMinutes);
    expect(adapter.requests.length, 1, reason: 'served from the device');

    final me = await repo.attach('f1');
    expect(me.attorneyProfile?.username, 'jane.doe');

    await dio.get<dynamic>('/attorneys/jane.doe', options: tenMinutes);
    expect(adapter.requests.length, 3, reason: 'PATCH, then the read');
    expect(adapter.requests.last.headers['If-None-Match'], 'W/"p"');
  });
}
