import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-01 — reels (Bunny Stream). The phone uploads the file
/// straight to Bunny over TUS (resumable, the server never sees the bytes),
/// the post goes live once Bunny has encoded it.
class ReelUpload {
  const ReelUpload({
    required this.videoAssetId,
    required this.tusEndpoint,
    required this.libraryId,
    required this.videoId,
    required this.signature,
    required this.expire,
    required this.maxDurationSec,
  });

  final String videoAssetId;
  final String tusEndpoint;
  final String libraryId;
  final String videoId;
  final String signature;
  final int expire;
  final int maxDurationSec;
}

class ReelsRepository {
  ReelsRepository({required Dio apiDio, required Dio storageDio})
      : _videos = api.VideosClient(apiDio),
        _tus = storageDio;

  final api.VideosClient _videos;
  final Dio _tus;

  /// TUS chunk: big enough to be fast, small enough to resume cheaply.
  static const _chunk = 5 * 1024 * 1024;

  /// R-251: parallel upload (flag `reels_tus_parallel`) splits a video into
  /// this many pieces that go at once, then asks Bunny to join them (TUS
  /// `concatenation`, the `parallelUploads` of tus-js-client, MIT).
  static const parallelParts = 4;

  /// Below this a video goes the plain way: splitting it gains nothing.
  static const parallelMinBytes = 8 * 1024 * 1024;

  Future<ReelUpload> createUpload({
    required int sizeBytes,
    required int durationSec,
    String? title,
    // Owner 2026-10-05: the part the reel plays and the cover frame.
    int? trimStartMs,
    int? trimEndMs,
    int? coverTimeMs,
    String? coverFileId,
  }) async {
    final d = (await guardApiCall(
      () => _videos.createVideoUpload(
        body: api.CreateVideoUploadDto(
          sizeBytes: sizeBytes,
          durationSec: durationSec,
          title: title,
          trimStartMs: trimStartMs,
          trimEndMs: trimEndMs,
          coverTimeMs: coverTimeMs,
          coverFileId: coverFileId,
        ),
      ),
    ))
        .data;
    return ReelUpload(
      videoAssetId: d.videoAssetId,
      tusEndpoint: d.tusEndpoint,
      libraryId: d.libraryId,
      videoId: d.videoId,
      signature: d.authorizationSignature,
      expire: d.authorizationExpire,
      maxDurationSec: d.maxDurationSec,
    );
  }

