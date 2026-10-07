import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/features/reels/data/reels_repository.dart';

/// Bunny's TUS endpoint: creates the upload, then takes PATCH chunks.
class _Tus implements HttpClientAdapter {
  final patches = <({int offset, List<int> bytes})>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.method == 'POST') {
      return ResponseBody.fromString(
        '',
        201,
        headers: {
          'location': ['/tusupload/abc'],
        },
      );
    }
    final body = <int>[];
    await requestStream?.forEach(body.addAll);
    final offset = int.parse('${options.headers['Upload-Offset']}');
    patches.add((offset: offset, bytes: body));
    return ResponseBody.fromString(
      '',
      204,
      headers: {
        'upload-offset': ['${offset + body.length}'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('a picked XFile goes to Bunny in 5 MB TUS chunks, bytes intact',
      () async {
    final tus = _Tus();
    final repo = ReelsRepository(
      apiDio: Dio(),
      storageDio: Dio()..httpClientAdapter = tus,
    );
    final data =
        Uint8List.fromList(List.generate(6 * 1024 * 1024 + 7, (i) => i % 251));
    final progress = <double>[];

    await repo.upload(
      XFile.fromData(data, name: 'reel.mp4', mimeType: 'video/mp4'),
      const ReelUpload(
        videoAssetId: 'va1',
        tusEndpoint: 'https://video.bunnycdn.com/tusupload',
        libraryId: '1',
        videoId: 'v1',
        signature: 'sig',
        expire: 1,
        maxDurationSec: 60,
      ),
      onProgress: progress.add,
    );

    expect(tus.patches.map((p) => p.offset), [0, 5 * 1024 * 1024]);
    expect(
      base64.encode([for (final p in tus.patches) ...p.bytes]),
      base64.encode(data),
    );
    expect(progress.last, 1);
  });
}
