import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/http_transport.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';
import 'package:lawbid/core/transfers/transfer_limits.dart';

/// Owner 2026-11-02 (slow-network audit): a document download that survives
/// a lost connection. The bytes go to `<target>.part`; the next try asks the
/// storage for the rest (`Range: bytes=N-`) instead of starting over, then
/// the file is renamed into place. Two taps on one file share one transfer.
///
/// R-251 (flag `downloads_parallel`): a file bigger than [headBytes] comes in
/// pieces at once, each with its own `Range` and part file, merged at the end:
/// `downloadWithChunks` of dio's examples (MIT). What dio's example lacks is
/// kept from above: each piece continues from its own length after a cut. No
/// HEAD request (a signed storage link is good for GET only): the first piece
/// is an ordinary GET, and its `Content-Range` tells the size. A small file is
/// that one request, and a server that ignores `Range` sends the whole file,
/// which is simply kept.
class ResumableDownload {
  ResumableDownload({
    Dio? dio,
    AdaptiveLimiter? limiter,
    int Function()? pieces,
    Duration retryUnit = const Duration(seconds: 1),
  })  : _dio = dio ?? _newDio(),
        _limiter = limiter ?? TransferLimits.downloads,
        _pieces = pieces ?? (() => ClientTuning.downloadPieces),
        _retryUnit = retryUnit;

  static ResumableDownload instance = ResumableDownload();

