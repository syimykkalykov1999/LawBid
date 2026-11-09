import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/support/application/support_providers.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-11-08: a support photo or file goes to storage through the
/// bare storage client, never through the API client (its interceptors
/// add the bearer token, which S3 refuses on a presigned POST and which
/// must never reach the storage host).
void main() {
  test('support uploads use the storage client, not the API client', () async {
    final api = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        return jsonBody(
          {
            'data': {
              'fileId': 'file-1',
              'upload': {
                'url': 'https://storage.test/bucket',
                'fields': {'key': 'k', 'policy': 'p'},
              },
              'expiresAt': '2026-11-08T10:05:00.000Z',
            },
          },
          201,
        );
      }
      return ok({
        'id': 'file-1',
        'purpose': 'support_attachment',
        'mime': 'image/png',
        'sizeBytes': 3,
        'width': null,
        'height': null,
        'scanStatus': 'clean',
        'url': null,
        'createdAt': '2026-11-08T10:00:00.000Z',
      });
    });
    final storage =
        FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
    final c = ProviderContainer(
      overrides: [
        dioProvider.overrideWithValue(
          Dio(BaseOptions(baseUrl: 'https://api.test'))
            ..httpClientAdapter = api,
        ),
        storageDioProvider.overrideWithValue(
          Dio()..httpClientAdapter = storage,
        ),
      ],
    );
    addTearDown(c.dispose);

    final id = await c
        .read(supportRepositoryProvider)
        .uploadFile(Uint8List.fromList([1, 2, 3]), 'image/png');

    expect(id, 'file-1');
    expect(storage.requests.single.uri.host, 'storage.test');
    expect(api.requests.map((r) => r.uri.host), everyElement('api.test'));
  });
}
