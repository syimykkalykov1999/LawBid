import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';
import 'package:lawbid/core/transfers/transfer_limits.dart';

/// Where one video goes on Bunny Stream.
class TusTarget {
  const TusTarget({
    required this.endpoint,
    required this.headers,
    required this.metadata,
  });

  final String endpoint;

  /// The signature headers of every request, `Tus-Resumable` included.
  final Map<String, String> headers;

  /// The `Upload-Metadata` value.
  final String metadata;
}

/// R-251 / R-253: the one TUS 1.0.0 client of the app; reels, stories and
/// channels had a copy each. Sends straight to Bunny, resumes from the
/// server's offset after a dropped connection, and every chunk streams from
/// disk (never held in memory).
///
/// With `parallel` a video of at least [parallelMinBytes] goes in several
/// pieces at once, which Bunny then joins (TUS `concatenation`, the
/// `parallelUploads` of tus-js-client, MIT). If Bunny refuses that way (a
/// 4xx) the video goes the plain way, so a refusal never costs the upload.
class TusUpload {
  TusUpload(this._tus, {AdaptiveLimiter? limiter, Duration? retryUnit})
    : _limiter = limiter ?? TransferLimits.uploads,
      _retryUnit = retryUnit ?? const Duration(seconds: 2);

  final Dio _tus;
  final AdaptiveLimiter _limiter;
  final Duration _retryUnit;

  /// TUS chunk: big enough to be fast, small enough to resume cheaply.
  static const chunkBytes = 5 * 1024 * 1024;

  /// Below this a video goes the plain way: splitting it gains nothing.
  static const parallelMinBytes = 8 * 1024 * 1024;

  /// [resumeLocation] continues an upload started before the app was closed
  /// (saved from [onLocation]); a location Bunny no longer knows starts a new
  /// one. [resumePartLocations] / [onPartLocations] are the same for pieces.
  Future<void> send(
    XFile file,
    TusTarget t, {
    void Function(double)? onProgress,
    CancelToken? cancel,
    String? resumeLocation,
    void Function(String location)? onLocation,
    bool parallel = false,
    List<String>? resumePartLocations,
    void Function(List<String> locations)? onPartLocations,
  }) async {
    final size = await file.length();
    // An upload begun the plain way continues the plain way.
    if (resumeLocation == null &&
        (resumePartLocations != null ||
            (parallel && size >= parallelMinBytes))) {
      await TransferLimits.checkDevice();
      _limiter.restoreIfIdle();
      final count = resumePartLocations?.length ?? ClientTuning.uploadsAtOnce;
      if (count > 1) {
        try {
          await _sendInParts(
            file,
            t,
            size,
            count,
            resume: resumePartLocations,
            onLocations: onPartLocations,
            onProgress: onProgress,
            cancel: cancel,
          );
          return;
        } on DioException catch (e) {
          final c = e.response?.statusCode;
          if (CancelToken.isCancel(e) || c == null || c < 400 || c >= 500) {
            rethrow;
          }
        }
      }
    }
    final location = await _openUpload(
      t,
      size,
      resume: resumeLocation,
      headers: {'Upload-Metadata': t.metadata},
      onOffset: (offset) => onProgress?.call(size == 0 ? 1 : offset / size),
      cancel: cancel,
    );
    if (location.isNew) onLocation?.call(location.url);
    await _send(
      file,
      location.url,
      t,
      from: 0,
      offset: location.offset,
      size: size,
      onSent: (sent) => onProgress?.call(sent / size),
      cancel: cancel,
    );
  }