  /// Uploads [file] to Bunny (TUS 1.0.0). Resumes from the server's offset
  /// after a dropped connection; [onProgress] gets 0..1. An [XFile] so the
  /// browser build reads its picked blob the same way (no dart:io there).
  /// Owner 2026-10-22 (audit #4 §3): [resumeLocation] continues an upload
  /// started before the app was closed (the queue saved it from
  /// [onLocation]); a location Bunny no longer knows starts a new one.
  ///
  /// R-251: with [parallel] a video of at least [parallelMinBytes] goes in
  /// [parallelParts] pieces at once; [resumePartLocations] / [onPartLocations]
  /// are its saved addresses. If Bunny refuses that way (a 4xx), the video
  /// goes the plain way instead, so a refusal never costs the upload.
  Future<void> upload(
    XFile file,
    ReelUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
    String? resumeLocation,
    void Function(String location)? onLocation,
    bool parallel = false,
    List<String>? resumePartLocations,
    void Function(List<String> locations)? onPartLocations,
  }) async {
    final size = await file.length();
    final auth = {
      'AuthorizationSignature': u.signature,
      'AuthorizationExpire': '${u.expire}',
      'VideoId': u.videoId,
      'LibraryId': u.libraryId,
      'Tus-Resumable': '1.0.0',
    };
    // An upload begun the plain way continues the plain way.
    if (resumeLocation == null &&
        (resumePartLocations != null ||
            (parallel && size >= parallelMinBytes))) {
      try {
        await _uploadInParts(
          file,
          u,
          auth,
          size,
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
    final location = await _openUpload(
      u,
      auth,
      size,
      resume: resumeLocation,
      headers: {'Upload-Metadata': _metadata(u)},
      onOffset: (offset) => onProgress?.call(size == 0 ? 1 : offset / size),
      cancel: cancel,
    );
    if (location.isNew) onLocation?.call(location.url);
    await _send(
      file,
      location.url,
      auth,
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
  Future<void> _uploadInParts(
    XFile file,
    ReelUpload u,
    Map<String, String> auth,
    int size, {
    List<String>? resume,
    void Function(List<String> locations)? onLocations,
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) async {
    final count = resume?.length ?? parallelParts;
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
          u,
          auth,
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
          auth,
          from: start,
          offset: at.offset,
          size: end - start,
          onSent: (n) {
            sent[i] = n;
            report();
          },
          cancel: stop,
        );
      } on Object {
        if (!stop.isCancelled) stop.cancel('another piece failed');
        rethrow;
      }
    }

    await Future.wait([for (var i = 0; i < count; i++) piece(i)]);
    await _tus.post<void>(
      u.tusEndpoint,
      cancelToken: cancel,
      options: Options(
        headers: {
          ...auth,
          'Upload-Concat': 'final;${locations.cast<String>().join(' ')}',
          'Upload-Metadata': _metadata(u),
        },
      ),
    );
  }

  static String _metadata(ReelUpload u) {
    String b64(String v) => base64.encode(utf8.encode(v));
    return 'filetype ${b64('video/mp4')},title ${b64(u.videoId)}';
  }

  /// The address to send to: [resume] when Bunny still has it (404 / 410:
  /// a new one), else a new upload of [length] bytes.
  Future<({String url, int offset, bool isNew})> _openUpload(
    ReelUpload u,
    Map<String, String> auth,
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
          options: Options(headers: auth),
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
      u.tusEndpoint,
      cancelToken: cancel,
      options: Options(
        headers: {...auth, 'Upload-Length': '$length', ...headers},
      ),
    );
    var fresh = created.headers.value('location');
    if (fresh == null) {
      throw const ApiException(code: 'VIDEO_UPLOAD_FAILED', message: 'tus');
    }
    if (!fresh.startsWith('http')) {
      fresh = Uri.parse(u.tusEndpoint).resolve(fresh).toString();
    }
    return (url: fresh, offset: 0, isNew: true);
  }

  /// The PATCH chunks of one upload: bytes [from + offset, from + size) of
  /// [file]. Each chunk streams from disk, never held in memory, so several
  /// at once do not grow the phone's RAM.
  Future<void> _send(
    XFile file,
    String location,
    Map<String, String> auth, {
    required int from,
    required int offset,
    required int size,
    required void Function(int sent) onSent,
    CancelToken? cancel,
  }) async {
    var at = offset;
    var failures = 0;
    while (at < size) {
      final len = math.min(_chunk, size - at);
      try {
        final r = await _tus.patch<void>(
          location,
          data: file.openRead(from + at, from + at + len),
          cancelToken: cancel,
          options: Options(
            headers: {
              ...auth,
              'Upload-Offset': '$at',
              'Content-Type': 'application/offset+octet-stream',
              Headers.contentLengthHeader: '$len',
            },
          ),
        );
        at = int.tryParse(r.headers.value('upload-offset') ?? '') ?? at + len;
        failures = 0;
        onSent(at);
      } on DioException catch (e) {
        if (CancelToken.isCancel(e) || ++failures > 5) rethrow;
        await Future<void>.delayed(Duration(seconds: failures * 2));
        final head = await _tus.head<void>(
          location,
          cancelToken: cancel,
          options: Options(headers: auth),
        );
        at = int.tryParse(head.headers.value('upload-offset') ?? '') ?? at;
      }
    }
  }

  /// `processing` until Bunny finishes, then `ready` (or `failed`).
  Future<String> status(String videoAssetId) async {
    final d =
        (await guardApiCall(() => _videos.getVideoAsset(id: videoAssetId)))
            .data;
    return d.status.json ?? d.status.name;
  }

  Future<void> cancel(String videoAssetId) =>
      guardApiCall(() => _videos.cancelVideoUpload(id: videoAssetId));

  /// The full-screen reels feed, newest first.
  Future<CursorPage<Post>> reels({String? cursor, String? practice}) async {
    final env = await guardApiCall(
      () => _videos.listReels(cursor: cursor, practice: practice),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }
}
