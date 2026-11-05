import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';

/// R-251: a real local HTTP server with `Range`, as S3 and CloudFront answer.
class _Storage {
  _Storage(this.bytes);

  final Uint8List bytes;
  late HttpServer server;
  final ranges = <String?>[];
  int now = 0;
  int most = 0;

  /// Answer to one request (null: the normal one).
  FutureOr<bool> Function(HttpRequest req, int n)? special;
  bool honourRange = true;
  Duration wait = Duration.zero;
  int? cutAfterBytes;

  String get url => 'http://127.0.0.1:${server.port}/doc?X-Amz-Signature=s';

  Future<void> start() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(server.forEach(_serve));
  }

  Future<void> _serve(HttpRequest req) async {
    final range = req.headers.value(HttpHeaders.rangeHeader);
    ranges.add(range);
    most = math.max(most, ++now);
    try {
      if (await special?.call(req, ranges.length) ?? false) return;
      if (wait > Duration.zero) await Future<void>.delayed(wait);
      final m = RegExp(r'bytes=(\d+)-(\d*)').firstMatch(range ?? '');
      if (m == null || !honourRange) {
        req.response.contentLength = bytes.length;
        req.response.add(bytes);
        await req.response.close();
        return;
      }
      final start = int.parse(m.group(1)!);
      final last = m.group(2)!.isEmpty
          ? bytes.length - 1
          : math.min(int.parse(m.group(2)!), bytes.length - 1);
      if (start >= bytes.length) {
        req.response.statusCode = 416;
        await req.response.close();
        return;
      }
      final body = Uint8List.sublistView(bytes, start, last + 1);
      req.response
        ..statusCode = 206
        ..headers.set(
          HttpHeaders.contentRangeHeader,
          'bytes $start-$last/${bytes.length}',
        )
        ..contentLength = body.length;
      final cut = cutAfterBytes;
      if (cut != null && body.length > cut) {
        cutAfterBytes = null;
        final socket = await req.response.detachSocket();
        socket.add(Uint8List.sublistView(body, 0, cut));
        await socket.flush();
        socket.destroy();
        return;
      }
      req.response.add(body);
      await req.response.close();
    } finally {
      now--;
    }
  }
}

Uint8List _bytes(int n) {
  final out = Uint8List(n);
  for (var i = 0; i < n; i++) {
    out[i] = (i * 31 + (i >> 8)) & 0xff;
  }
  return out;
}

