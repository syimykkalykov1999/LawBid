import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/data/social_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner row 100 (media audit 13.11, R2): a case video picked on a phone is
/// sent from its file on disk; the app never holds the whole video in
/// memory (only its first bytes, to tell the type).
void main() {
  test('a video path goes to storage from disk, its size checked by length',
      () async {
    final dir = Directory.systemTemp.createTempSync('case-video');
    addTearDown(() => dir.deleteSync(recursive: true));
    // An MP4 start (ftyp box) followed by 3 MB of zeros.
    final file = File('${dir.path}/clip.mp4')
      ..writeAsBytesSync([
        0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, //
        0, 0, 0, 0, 0x69, 0x73, 0x6F, 0x6D, 0x6D, 0x70, 0x34, 0x32,
        ...List<int>.filled(3 * 1024 * 1024, 0),
      ]);
    final presigned = <Map<String, Object?>>[];
    var stored = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = FakeHttpAdapter((o) async {
        if (o.path == '/files/presign') {
          presigned.add(Map<String, Object?>.from(o.data as Map));
          return jsonBody(
            {
              'data': {
                'fileId': 'f1',
                'upload': {
                  'url': 'https://storage.test/put',
                  'method': 'put',
                  'fields': <String, String>{},
                  'headers': {'Content-Type': 'video/mp4'},
                },
                'expiresAt': '2026-11-14T10:05:00.000Z',
              },
            },
            201,
          );
        }
        if (o.uri.host == 'storage.test') {
          stored = int.parse('${o.headers[Headers.contentLengthHeader]}');
          return ResponseBody.fromString('', 200);
        }
        return ok({
          'id': 'f1',
          'purpose': 'case_attachment',
          'mime': 'video/mp4',
          'sizeBytes': file.lengthSync(),
          'width': null,
          'height': null,
          'scanStatus': 'clean',
          'url': null,
          'createdAt': '2026-11-14T10:00:00.000Z',
        });
      });
    final db = SocialLocalDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final repo = ApiSocialRepository(
      apiDio: dio,
      storageDio: dio,
      local: db,
      ownerId: 'u1',
    );
    final id = await repo.uploadPostPhoto(
      Uint8List(0),
      casePhoto: true,
      fileName: 'video.mp4',
      maxBytes: 50 * 1024 * 1024,
      path: file.path,
    );
    expect(id, 'f1');
    expect(presigned.single['sizeBytes'], file.lengthSync());
    expect(presigned.single['mime'], 'video/mp4');
    // The whole file went (as the raw body or inside the S3 POST form).
    expect(stored, greaterThanOrEqualTo(file.lengthSync()));
  });
}
