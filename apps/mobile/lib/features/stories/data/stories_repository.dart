import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Bunny credentials of one story video (`POST /stories/video-uploads`).
class StoryUpload {
  const StoryUpload({
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

/// Owner 2026-10-20 — stories: tray, a person's stories, posting (photo,
/// text, video over TUS), views, viewers, privacy, archive.
class StoriesRepository {
  StoriesRepository({required Dio apiDio, required Dio storageDio})
      : _stories = api.StoriesClient(apiDio),
        _videos = api.VideosClient(apiDio),
        _follows = api.FollowsClient(apiDio),
        _reports = api.ReportsClient(apiDio),
        _tus = storageDio;

  final api.StoriesClient _stories;
  final api.VideosClient _videos;
  final api.FollowsClient _follows;
  final api.ReportsClient _reports;
  final Dio _tus;

  /// TUS chunk: big enough to be fast, small enough to resume cheaply.
  static const _chunk = 5 * 1024 * 1024;

  Future<List<StoryTrayItem>> tray() async =>
      (await guardApiCall(_stories.storyTray)).data.map(_trayItem).toList();

  Future<List<Story>> ofUser(String userId) async =>
      (await guardApiCall(() => _stories.storyOfUser(userId: userId)))
          .data
          .map(_story)
          .toList();

  Future<CursorPage<Story>> archive({String? cursor}) async {
    final env = await guardApiCall(
      () => _stories.storyArchive(cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(_story).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  Future<CursorPage<StoryViewer>> viewers(
    String storyId, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _stories.storyViewers(id: storyId, cursor: cursor),
    );
    return CursorPage(
      items: env.data
          .map(
            (v) => StoryViewer(user: _user(v.user), viewedAt: v.viewedAt),
          )
          .toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  /// Fire and forget on the viewer's side; the server ignores own views.
  Future<void> markViewed(String storyId) =>
      guardApiCall(() => _stories.storyView(id: storyId));

  Future<void> remove(String storyId) =>
      guardApiCall(() => _stories.storyRemove(id: storyId));

  Future<void> report(String storyId, String reason) => guardApiCall(
        () => _reports.createReport(
          body: api.CreateReportDto(
            targetType: api.ReportTargetType.story,
            targetId: storyId,
            reason: api.ReportReason.values.byName(reason),
          ),
        ),
      );

  // ── privacy ────────────────────────────────────────────────────────

  Future<StorySettings> settings() async =>
      _settings((await guardApiCall(_stories.storySettings)).data);

  Future<StorySettings> updateSettings({
    StoryAudience? audience,
    bool? allowReplies,
  }) async =>
      _settings(
        (await guardApiCall(
          () => _stories.storyUpdateSettings(
            body: api.UpdateStorySettingsDto(
              audience: audience == null
                  ? null
                  : api.StoryAudience.values.byName(audience.name),
              allowReplies: allowReplies,
            ),
          ),
        ))
            .data,
      );

  Future<List<StoryUser>> hidden() async =>
      (await guardApiCall(_stories.storyHidden)).data.map(_user).toList();

  Future<void> hide(String userId) =>
      guardApiCall(() => _stories.storyHide(userId: userId));

  Future<void> unhide(String userId) =>
      guardApiCall(() => _stories.storyUnhide(userId: userId));

  /// The people [myId] follows (attorneys and clients), for "hide from".
  Future<CursorPage<StoryUser>> following(
    String myId, {
    String? cursor,
    String? q,
  }) async {
    final query = q?.trim();
    final env = await guardApiCall(
      () => _follows.listFollowing(
        id: myId,
        cursor: cursor,
        q: query == null || query.isEmpty ? null : query,
      ),
    );
    return CursorPage(
      items: [
        for (final p in env.data)
          if (p.attorney != null)
            StoryUser(
              id: p.attorney!.id,
              username: p.attorney!.username,
              firstName: p.attorney!.firstName,
              lastName: p.attorney!.lastName,
              avatarUrl: p.attorney!.avatarUrl,
              verified: p.attorney!.verifiedBadge,
            )
          else if (p.client != null)
            StoryUser(
              id: p.client!.id,
              username: p.client!.username,
              firstName: p.client!.firstName,
              lastName: p.client!.lastName,
              avatarUrl: p.client!.avatarUrl,
              verified: p.client!.verifiedBadge,
            ),
      ],
      nextCursor: env.meta?.nextCursor,
    );
  }

  // ── posting ────────────────────────────────────────────────────────

  Future<Story> create({
    required StoryKind kind,
    required StoryAudience audience,
    String? fileId,
    String? videoAssetId,
    String? text,
    String? background,
    List<StoryOverlay> overlays = const [],
  }) async =>
      _story(
        (await guardApiCall(
          () => _stories.storyCreate(
            body: api.CreateStoryDto(
              kind: api.StoryKind.values.byName(kind.name),
              fileId: fileId,
              videoAssetId: videoAssetId,
              text: text == null || text.trim().isEmpty ? null : text.trim(),
              background: background == null
                  ? null
                  : api.CreateStoryDtoBackground.values.byName(background),
              overlays: [
                for (final o in overlays)
                  api.StoryOverlayDto(
                    emoji: o.emoji,
                    x: o.x.clamp(0, 1),
                    y: o.y.clamp(0, 1),
                    scale: o.scale.clamp(0.3, 4),
                    rotation: o.rotation.clamp(-7, 7),
                  ),
              ],
              audience: api.StoryAudience.values.byName(audience.name),
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<StoryUpload> createVideoUpload({
    required int sizeBytes,
    required int durationSec,
    int? trimStartMs,
    int? trimEndMs,
  }) async {
    final d = (await guardApiCall(
      () => _stories.storyCreateVideoUpload(
        body: api.CreateStoryVideoUploadDto(
          sizeBytes: sizeBytes,
          durationSec: durationSec,
          trimStartMs: trimStartMs,
          trimEndMs: trimEndMs,
        ),
      ),
    ))
        .data;
    return StoryUpload(
      videoAssetId: d.videoAssetId,
      tusEndpoint: d.tusEndpoint,
      libraryId: d.libraryId,
      videoId: d.videoId,
      signature: d.authorizationSignature,
      expire: d.authorizationExpire,
      maxDurationSec: d.maxDurationSec,
    );
  }

  /// Uploads [file] to Bunny (TUS 1.0.0), resuming from the server's offset
  /// after a dropped connection; [onProgress] gets 0..1. An [XFile], so the
  /// browser build reads its picked blob the same way.
  Future<void> upload(
    XFile file,
    StoryUpload u, {
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
      options: Options(
        headers: {
          ...auth,
          'Upload-Length': '$size',
          'Upload-Metadata':
              'filetype ${b64('video/mp4')},title ${b64(u.videoId)}',
        },
      ),
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
    while (offset < size) {
      final len = math.min(_chunk, size - offset);
      final bytes = <int>[];
      await file.openRead(offset, offset + len).forEach(bytes.addAll);
      try {
        final r = await _tus.patch<void>(
          location,
          data: Stream.fromIterable([bytes]),
          cancelToken: cancel,
          options: Options(
            headers: {
              ...auth,
              'Upload-Offset': '$offset',
              'Content-Type': 'application/offset+octet-stream',
              Headers.contentLengthHeader: '$len',
            },
          ),
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
        offset =
            int.tryParse(head.headers.value('upload-offset') ?? '') ?? offset;
      }
    }
  }

  /// `processing` until Bunny finishes, then `ready` (or `failed`).
  Future<String> videoStatus(String videoAssetId) async {
    final d =
        (await guardApiCall(() => _videos.getVideoAsset(id: videoAssetId)))
            .data;
    return d.status.json ?? d.status.name;
  }

  Future<void> cancelVideo(String videoAssetId) =>
      guardApiCall(() => _videos.cancelVideoUpload(id: videoAssetId));

  // ── mapping ────────────────────────────────────────────────────────

  static StoryUser _user(api.UserBriefDto d) => StoryUser(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        avatarUrl: d.avatarUrl,
        verified: d.verifiedBadge,
      );

  static StoryTrayItem _trayItem(api.StoryTrayItemDto d) => StoryTrayItem(
        user: _user(d.user),
        isMe: d.isMe,
        storyCount: d.storyCount,
        unseenCount: d.unseenCount,
        latestAt: d.latestAt,
      );

  static StorySettings _settings(api.StorySettingsDto d) => StorySettings(
        audience: _audience(d.audience),
        allowReplies: d.allowReplies,
        hiddenCount: d.hiddenCount,
      );

  static StoryAudience _audience(api.StoryAudience a) => switch (a) {
        api.StoryAudience.followers => StoryAudience.followers,
        api.StoryAudience.contacts => StoryAudience.contacts,
        _ => StoryAudience.all,
      };

  static StoryKind _kind(api.StoryKind k) => switch (k) {
        api.StoryKind.video => StoryKind.video,
        api.StoryKind.text => StoryKind.text,
        _ => StoryKind.photo,
      };

  static Story _story(api.StoryDto d) => Story(
        id: d.id,
        author: _user(d.author),
        kind: _kind(d.kind),
        mediaUrl: d.mediaUrl,
        previewUrl: d.previewUrl,
        video: d.video == null
            ? null
            : StoryVideo(
                ready: d.video!.status == api.VideoAssetStatus.ready &&
                    d.video!.playbackUrl != null,
                playbackUrl: d.video!.playbackUrl,
                fallbackUrl: d.video!.fallbackUrl,
                thumbnailUrl: d.video!.thumbnailUrl,
                durationSec: d.video!.durationSec,
                trimStartMs: d.video!.trimStartMs,
                trimEndMs: d.video!.trimEndMs,
              ),
        text: d.text,
        background: d.background,
        overlays: [
          for (final o in d.overlays)
            StoryOverlay(
              emoji: o.emoji,
              x: o.x.toDouble(),
              y: o.y.toDouble(),
              scale: o.scale.toDouble(),
              rotation: o.rotation.toDouble(),
            ),
        ],
        audience: _audience(d.audience),
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
        viewedByMe: d.viewedByMe,
        isMine: d.isMine,
        viewCount: d.viewCount,
        canReply: d.canReply,
      );
}