void main() {
  const mib = 1024 * 1024;
  late Directory dir;
  late File target;
  late _Storage storage;

  ResumableDownload downloader({int pieces = 4, AdaptiveLimiter? limiter}) =>
      ResumableDownload(
        dio: Dio(),
        limiter: limiter ?? AdaptiveLimiter(() => pieces),
        pieces: () => pieces,
        retryUnit: Duration.zero,
      );

  setUp(() async {
    // flutter_test answers every real HTTP call with 400 otherwise.
    HttpOverrides.global = null;
    dir = Directory.systemTemp.createTempSync('pieces');
    target = File('${dir.path}/doc.pdf');
  });

  tearDown(() async {
    await storage.server.close(force: true);
    dir.deleteSync(recursive: true);
  });

  Future<void> serve(int size) async {
    storage = _Storage(_bytes(size));
    await storage.start();
  }

  void expectWhole() {
    expect(target.readAsBytesSync(), storage.bytes);
    expect(
      dir.listSync().map((e) => e.path),
      [target.path],
      reason: 'no part files left',
    );
  }

  test('a big file comes in pieces at once, byte for byte', () async {
    await serve(30 * mib);
    storage.wait = const Duration(milliseconds: 40);
    final progress = <double>[];
    await downloader().fetch(storage.url, target, onProgress: progress.add);
    expectWhole();
    expect(storage.ranges, hasLength(5), reason: 'head + 4 pieces');
    expect(storage.most, 4);
    expect(progress.last, 1);
    expect(progress.every((p) => p >= 0 && p <= 1), isTrue);
  });

  test('a small file is the one request it was', () async {
    await serve(mib);
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, hasLength(1));
  });

  test('a file of exactly the head size is one request', () async {
    await serve(ResumableDownload.headBytes);
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, hasLength(1));
  });

  test('a medium file takes only the pieces it needs', () async {
    await serve(ResumableDownload.headBytes + mib);
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, hasLength(2));
  });

  test('a server without Range: the first answer is kept, no second request',
      () async {
    await serve(10 * mib);
    storage.honourRange = false;
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, hasLength(1));
  });

  test('a cut piece goes on from where it stopped, in the same call', () async {
    await serve(20 * mib);
    storage.special = (req, n) {
      // After the head, cut the next answer half way.
      if (n == 2) storage.cutAfterBytes = mib;
      return false;
    };
    await downloader().fetch(storage.url, target);
    expectWhole();
    final resumed = storage.ranges.skip(1).where(
          (r) => !RegExp('bytes=(4194304|8388608|12582912|16777216)-')
              .hasMatch(r!),
        );
    expect(resumed, isNotEmpty, reason: 'one piece asked for the rest only');
  });

  test('a failure lowers how many go at once', () async {
    await serve(30 * mib);
    final limiter = AdaptiveLimiter(() => 4);
    var failed = 0;
    storage.special = (req, n) async {
      if (n > 1 && failed < 1) {
        failed++;
        req.response.statusCode = 503;
        await req.response.close();
        return true;
      }
      return false;
    };
    await downloader(limiter: limiter).fetch(storage.url, target);
    expectWhole();
    expect(failed, 1);
    expect(limiter.limit, lessThan(4));
  });

  test('an expired link: the bytes stay, the next link goes on', () async {
    await serve(20 * mib);
    storage.special = (req, n) async {
      if (n > 1) {
        req.response.statusCode = 403;
        await req.response.close();
        return true;
      }
      return false;
    };
    await expectLater(
      downloader().fetch(storage.url, target),
      throwsA(isA<DioException>()),
    );
    expect(
      File('${target.path}.part.head').lengthSync(),
      ResumableDownload.headBytes,
    );
    storage
      ..special = null
      ..ranges.clear();
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(
        storage.ranges.first,
        'bytes=${ResumableDownload.headBytes - 1}-'
        '${ResumableDownload.headBytes - 1}');
  });

  test('the cut of an earlier try is kept when the admin number changed',
      () async {
    await serve(30 * mib);
    storage.special = (req, n) async {
      if (n > 1) {
        req.response.statusCode = 403;
        await req.response.close();
        return true;
      }
      return false;
    };
    await expectLater(
      downloader().fetch(storage.url, target),
      throwsA(isA<DioException>()),
    );
    storage
      ..special = null
      ..ranges.clear();
    await downloader(pieces: 2).fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, hasLength(5), reason: 'still the 4 pieces + probe');
  });

  test('a download begun as one stream goes on as one stream', () async {
    await serve(10 * mib);
    File('${target.path}.part').writeAsBytesSync(
      Uint8List.sublistView(storage.bytes, 0, mib),
    );
    await downloader().fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, ['bytes=$mib-']);
  });

  test('the file changed under us: a clean start, not a mixed file', () async {
    await serve(20 * mib);
    storage.special = (req, n) async {
      if (n == 2) {
        req.response
          ..statusCode = 206
          ..headers.set(HttpHeaders.contentRangeHeader, 'bytes 0-0/999')
          ..contentLength = 1
          ..add([1]);
        await req.response.close();
        return true;
      }
      return false;
    };
    await downloader().fetch(storage.url, target);
    expectWhole();
  });

  test('two taps share one transfer', () async {
    await serve(10 * mib);
    final d = downloader();
    final a = d.fetch(storage.url, target);
    final b = d.fetch(storage.url, target);
    expect(identical(a, b), isTrue);
    await a;
    expectWhole();
  });

  test('flag off (1 piece): the old single request', () async {
    await serve(10 * mib);
    await downloader(pieces: 1).fetch(storage.url, target);
    expectWhole();
    expect(storage.ranges, [null]);
  });

  test('cancel stops the pieces and keeps the bytes', () async {
    await serve(30 * mib);
    storage.wait = const Duration(milliseconds: 30);
    final cancel = CancelToken();
    final f = downloader().fetch(
      storage.url,
      target,
      cancel: cancel,
      onProgress: (p) {
        if (p > 0.05 && !cancel.isCancelled) cancel.cancel('stop');
      },
    );
    await expectLater(f, throwsA(isA<DioException>()));
    expect(File('${target.path}.part.head').existsSync(), isTrue);
    expect(target.existsSync(), isFalse);
  });
}