  /// The pieces at once, then the joining request. The split is
  /// `splitSizeIntoParts` of tus-js-client: equal pieces, the last takes the
  /// remainder. A failed piece stops the others; the saved addresses let the
  /// next try send only what Bunny does not have.
  Future<void> _sendInParts(
    XFile file,
    TusTarget t,
    int size,
    int count, {
    List<String>? resume,
    void Function(List<String> locations)? onLocations,
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) async {
    final each = size ~/ count;
    final locations = List<String?>.filled(count, null);
    final sent = List<int>.filled(count, 0);
    void report() =>
        onProgress?.call(sent.fold<int>(0, (a, b) => a + b) / size);

    final stop = CancelToken();
    unawaited(
      cancel?.whenCancel.then((_) {
        if (!stop.isCancelled) stop.cancel('cancelled');
      }),
    );

    Future<void> piece(int i) async {
      final start = i * each;
      final end = i == count - 1 ? size : start + each;
      try {
        final at = await _openUpload(
          t,
          end - start,
          resume: resume?[i],
          headers: const {'Upload-Concat': 'partial'},
          onOffset: (offset) {
            sent[i] = offset;
            report();
          },
          cancel: stop,
        );
        locations[i] = at.url;
        if (locations.every((l) => l != null)) {
          onLocations?.call(locations.cast<String>());
        }
        await _send(
          file,
          at.url,
          t,
          from: start,
          offset: at.offset,
          size: end - start,
          onSent: (n) {
            sent[i] = n;
            report();
          },
          cancel: stop,
          limiter: _limiter,
        );
      } on Object {
        if (!stop.isCancelled) stop.cancel('another piece failed');
        rethrow;
      }
    }

    await Future.wait([for (var i = 0; i < count; i++) piece(i)]);
    await _tus.post<void>(
      t.endpoint,
      cancelToken: cancel,
      options: Options(
        headers: {
          ...t.headers,
          'Upload-Concat': 'final;${locations.cast<String>().join(' ')}',
          'Upload-Metadata': t.metadata,
        },
      ),
    );
  }

  /// The address to send to: [resume] when Bunny still has it (404 / 410:
  /// a new one), else a new upload of [length] bytes.
  Future<({String url, int offset, bool isNew})> _openUpload(
    TusTarget t,
    int length, {
    required Map<String, String> headers,
    String? resume,
    void Function(int offset)? onOffset,
    CancelToken? cancel,
  }) async {
    if (resume != null) {
      try {
        final head = await _tus.head<void>(
          resume,
          cancelToken: cancel,
          options: Options(headers: t.headers),
        );
        final offset =
            int.tryParse(head.headers.value('upload-offset') ?? '') ?? 0;
        onOffset?.call(offset);
        return (url: resume, offset: offset, isNew: false);
      } on DioException catch (e) {
        if (CancelToken.isCancel(e)) rethrow;
        final c = e.response?.statusCode;
        // Gone (404 / 410): start again; anything else: try later.
        if (c != 404 && c != 410) rethrow;
      }
    }
    final created = await _tus.post<void>(
      t.endpoint,
      cancelToken: cancel,
      options: Options(
        headers: {...t.headers, 'Upload-Length': '$length', ...headers},
      ),
    );
    var fresh = created.headers.value('location');
    if (fresh == null) {
      throw const ApiException(code: 'VIDEO_UPLOAD_FAILED', message: 'tus');
    }
    if (!fresh.startsWith('http')) {
      fresh = Uri.parse(t.endpoint).resolve(fresh).toString();
    }
    return (url: fresh, offset: 0, isNew: true);
  }

  /// The PATCH chunks of one upload: bytes [from + offset, from + size) of
  /// [file]. With a [limiter] (pieces at once) each chunk waits for a place,
  /// and a failed one lowers how many go at once.
  Future<void> _send(
    XFile file,
    String location,
    TusTarget t, {
    required int from,
    required int offset,
    required int size,
    required void Function(int sent) onSent,
    CancelToken? cancel,
    AdaptiveLimiter? limiter,
  }) async {
    var at = offset;
    var failures = 0;
    while (at < size) {
      final len = math.min(chunkBytes, size - at);
      Future<Response<void>> patch() => _tus.patch<void>(
        location,
        data: file.openRead(from + at, from + at + len),
        cancelToken: cancel,
        options: Options(
          headers: {
            ...t.headers,
            'Upload-Offset': '$at',
            'Content-Type': 'application/offset+octet-stream',
            Headers.contentLengthHeader: '$len',
          },
        ),
      );
      try {
        final r = await (limiter?.run(patch) ?? patch());
        at = int.tryParse(r.headers.value('upload-offset') ?? '') ?? at + len;
        failures = 0;
        onSent(at);
      } on DioException catch (e) {
        if (CancelToken.isCancel(e) || ++failures > 5) rethrow;
        final wait = ClientTuning.partRetryWait(
          e.response?.statusCode,
          e.response?.headers['retry-after'],
          _retryUnit * failures,
        );
        limiter?.rateLimit(wait);
        await Future<void>.delayed(wait);
        final head = await _tus.head<void>(
          location,
          cancelToken: cancel,
          options: Options(headers: t.headers),
        );
        at = int.tryParse(head.headers.value('upload-offset') ?? '') ?? at;
      }
    }
  }
}