  static Dio _newDio() {
    final d = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 15),
        // Between two chunks, not for the whole file.
        receiveTimeout: const Duration(seconds: 30),
      ),
    );
    HttpTransport.apply(d); // the native stack, like the API client
    return d;
  }

  /// The first piece; a file up to this size is one request. Also the
  /// smallest piece: a thin slice costs a request and gains no speed.
  static const headBytes = 4 * 1024 * 1024;

  /// Tries of one piece before the download reports the lost connection.
  static const _attempts = 3;

  final Dio _dio;
  final AdaptiveLimiter _limiter;
  final int Function() _pieces;
  final Duration _retryUnit;
  final _running = <String, Future<File>>{};

  /// Downloads [url] to [target] (finished file) and returns it. [onProgress]
  /// gets 0..1 when the size is known. Throws a [DioException] when the
  /// connection is lost; the part file stays for the next call.
  Future<File> fetch(
    String url,
    File target, {
    void Function(double progress)? onProgress,
    CancelToken? cancel,
  }) {
    final key = target.path;
    final running = _running[key];
    if (running != null) return running;
    // A block body: `remove` returns the future itself, and a whenComplete
    // callback that returns a future is awaited (a deadlock on itself).
    final f = _start(url, target, onProgress, cancel).whenComplete(() {
      _running.remove(key);
    });
    _running[key] = f;
    return f;
  }

  Future<File> _start(
    String url,
    File target,
    void Function(double)? onProgress,
    CancelToken? cancel,
  ) async {
    // Begun as one stream: goes on as one stream.
    if (File('${target.path}.part').existsSync()) {
      return _fetch(url, target, onProgress, cancel);
    }
    await TransferLimits.checkDevice();
    final saved = _savedPieces(target);
    final wanted = saved ?? _pieces();
    if (wanted < 2) return _fetch(url, target, onProgress, cancel);
    _limiter.restoreIfIdle();
    return _inPieces(url, target, wanted, onProgress, cancel);
  }

  // ─── in pieces ────────────────────────────────────────────────────────

  File _head(File target) => File('${target.path}.part.head');
  File _piece(File target, int count, int i) =>
      File('${target.path}.part.$count.$i');

  /// The piece count of a download cut earlier: the bytes it holds are only
  /// good for the same cut.
  int? _savedPieces(File target) {
    if (!_head(target).existsSync()) return null;
    for (var n = 2; n <= 8; n++) {
      if (_piece(target, n, 0).existsSync()) return n;
    }
    return null;
  }

  /// Everything of a cut download, for a clean start.
  void _dropPieces(File target) {
    final dir = target.parent;
    if (!dir.existsSync()) return;
    final prefix = '${target.path}.part.';
    for (final e in dir.listSync(followLinks: false)) {
      if (e is File && e.path.startsWith(prefix)) e.deleteSync();
    }
  }

  Future<File> _inPieces(
    String url,
    File target,
    int wanted,
    void Function(double)? onProgress,
    CancelToken? cancel,
  ) async {
    final head = _head(target);
    var have = head.existsSync() ? head.lengthSync() : 0;
    if (have > headBytes) {
      // A merge was cut half-way: the pieces are no longer where they belong.
      _dropPieces(target);
      have = 0;
    }
    // Once the head is whole, one byte is enough to learn the size again.
    final first = have < headBytes ? have : headBytes - 1;
    final res = await _dio.get<ResponseBody>(
      url,
      options: _rangeOptions('bytes=$first-${headBytes - 1}'),
      cancelToken: cancel,
    );
    final status = res.statusCode;
    if (status == 200) {
      // No Range here: this reply is the whole file. Keep it.
      _dropPieces(target);
      return _consume(res, target, 0, false, onProgress);
    }
    final total =
        status == 206 ? totalOf(res.headers, resumed: false, have: 0) : null;
    final hasRange = res.headers.value(HttpHeaders.contentRangeHeader) != null;
    if (status != 206 || total == null || !hasRange) {
      await _discard(res);
      _dropPieces(target);
      if (status == 416 && have == 0) {
        throw DioException.badResponse(
          statusCode: 416,
          requestOptions: res.requestOptions,
          response: res,
        );
      }
      return _fetch(url, target, onProgress, cancel);
    }

    final count = _countFor(total, wanted);
    final cuts = _cuts(total, count);
    final sent = List<int>.filled(count + 1, 0);
    void report() {
      final got = sent.fold<int>(0, (a, b) => a + b);
      onProgress?.call((got / total).clamp(0, 1));
    }

    sent[0] = have;
    for (var i = 0; i < count; i++) {
      final f = _piece(target, wanted, i);
      if (f.existsSync()) sent[i + 1] = f.lengthSync();
    }
    report();

    if (have < headBytes) {
      try {
        await _append(
          res.data!.stream,
          head,
          have,
          onBytes: (n) {
            sent[0] = n;
            report();
          },
        );
      } on DioException {
        rethrow;
      } on FileSystemException {
        rethrow;
      } on Object {
        // The connection was cut mid-body: the bytes stay for the next try.
        throw _cut(res.requestOptions, head.lengthSync(), total);
      }
    } else {
      await _discard(res);
    }
    final headWant = total < headBytes ? total : headBytes;
    if (head.lengthSync() < headWant) {
      throw _cut(res.requestOptions, head.lengthSync(), headWant);
    }
    if (count > 0 && !_piece(target, wanted, 0).existsSync()) {
      // Marks the cut, so a later try with another admin number keeps it.
      _piece(target, wanted, 0).createSync();
    }

    final stop = CancelToken();
    unawaited(
      cancel?.whenCancel.then((_) {
        if (!stop.isCancelled) stop.cancel('cancelled');
      }),
    );
    try {
      await Future.wait([
        for (var i = 0; i < count; i++)
          _getPiece(
            url,
            _piece(target, wanted, i),
            cuts[i],
            cuts[i + 1],
            total,
            stop,
            (n) {
              sent[i + 1] = n;
              report();
            },
          ).catchError((Object e) {
            if (!stop.isCancelled) stop.cancel('another piece failed');
            // ignore: only_throw_errors
            throw e;
          }),
      ]);
    } on _NotThatFile {
      // The file changed under us, or Range went away: start clean, one way.
      _dropPieces(target);
      return _fetch(url, target, onProgress, cancel);
    }

    // The caller's cancel while the last piece was finishing still counts.
    if (cancel?.isCancelled ?? false) {
      throw DioException.requestCancelled(
        requestOptions: res.requestOptions,
        reason: 'cancelled',
      );
    }
    await _merge(head, [
      for (var i = 0; i < count; i++) _piece(target, wanted, i),
    ]);
    if (head.lengthSync() != total) {
      _dropPieces(target);
      throw _cut(res.requestOptions, 0, total);
    }
    if (target.existsSync()) target.deleteSync();
    return head.renameSync(target.path);
  }

  static int _countFor(int total, int wanted) {
    if (total <= headBytes) return 0;
    final fits = ((total - headBytes) / headBytes).ceil();
    return fits < wanted ? fits : wanted;
  }

  /// Offsets of the pieces after the head: [count] + 1 numbers.
  static List<int> _cuts(int total, int count) {
    if (count == 0) return const [];
    final each = (total - headBytes) ~/ count;
    return [for (var i = 0; i < count; i++) headBytes + i * each, total];
  }

  Options _rangeOptions(String range) => Options(
        responseType: ResponseType.stream,
        headers: {HttpHeaders.rangeHeader: range},
        // 416 = the part is already the whole file or the file changed.
        validateStatus: (s) => s != null && (s == 200 || s == 206 || s == 416),
      );

  /// One piece [start, end): continues from what its file holds, retried on a
  /// lost connection or a busy storage; a failure also lowers how many pieces
  /// go at once. A refusal (an expired link) is for the caller: the bytes stay.
  Future<void> _getPiece(
    String url,
    File file,
    int start,
    int end,
    int total,
    CancelToken stop,
    void Function(int got) onBytes,
  ) async {
    final size = end - start;
    for (var failures = 0;; failures++) {
      final have = file.existsSync() ? file.lengthSync() : 0;
      if (have >= size) return;
      try {
        await _limiter.run(() async {
          final res = await _dio.get<ResponseBody>(
            url,
            options: _rangeOptions('bytes=${start + have}-${end - 1}'),
            cancelToken: stop,
          );
          final answered = res.headers.value(HttpHeaders.contentRangeHeader);
          final theirs = int.tryParse(answered?.split('/').last ?? '');
          if (res.statusCode != 206 || theirs != total) {
            await _discard(res);
            throw const _NotThatFile();
          }
          await _append(res.data!.stream, file, have, onBytes: onBytes);
          if (file.lengthSync() < size) {
            throw _cut(res.requestOptions, file.lengthSync(), size);
          }
        });
        return;
      } on _NotThatFile {
        rethrow;
      } on FileSystemException {
        rethrow; // A full disk: repeating does not help.
      } on Object catch (e) {
        // A cut in the middle of a body arrives from the stream as the
        // transport's own error, not as a DioException.
        if (e is DioException) {
          if (CancelToken.isCancel(e)) rethrow;
          final c = e.response?.statusCode;
          final temporary = c == null || c == 408 || c == 429 || c >= 500;
          if (!temporary) rethrow;
        }
        if (failures + 1 >= _attempts) {
          throw e is DioException
              ? e
              : _cut(RequestOptions(path: url), start + have, end);
        }
        final wait = _retryUnit * (failures + 1);
        _limiter.rateLimit(wait);
        await Future<void>.delayed(wait);
      }
    }
  }

  /// Writes [bytes] after [have]; each write is awaited, so the stream is
  /// held back while the disk catches up and nothing piles up in memory.
  Future<void> _append(
    Stream<List<int>> bytes,
    File file,
    int have, {
    required void Function(int got) onBytes,
  }) async {
    final sink = await file.open(mode: FileMode.append);
    var got = have;
    try {
      await for (final chunk in bytes) {
        await sink.writeFrom(chunk);
        got += chunk.length;
        onBytes(got);
      }
    } finally {
      await sink.close();
    }
  }

  /// `mergeTempFiles` of dio's example: each piece joins the first and goes,
  /// so the disk never holds the file twice.
  Future<void> _merge(File head, List<File> pieces) async {
    if (pieces.isEmpty) return;
    final out = head.openWrite(mode: FileMode.writeOnlyAppend);
    try {
      for (final p in pieces) {
        await out.addStream(p.openRead());
        await out.flush();
        await p.delete();
      }
    } finally {
      await out.close();
    }
  }

  Future<void> _discard(Response<ResponseBody> res) async {
    try {
      await res.data?.stream.listen(null).cancel();
    } on Object {
      // Nothing to read any more.
    }
  }

  DioException _cut(RequestOptions options, int got, int want) => DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
        message: 'download cut at $got of $want bytes',
      );

  // ─── one stream ───────────────────────────────────────────────────────

  Future<File> _fetch(
    String url,
    File target,
    void Function(double)? onProgress,
    CancelToken? cancel, {
    bool retried = false,
  }) async {
    final part = File('${target.path}.part');
    final have = part.existsSync() ? part.lengthSync() : 0;
    final res = await _dio.get<ResponseBody>(
      url,
      options: Options(
        responseType: ResponseType.stream,
        headers: {if (have > 0) HttpHeaders.rangeHeader: 'bytes=$have-'},
        // 416 = the part is already the whole file or the file changed.
        validateStatus: (s) => s != null && (s == 200 || s == 206 || s == 416),
      ),
      cancelToken: cancel,
    );
    if (res.statusCode == 416) {
      // The server has fewer bytes than we hold: start again from zero
      // (once; a server that refuses a plain GET is an error).
      if (retried || have == 0) {
        throw DioException.badResponse(
          statusCode: 416,
          requestOptions: res.requestOptions,
          response: res,
        );
      }
      if (part.existsSync()) part.deleteSync();
      return _fetch(url, target, onProgress, cancel, retried: true);
    }
    final resumed = res.statusCode == 206 && have > 0;
    return _consume(res, target, resumed ? have : 0, resumed, onProgress);
  }

  /// Writes one reply to `<target>.part` and renames it into place.
  Future<File> _consume(
    Response<ResponseBody> res,
    File target,
    int have,
    bool resumed,
    void Function(double)? onProgress,
  ) async {
    final part = File('${target.path}.part');
    final total = totalOf(res.headers, resumed: resumed, have: have);
    final sink = part.openSync(
      mode: resumed ? FileMode.append : FileMode.write,
    );
    var got = have;
    try {
      await for (final chunk in res.data!.stream) {
        sink.writeFromSync(chunk);
        got += chunk.length;
        if (total != null && total > 0) onProgress?.call(got / total);
      }
    } finally {
      sink.closeSync();
    }
    if (total != null && got < total) {
      // The stream ended early (a dropped connection): keep the part.
      throw _cut(res.requestOptions, got, total);
    }
    if (target.existsSync()) target.deleteSync();
    return part.renameSync(target.path);
  }

  /// The full size of the file: from Content-Range (`bytes a-b/total`) or
  /// Content-Length (plus what we already had when the reply is a 206
  /// without Content-Range).
  @visibleForTesting
  static int? totalOf(Headers h, {required bool resumed, required int have}) {
    final range = h.value(HttpHeaders.contentRangeHeader);
    if (range != null) {
      final t = int.tryParse(range.split('/').last);
      if (t != null) return t;
    }
    final len = int.tryParse(h.value(HttpHeaders.contentLengthHeader) ?? '');
    if (len == null) return null;
    return resumed ? len + have : len;
  }
}

/// A piece's answer does not belong to the file being put together.
class _NotThatFile implements Exception {
  const _NotThatFile();
}
