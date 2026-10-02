import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:dio/dio.dart';
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

  Future<ReelUpload> createUpload({
    required int sizeBytes,
    required int durationSec,
    String? title,
  }) async {
    final d = (await guardApiCall(
      () => _videos.createVideoUpload(
        body: api.CreateVideoUploadDto(
          sizeBytes: sizeBytes,
          durationSec: durationSec,
          title: title,
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
  /// after a dropped connection; [onProgress] gets 0..1.
  Future<void> upload(
    File file,
    ReelUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) async {
    final size = await file.length();
    final auth = {
      'AuthorizationSignature': u.signature,
      'AuthorizationExpire': '${u.expire}',
      'VideoId': u.videoId,
      'LibraryId': u.libraryId,
      'Tus-Resumable': '1.0.0',
    };
    String b64(String v) => base64.encode(utf8.encode(v));
    final created = await _tus.post<void>(
      u.tusEndpoint,
      cancelToken: cancel,
      options: Options(headers: {
        ...auth,
        'Upload-Length': '$size',
        'Upload-Metadata':
            'filetype ${b64('video/mp4')},title ${b64(u.videoId)}',
      }),
    );
    var location = created.headers.value('location');
    if (location == null) {
      throw const ApiException(code: 'VIDEO_UPLOAD_FAILED', message: 'tus');
    }
    if (!location.startsWith('http')) {
      location = Uri.parse(u.tusEndpoint).resolve(location).toString();
    }

    var offset = 0;
    var failures = 0;
    final raf = await file.open();
    try {
      while (offset < size) {
        final len = math.min(_chunk, size - offset);
        await raf.setPosition(offset);
        final bytes = await raf.read(len);
        try {
          final r = await _tus.patch<void>(
            location,
            data: Stream.fromIterable([bytes]),
            cancelToken: cancel,
            options: Options(headers: {
              ...auth,
              'Upload-Offset': '$offset',
              'Content-Type': 'application/offset+octet-stream',
              Headers.contentLengthHeader: '$len',
            }),
          );
          offset = int.tryParse(r.headers.value('upload-offset') ?? '') ??
              offset + len;
          failures = 0;
          onProgress?.call(offset / size);
        } on DioException catch (e) {
          if (CancelToken.isCancel(e) || ++failures > 5) rethrow;
          await Future<void>.delayed(Duration(seconds: failures * 2));
          final head = await _tus.head<void>(
            location,
            cancelToken: cancel,
            options: Options(headers: auth),
          );
          offset = int.tryParse(head.headers.value('upload-offset') ?? '') ??
              offset;
        }
      }
    } finally {
      await raf.close();
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
  Future<CursorPage<Post>> reels({String? cursor}) async {
    final env = await guardApiCall(() => _videos.listReels(cursor: cursor));
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }
}
