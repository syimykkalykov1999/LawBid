import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/resumable_download.dart';

/// A storage that serves [body] with Range support; [cutAfter] drops the
/// first reply's connection after that many bytes.
class _Storage implements HttpClientAdapter {
  _Storage(this.body, {this.cutAfter, this.ignoreRange = false});

  final List<int> body;
  int? cutAfter;
  final bool ignoreRange;
  final ranges = <String?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final range = options.headers[HttpHeaders.rangeHeader] as String?;
    ranges.add(range);
    var from = 0;
    if (range != null && !ignoreRange) {
      from = int.parse(range.substring(6, range.length - 1));
    }
    if (from >= body.length) return ResponseBody.fromString('', 416);
    var out = body.sublist(from);
    final partial = from > 0;
    final headers = <String, List<String>>{
      HttpHeaders.contentLengthHeader: ['${out.length}'],
      if (partial)
        HttpHeaders.contentRangeHeader: [
          'bytes $from-${body.length - 1}/${body.length}',
        ],
    };
    final cut = cutAfter;
    cutAfter = null;
    if (cut != null && cut < out.length) out = out.sublist(0, cut);
    return ResponseBody(
      Stream.value(Uint8List.fromList(out)),
      partial ? 206 : 200,
      headers: headers,
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late Directory dir;
  final data = utf8.encode('0123456789' * 100); // 1000 bytes

  setUp(() => dir = Directory.systemTemp.createTempSync('dl'));
  tearDown(() => dir.deleteSync(recursive: true));

  test('a cut transfer resumes with Range and the file is whole', () async {
    final storage = _Storage(data, cutAfter: 400);
    final dl = ResumableDownload(dio: Dio()..httpClientAdapter = storage);
    final target = File('${dir.path}/f.pdf');

    await expectLater(
      dl.fetch('https://x/f', target),
      throwsA(isA<DioException>()),
    );
    expect(File('${target.path}.part').lengthSync(), 400);
    expect(target.existsSync(), isFalse);

    final file = await dl.fetch('https://x/f', target);
    expect(storage.ranges, [null, 'bytes=400-']);
    expect(file.readAsBytesSync(), data);
    expect(File('${target.path}.part').existsSync(), isFalse);
  });

  test('a server that ignores Range sends 200: restart, no corruption',
      () async {
    final storage = _Storage(data, cutAfter: 300, ignoreRange: true);
    final dl = ResumableDownload(dio: Dio()..httpClientAdapter = storage);
    final target = File('${dir.path}/g.pdf');
    await expectLater(
      dl.fetch('https://x/g', target),
      throwsA(isA<DioException>()),
    );
    final file = await dl.fetch('https://x/g', target);
    expect(file.readAsBytesSync(), data);
  });

  test('two taps on one file share one transfer', () async {
    final storage = _Storage(data);
    final dl = ResumableDownload(dio: Dio()..httpClientAdapter = storage);
    final target = File('${dir.path}/h.pdf');
    final a = dl.fetch('https://x/h', target);
    final b = dl.fetch('https://x/h', target);
    expect(identical(a, b), isTrue);
    await Future.wait([a, b]);
    expect(storage.ranges, hasLength(1));
  });

  test('a part longer than the file (416) starts again from zero', () async {
    final storage = _Storage(data);
    final dl = ResumableDownload(dio: Dio()..httpClientAdapter = storage);
    final target = File('${dir.path}/i.pdf');
    File('${target.path}.part').writeAsBytesSync(List.filled(5000, 1));
    final file = await dl.fetch('https://x/i', target);
    expect(file.readAsBytesSync(), data);
    expect(storage.ranges, ['bytes=5000-', null]);
  });
}
