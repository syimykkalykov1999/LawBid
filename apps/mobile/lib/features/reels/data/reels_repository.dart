import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/transfers/tus_upload.dart';
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
  /// R-251: [parallel] and the saved addresses of the pieces: see [TusUpload].
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
    String b64(String v) => base64.encode(utf8.encode(v));
    await TusUpload(_tus).send(
      file,
      TusTarget(
        endpoint: u.tusEndpoint,
        headers: {
          'AuthorizationSignature': u.signature,
          'AuthorizationExpire': '${u.expire}',
          'VideoId': u.videoId,
          'LibraryId': u.libraryId,
          'Tus-Resumable': '1.0.0',
        },
        metadata: 'filetype ${b64('video/mp4')},title ${b64(u.videoId)}',
      ),
      onProgress: onProgress,
      cancel: cancel,
      resumeLocation: resumeLocation,
      onLocation: onLocation,
      parallel: parallel,
      resumePartLocations: resumePartLocations,
      onPartLocations: onPartLocations,
    );
  }

  /// `processing` until Bunny finishes, then `ready` (or `failed`).
  Future<String> status(String videoAssetId) async {
    final d = (await guardApiCall(
      () => _videos.getVideoAsset(id: videoAssetId),
    ))
        .data;
    return d.status.json ?? d.status.name;
  }

  Future<void> cancel(String videoAssetId) =>
      guardApiCall(() => _videos.cancelVideoUpload(id: videoAssetId));

  /// Shorter than the 3-minute fresh-reels mix of the screen, so ranking
  /// freshness is unchanged.
  static const firstPageWindow = Duration(minutes: 2);

  /// The full-screen reels feed, newest first.
  ///
  /// R-385: the first page is served from the phone for [firstPageWindow]
  /// (reopening Reels asks nothing); [fresh] (pull down, the fresh-reels
  /// mix) always asks the server, with If-None-Match.
  Future<CursorPage<Post>> reels({
    String? cursor,
    String? practice,
    bool fresh = false,
  }) async {
    final env = await guardApiCall(
      () => _videos.listReels(
        cursor: cursor,
        practice: practice,
        extras: cursor == null
            ? cacheFor(fresh ? Duration.zero : firstPageWindow)
            : null,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }
}
