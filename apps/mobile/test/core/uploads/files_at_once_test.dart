import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-11-08: ten post photos started together used to open ten
/// storage uploads at once; a screen's files now go at most
/// `client.uploads_at_once` at a time, app-wide.
void main() {
  test('screen uploads respect client.uploads_at_once', () async {
    var n = 0;
    final apiAdapter = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        n++;
        return jsonBody(
          {
            'data': {
              'fileId': 'file-$n',
              'upload': {
                'url': 'https://storage.test/bucket',
                'fields': {'key': 'k$n'},
              },
              'expiresAt': '2026-11-08T10:05:00.000Z',
            },
          },
          201,
        );
      }
      return ok({
        'id': 'file-1',
        'purpose': 'post_image',
        'mime': 'image/png',
        'sizeBytes': 3,
        'width': null,
        'height': null,
        'scanStatus': 'clean',
        'url': null,
        'createdAt': '2026-11-08T10:00:00.000Z',
      });
    });
    var inFlight = 0;
    var most = 0;
    final release = Completer<void>();
    final storage = FakeHttpAdapter((o) async {
      inFlight++;
      if (inFlight > most) most = inFlight;
      await release.future;
      inFlight--;
      return ResponseBody.fromString('', 204);
    });
    final uploader = StorageUploader.dio(
      Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = apiAdapter,
      Dio()..httpClientAdapter = storage,
    );

    final all = [
      for (var i = 0; i < 10; i++)
        uploader.upload(
          purpose: api.FilePurpose.postImage,
          body: UploadBody.bytes(Uint8List.fromList([i, 1, 2])),
          mime: 'image/png',
        ),
    ];
    for (var i = 0; i < 50; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    final cap = ClientTuning.uploadsAtOnce;
    expect(cap, lessThan(10));
    expect(most, cap);
    release.complete();
    await Future.wait(all);
    expect(storage.requests, hasLength(10));
  });
}
