import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:crypto/crypto.dart' show sha256;
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show PostVideo;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Bunny credentials for one channel video (`POST /channels/video-uploads`).
class ChannelVideoUpload {
  const ChannelVideoUpload({
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

/// Owner 2026-10-20 — channels: the list, one channel, its posts, reactions,
/// comments and admins. [apiDio] talks to the API, [storageDio] to the file
/// storage and the Bunny TUS endpoint. Throws [ApiException].
class ChannelsRepository {
  ChannelsRepository({required Dio apiDio, required Dio storageDio})
      : _channels = api.ChannelsClient(apiDio),
        _files = api.FilesClient(apiDio),
        _videos = api.VideosClient(apiDio),
        _reports = api.ReportsClient(apiDio),
        _storage = storageDio;

  final api.ChannelsClient _channels;
  final api.FilesClient _files;
  final api.VideosClient _videos;
  final api.ReportsClient _reports;
  final Dio _storage;

  static const _chunk = 5 * 1024 * 1024;
  static const _create = {RequestFlags.createsResource: true};

  // ── channels ───────────────────────────────────────────────────────────

  Future<List<Channel>> list(ChannelScope scope, {String? q}) async {
    final term = q?.trim();
    final env = await guardApiCall(
      () => _channels.channelList(
        scope: switch (scope) {
          ChannelScope.discover => api.Scope2.discover,
          ChannelScope.subscribed => api.Scope2.subscribed,
          ChannelScope.managed => api.Scope2.managed,
        },
        q: term == null || term.isEmpty ? null : term,
      ),
    );
    return env.data.map(channelOf).toList();
  }

  Future<Channel> get(String ref) async =>
      channelOf((await guardApiCall(() => _channels.channelGet(ref: ref))).data);

  Future<Channel> create(ChannelDraft d) async => channelOf(
        (await guardApiCall(
          () => _channels.channelCreate(
            body: api.CreateChannelDto(
              title: d.title.trim(),
              username: normalizeChannelUsername(d.username),
              description: d.description.trim().isEmpty
                  ? null
                  : d.description.trim(),
              avatarFileId: d.avatarFileId,
              commentsEnabled: d.commentsEnabled,
            ),
            extras: _create,
          ),
        ))
            .data,
      );

  /// [username] is sent only when the owner changed it.
  Future<Channel> update(
    String id,
    ChannelDraft d, {
    String? username,
  }) async =>
      channelOf(
        (await guardApiCall(
          () => _channels.channelUpdate(
            id: id,
            body: api.UpdateChannelDto(
              title: d.title.trim(),
              username: username == null ? null : normalizeChannelUsername(username),
              description: d.description.trim(),
              avatarFileId: d.avatarFileId,
              removeAvatar: d.removeAvatar ? true : null,
              commentsEnabled: d.commentsEnabled,
            ),
          ),
        ))
            .data,
      );

  Future<void> delete(String id) =>
      guardApiCall(() => _channels.channelRemove(id: id));

  // ── subscription ───────────────────────────────────────────────────────

  Future<Channel> subscribe(Channel c) async =>
      _sub(c, (await guardApiCall(() => _channels.channelSubscribe(id: c.id))).data);

  Future<Channel> unsubscribe(Channel c) async => _sub(
        c,
        (await guardApiCall(() => _channels.channelUnsubscribe(id: c.id))).data,
      );

  Future<Channel> mute(Channel c, {required bool muted}) async => _sub(
        c,
        (await guardApiCall(
          () => _channels.channelMute(
            id: c.id,
            body: api.UpdateChannelSubscriptionDto(muted: muted),
          ),
        ))
            .data,
      );

  Channel _sub(Channel c, api.ChannelSubscriptionDto s) => c.copyWith(
        isSubscribed: s.isSubscribed,
        isMuted: s.isMuted,
        subscriberCount: s.subscriberCount,
      );

  // ── admins ─────────────────────────────────────────────────────────────

  Future<List<ChannelAdmin>> admins(String id) async =>
      (await guardApiCall(() => _channels.channelAdmins(id: id)))
          .data
          .map(adminOf)
          .toList();

  Future<List<ChannelAdmin>> addAdmin(String id, String username) async =>
      (await guardApiCall(
        () => _channels.channelAddAdmin(
          id: id,
          body: api.AddChannelAdminDto(
            username: normalizeChannelUsername(username),
          ),
          extras: _create,
        ),
      ))
          .data
          .map(adminOf)
          .toList();

  Future<void> removeAdmin(String id, String userId) => guardApiCall(
        () => _channels.channelRemoveAdmin(id: id, userId: userId),
      );

  // ── posts ──────────────────────────────────────────────────────────────

  Future<ChannelPage<ChannelPost>> posts(String id, {String? cursor}) async {
    final env = await guardApiCall(
      () => _channels.channelPosts(id: id, cursor: cursor),
    );
    return ChannelPage(env.data.map(postOf).toList(), env.meta?.nextCursor);
  }

  Future<ChannelPost> post(String id, String postId) async => postOf(
        (await guardApiCall(() => _channels.channelPost(id: id, postId: postId)))
            .data,
      );

  Future<ChannelPost> createPost(
    String id, {
    required String body,
    List<String> mediaFileIds = const [],
    String? videoAssetId,
  }) async =>
      postOf(
        (await guardApiCall(
          () => _channels.channelCreatePost(
            id: id,
            body: api.CreateChannelPostDto(
              body: body.trim().isEmpty ? null : body.trim(),
              mediaFileIds: mediaFileIds.isEmpty ? null : mediaFileIds,
              videoAssetId: videoAssetId,
            ),
            extras: _create,
          ),
        ))
            .data,
      );

  Future<ChannelPost> editPost(String id, String postId, String body) async =>
      postOf(
        (await guardApiCall(
          () => _channels.channelEditPost(
            id: id,
            postId: postId,
            body: api.UpdateChannelPostDto(body: body.trim()),
          ),
        ))
            .data,
      );

  Future<void> removePost(String id, String postId) => guardApiCall(
        () => _channels.channelRemovePost(id: id, postId: postId),
      );

  /// Counts the posts as seen (the server counts once per reader).
  Future<void> markViewed(String id, List<String> postIds) => guardApiCall(
        () => _channels.channelMarkViewed(
          id: id,
          body: api.ChannelViewsDto(postIds: postIds),
        ),
      );

  Future<ChannelPost> react(String id, String postId, String emoji) async =>
      postOf(
        (await guardApiCall(
          () => _channels.channelReact(
            id: id,
            postId: postId,
            body: api.ChannelReactionDto(
              emoji: api.ChannelReactionDtoEmoji.fromJson(emoji),
            ),
          ),
        ))
            .data,
      );

  Future<ChannelPost> unreact(String id, String postId) async => postOf(
        (await guardApiCall(
          () => _channels.channelUnreact(id: id, postId: postId),
        ))
            .data,
      );

  // ── comments ───────────────────────────────────────────────────────────

  Future<ChannelPage<ChannelComment>> comments(
    String id,
    String postId, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _channels.channelComments(id: id, postId: postId, cursor: cursor),
    );
    return ChannelPage(env.data.map(commentOf).toList(), env.meta?.nextCursor);
  }

  Future<ChannelComment> addComment(
    String id,
    String postId,
    String body,
  ) async =>
      commentOf(
        (await guardApiCall(
          () => _channels.channelAddComment(
            id: id,
            postId: postId,
            body: api.CreateChannelCommentDto(body: body.trim()),
            extras: _create,
          ),
        ))
            .data,
      );

  Future<void> removeComment(String id, String postId, String commentId) =>
      guardApiCall(
        () => _channels.channelRemoveComment(
          id: id,
          postId: postId,
          commentId: commentId,
        ),
      );

  // ── report ─────────────────────────────────────────────────────────────

  /// `POST /reports` for a channel (or one of its posts); a repeat by the
  /// same reader is ignored by the server.
  Future<void> report({
    required String targetId,
    required String reason,
    bool post = false,
  }) =>
      guardApiCall(
        () => _reports.createReport(
          body: api.CreateReportDto(
            targetType: post
                ? api.ReportTargetType.channelPost
                : api.ReportTargetType.channel,
            targetId: targetId,
            reason: api.ReportReason.fromJson(reason),
          ),
        ),
      );

  // ── uploads ────────────────────────────────────────────────────────────

  /// Uploads [bytes] as the channel's picture (purpose `avatar`: presign →
  /// storage → confirm → wait for the scan) and returns the file id.
  Future<String> uploadAvatar(Uint8List bytes, String mime) async {
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.avatar,
          mime: mime,
          sizeBytes: bytes.length,
          sha256: sha256.convert(bytes).toString(),
        ),
        extras: _create,
      ),
    ))
        .data;
    final parts = mime.split('/');
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'file',
            contentType: DioMediaType(parts.first, parts.last),
          ),
        }),
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var status = (await guardApiCall(() => _files.confirm(id: target.fileId)))
        .data
        .scanStatus;
    for (var i = 0; status == api.ScanStatus.pending && i < 20; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      status = (await guardApiCall(() => _files.getFilesId(id: target.fileId)))
          .data
          .scanStatus;
    }
    if (status != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  Future<ChannelVideoUpload> createVideoUpload({
    required int sizeBytes,
    required int durationSec,
  }) async {
    final d = (await guardApiCall(
      () => _channels.channelCreateVideoUpload(
        body: api.CreateVideoUploadDto(
          sizeBytes: sizeBytes,
          durationSec: durationSec,
        ),
        extras: _create,
      ),
    ))
        .data;
    return ChannelVideoUpload(
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
  Future<void> uploadVideo(
    XFile file,
    ChannelVideoUpload u, {
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
    final created = await _storage.post<void>(
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
        final r = await _storage.patch<void>(
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
        final head = await _storage.head<void>(
          location,
          cancelToken: cancel,
          options: Options(headers: auth),
        );
        offset =
            int.tryParse(head.headers.value('upload-offset') ?? '') ?? offset;
      }
    }
  }

  /// `processing` until Bunny finishes, then `ready` (or `failed` /
  /// `rejected`).
  Future<String> videoStatus(String videoAssetId) async {
    final d =
        (await guardApiCall(() => _videos.getVideoAsset(id: videoAssetId)))
            .data;
    return d.status.json ?? d.status.name;
  }

  Future<void> cancelVideo(String videoAssetId) =>
      guardApiCall(() => _videos.cancelVideoUpload(id: videoAssetId));

  // ── mapping ────────────────────────────────────────────────────────────

  static ChannelPerson personOf(api.UserBriefDto u) {
    final name = [u.firstName, u.lastName]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join(' ');
    return ChannelPerson(
      id: u.id,
      username: u.username,
      name: name.isEmpty ? u.username : name,
      avatarUrl: u.avatarUrl,
      verified: u.verifiedBadge,
    );
  }

  static Channel channelOf(api.ChannelDto d) => Channel(
        id: d.id,
        title: d.title,
        username: d.username,
        description: d.description,
        avatarUrl: d.avatarUrl,
        commentsEnabled: d.commentsEnabled,
        state: switch (d.status) {
          api.ChannelStatus.hidden => ChannelState.hidden,
          api.ChannelStatus.banned => ChannelState.banned,
          _ => ChannelState.active,
        },
        subscriberCount: d.subscriberCount,
        postCount: d.postCount,
        owner: personOf(d.owner),
        isSubscribed: d.isSubscribed,
        isMuted: d.isMuted,
        myRole: switch (d.myRole) {
          api.ChannelRole.owner => ChannelRole.owner,
          api.ChannelRole.admin => ChannelRole.admin,
          _ => null,
        },
        lastPostAt: d.lastPostAt,
        createdAt: d.createdAt,
      );

  static ChannelPost postOf(api.ChannelPostDto d) => ChannelPost(
        id: d.id,
        channelId: d.channelId,
        author: personOf(d.author),
        body: d.body,
        media: [
          for (final m in d.media)
            ChannelMedia(
              fileId: m.fileId,
              url: m.url,
              previewUrl: m.previewUrl,
            ),
        ],
        video: d.video == null ? null : videoOf(d.video!),
        viewCount: d.viewCount,
        commentCount: d.commentCount,
        reactions: [
          for (final r in d.reactions) ChannelReactionCount(r.emoji, r.count),
        ],
        myReaction: d.myReaction,
        createdAt: d.createdAt,
        editedAt: d.editedAt,
      );

  static PostVideo videoOf(api.PostVideoDto v) => PostVideo(
        status: v.status.json ?? v.status.name,
        playbackUrl: v.playbackUrl,
        fallbackUrl: v.fallbackUrl,
        thumbnailUrl: v.thumbnailUrl,
        durationSec: v.durationSec,
        width: v.width,
        height: v.height,
        trimStartMs: v.trimStartMs,
        trimEndMs: v.trimEndMs,
      );

  static ChannelComment commentOf(api.ChannelCommentDto d) => ChannelComment(
        id: d.id,
        author: personOf(d.author),
        body: d.body,
        createdAt: d.createdAt,
        canDelete: d.canDelete,
      );

  static ChannelAdmin adminOf(api.ChannelAdminDto d) => ChannelAdmin(
        user: personOf(d.user),
        role: d.role == api.ChannelRole.owner
            ? ChannelRole.owner
            : ChannelRole.admin,
      );
}
