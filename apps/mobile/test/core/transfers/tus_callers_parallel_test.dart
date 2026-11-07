import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/features/channels/data/channels_repository.dart';
import 'package:lawbid/features/stories/data/stories_repository.dart';

/// Bunny: pieces joined by `Upload-Concat`; [refuseConcat] answers it with 4xx.
class _Bunny implements HttpClientAdapter {
  _Bunny({this.refuseConcat = false});

  final bool refuseConcat;
  final uploads = <String, Map<int, List<int>>>{};
  final lengths = <String, int>{};
  String? finalConcat;
  String? plainMetadata;
  int now = 0;
  int most = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final concat = options.headers['Upload-Concat'] as String?;
    if (options.method == 'POST') {
      if (concat != null && refuseConcat) {
        return ResponseBody.fromString('', 400);
      }
      if (concat != null && concat.startsWith('final;')) {
        finalConcat = concat;
        return ResponseBody.fromString('', 201);
      }
      if (concat == null) {
        plainMetadata = options.headers['Upload-Metadata'] as String?;
      }
      final loc = 'https://video.test/u${lengths.length}';
      lengths[loc] = int.parse('${options.headers['Upload-Length']}');
      uploads[loc] = {};
      return ResponseBody.fromString(
        '',
        201,
        headers: {
          'location': [loc],
        },
      );
    }
    most = math.max(most, ++now);
    final body = <int>[];
    await requestStream?.forEach(body.addAll);
    await Future<void>.delayed(const Duration(milliseconds: 2));
    now--;
    final offset = int.parse('${options.headers['Upload-Offset']}');
    uploads[options.uri.toString()]![offset] = body;
    return ResponseBody.fromString(
      '',
      204,
      headers: {
        'upload-offset': ['${offset + body.length}'],
      },
    );
  }

  /// What Bunny holds after joining, in the joined order.
  List<int> joined() {
    final order = finalConcat!.replaceFirst('final;', '').split(' ');
    return [
      for (final loc in order)
        for (final offset in uploads[loc]!.keys.toList()..sort())
          ...uploads[loc]![offset]!,
    ];
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUp(ClientTuning.reset);
  tearDown(ClientTuning.reset);

  final big = Uint8List.fromList(
    List.generate(9 * 1024 * 1024 + 11, (i) => (i * 13 + (i >> 8)) & 0xff),
  );
  final small = Uint8List.fromList(List.generate(1000, (i) => i % 251));
  XFile file(Uint8List d) =>
      XFile.fromData(d, name: 'v.mp4', mimeType: 'video/mp4');

  const story = StoryUpload(
    videoAssetId: 'a',
    tusEndpoint: 'https://video.test/tus',
    libraryId: 'l',
    videoId: 'v',
    signature: 's',
    expire: 1,
    maxDurationSec: 15,
  );
  const channel = ChannelVideoUpload(
    videoAssetId: 'a',
    tusEndpoint: 'https://video.test/tus',
    libraryId: 'l',
    videoId: 'v',
    signature: 's',
    expire: 1,
    maxDurationSec: 180,
  );

  final callers = <String,
      Future<void> Function(
    _Bunny bunny,
    XFile f,
    void Function(double) onProgress, {
    required bool parallel,
  })>{
    'stories': (bunny, f, onProgress, {required parallel}) => StoriesRepository(
          apiDio: Dio(),
          storageDio: Dio()..httpClientAdapter = bunny,
        ).upload(f, story, parallel: parallel, onProgress: onProgress),
    'channels': (bunny, f, onProgress, {required parallel}) =>
        ChannelsRepository(
          apiDio: Dio(),
          storageDio: Dio()..httpClientAdapter = bunny,
        ).uploadVideo(f, channel, parallel: parallel, onProgress: onProgress),
  };

  for (final MapEntry(key: name, value: send) in callers.entries) {
    group(name, () {
      test('parallel: four pieces at once, bytes intact, joined', () async {
        final bunny = _Bunny();
        final progress = <double>[];
        await send(bunny, file(big), progress.add, parallel: true);
        expect(bunny.finalConcat, isNotNull);
        expect(bunny.lengths, hasLength(4));
        expect(bunny.most, 4);
        expect(bunny.joined(), big);
        expect(progress.last, 1);
      });

      test('mobile data: two pieces', () async {
        ClientTuning.metered = true;
        final bunny = _Bunny();
        await send(bunny, file(big), (_) {}, parallel: true);
        expect(bunny.lengths, hasLength(2));
        expect(bunny.joined(), big);
      });

      test('flag off: one plain upload, as before', () async {
        final bunny = _Bunny();
        await send(bunny, file(big), (_) {}, parallel: false);
        expect(bunny.finalConcat, isNull);
        expect(bunny.lengths, hasLength(1));
        expect(bunny.most, 1);
        expect(bunny.plainMetadata, contains('filetype'));
      });

      test('a small video goes the plain way even with the flag', () async {
        final bunny = _Bunny();
        await send(bunny, file(small), (_) {}, parallel: true);
        expect(bunny.finalConcat, isNull);
        expect(bunny.lengths, hasLength(1));
      });

      test('Bunny refuses pieces: the plain way, nothing lost', () async {
        final bunny = _Bunny(refuseConcat: true);
        await send(bunny, file(big), (_) {}, parallel: true);
        expect(bunny.finalConcat, isNull);
        final only = bunny.uploads.values.single;
        expect(
          [for (final o in only.keys.toList()..sort()) ...only[o]!],
          big,
        );
      });
    });
  }
}
