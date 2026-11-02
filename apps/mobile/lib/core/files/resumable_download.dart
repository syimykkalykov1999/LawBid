import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:lawbid/core/network/http_transport.dart';

/// Owner 2026-11-02 (slow-network audit): a document download that survives
/// a lost connection. The bytes go to `<target>.part`; the next try asks the
/// storage for the rest (`Range: bytes=N-`) instead of starting over, then
/// the file is renamed into place. Two taps on one file share one transfer.
class ResumableDownload {
  ResumableDownload({Dio? dio}) : _dio = dio ?? _newDio();

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

  final Dio _dio;
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
    final f = _fetch(url, target, onProgress, cancel).whenComplete(() {
      _running.remove(key);
    });
    _running[key] = f;
    return f;
  }

  Future<File> _fetch(
    String url,
    File target,
    void Function(double)? onProgress,
    CancelToken? cancel, {
    bool retried = false,
  }) async {
    final part = File('${target.path}.part');
    var have = part.existsSync() ? part.lengthSync() : 0;
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
    if (!resumed) have = 0; // 200: the whole body comes, overwrite
    final total = totalOf(res.headers, resumed: resumed, have: have);
    final sink =
        part.openSync(mode: resumed ? FileMode.append : FileMode.write);
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
      throw DioException(
        requestOptions: res.requestOptions,
        type: DioExceptionType.connectionError,
        message: 'download cut at $got of $total bytes',
      );
    }
    if (target.existsSync()) target.deleteSync();
    return part.renameSync(target.path);
  }

  /// The full size of the file: from Content-Range (`bytes a-b/total`) or
  /// Content-Length (plus what we already had when the reply is a 206
  /// without Content-Range).
  @visibleForTesting
  static int? totalOf(
    Headers h, {
    required bool resumed,
    required int have,
  }) {
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
