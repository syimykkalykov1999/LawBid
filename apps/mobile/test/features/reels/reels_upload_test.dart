import 'dart:convert';
import 'dart:math' as math;
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

  group('in parallel pieces (R-251)', () {
    const upload = ReelUpload(
      videoAssetId: 'va1',
      tusEndpoint: 'https://video.bunnycdn.com/tusupload',
      libraryId: '1',
      videoId: 'v1',
      signature: 'sig',
      expire: 1,
      maxDurationSec: 60,
    );
    final data =
        Uint8List.fromList(List.generate(21 * 1024 * 1024, (i) => i % 251));
    XFile video() =>
        XFile.fromData(data, name: 'reel.mp4', mimeType: 'video/mp4');
    ReelsRepository repoOn(_Bunny b) => ReelsRepository(
          apiDio: Dio(),
          storageDio: Dio()..httpClientAdapter = b,
        );

    test('four pieces at once, bytes intact, then joined in order', () async {
      final bunny = _Bunny();
      final saved = <List<String>>[];
      final progress = <double>[];
      await repoOn(bunny).upload(
        video(),
        upload,
        parallel: true,
        onPartLocations: saved.add,
        onProgress: progress.add,
      );
      expect(bunny.mostAtOnce, ReelsRepository.parallelParts);
      final joined = bunny.finalConcat!.replaceFirst('final;', '').split(' ');
      expect(joined, hasLength(4));
      expect(saved.single, joined);
      expect(
        base64.encode([for (final u in joined) ...bunny.received[u]!]),
        base64.encode(data),
      );
      expect(progress.last, 1);
      expect(bunny.finalMetadata, isNotNull);
    });

    test('a resume sends only what Bunny lacks', () async {
      final bunny = _Bunny();
      final first = <String>[];
      await repoOn(bunny).upload(
        video(),
        upload,
        parallel: true,
        onPartLocations: first.addAll,
      );
      final sentFirst = bunny.patchCount;
      await repoOn(bunny).upload(
        video(),
        upload,
        parallel: true,
        resumePartLocations: first,
      );
      expect(bunny.patchCount, sentFirst);
      expect(bunny.finalCount, 2);
    });

    test('a refusal of the joining falls back to the plain upload', () async {
      final bunny = _Bunny()..refuseConcat = true;
      await repoOn(bunny).upload(video(), upload, parallel: true);
      expect(bunny.plainCreated, 1);
      expect(
        base64.encode(bunny.received[bunny.plainLocation]!),
        base64.encode(data),
      );
    });

    test('flag off or a small video: the plain single-stream way', () async {
      final bunny = _Bunny();
      await repoOn(bunny).upload(video(), upload);
      expect(bunny.partials, 0);
      final small = _Bunny();
      await repoOn(small).upload(
        XFile.fromData(Uint8List(1024), name: 'r.mp4'),
        upload,
        parallel: true,
      );
      expect(small.partials, 0);
      expect(small.plainCreated, 1);
    });
  });
}

ResponseBody _created(String location) => ResponseBody.fromString(
      '',
      201,
      headers: {
        'location': [location],
      },
    );

/// A TUS server that keeps the bytes of each upload and knows `concatenation`.
class _Bunny implements HttpClientAdapter {
  final received = <String, List<int>>{};
  final _length = <String, int>{};
  bool refuseConcat = false;
  int mostAtOnce = 0;
  int _now = 0;
  int patchCount = 0;
  int partials = 0;
  int plainCreated = 0;
  int finalCount = 0;
  String? plainLocation;
  String? finalConcat;
  String? finalMetadata;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final h = options.headers;
    if (options.method == 'POST') {
      final concat = h['Upload-Concat'] as String?;
      if (concat != null && concat.startsWith('final;')) {
        if (refuseConcat) return ResponseBody.fromString('', 400);
        finalCount++;
        finalConcat = concat;
        finalMetadata = h['Upload-Metadata'] as String?;
        return _created('/f');
      }
      final url = 'https://video.bunnycdn.com/u${_length.length}';
      _length[url] = int.parse('${h['Upload-Length']}');
      received[url] = [];
      if (concat == 'partial') {
        partials++;
      } else {
        plainCreated++;
        plainLocation = url;
      }
      return _created(url);
    }
    if (options.method == 'HEAD') {
      return ResponseBody.fromString(
        '',
        200,
        headers: {
          'upload-offset': ['${received[options.uri.toString()]!.length}'],
        },
      );
    }
    mostAtOnce = math.max(mostAtOnce, ++_now);
    patchCount++;
    final body = <int>[];
    await requestStream?.forEach(body.addAll);
    await Future<void>.delayed(const Duration(milliseconds: 2));
    _now--;
    final got = received[options.uri.toString()]!..addAll(body);
    return ResponseBody.fromString(
      '',
      204,
      headers: {
        'upload-offset': ['${got.length}'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
