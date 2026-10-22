import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/channels/application/channel_compose.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/data/channels_repository.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/groups/domain/ongoing_call.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show PostVideo;
import 'package:lawbid/shared/domain/cursor_page.dart';

const offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

const owner = ChannelPerson(
  id: 'u-owner',
  username: 'saul',
  name: 'Saul Goodman',
  verified: true,
);

Channel fakeChannel({
  String id = 'ch-1',
  String title = 'Tax news',
  String username = 'tax_news',
  bool subscribed = false,
  bool muted = false,
  bool comments = true,
  ChannelRole? role,
  int subscribers = 120,
  int posts = 3,
  String? description = 'Weekly tax notes, see https://example.test/tax.',
  ChannelState state = ChannelState.active,
  String? avatarUrl,
  OngoingCallSummary? ongoingCall,
}) =>
    Channel(
      id: id,
      title: title,
      username: username,
      description: description,
      avatarUrl: avatarUrl,
      avatarFullUrl: avatarUrl == null ? null : '$avatarUrl?full',
      commentsEnabled: comments,
      state: state,
      subscriberCount: subscribers,
      postCount: posts,
      owner: owner,
      isSubscribed: subscribed,
      isMuted: muted,
      myRole: role,
      createdAt: DateTime(2026, 10),
      ongoingCall: ongoingCall,
    );

ChannelPost fakePost(
  String id, {
  String channelId = 'ch-1',
  String body = 'New IRS rules',
  int comments = 0,
  int views = 10,
  String? mine,
  List<ChannelReactionCount> reactions = const [],
  PostVideo? video,
  List<ChannelMedia> media = const [],
}) =>
    ChannelPost(
      id: id,
      channelId: channelId,
      author: owner,
      body: body,
      media: media,
      video: video,
      viewCount: views,
      commentCount: comments,
      reactions: reactions,
      myReaction: mine,
      createdAt: DateTime(2026, 10, 19, 10),
    );

ChannelComment fakeComment(String id, {bool canDelete = false}) =>
    ChannelComment(
      id: id,
      author: owner,
      body: 'Thanks $id',
      createdAt: DateTime(2026, 10, 19, 11),
      canDelete: canDelete,
    );

/// In-memory [ChannelsRepository]: records every call.
class FakeChannelsRepository implements ChannelsRepository {
  FakeChannelsRepository({
    Channel? channel,
    List<ChannelPost>? feed,
    List<ChannelComment>? commentList,
  })  : channel = channel ?? fakeChannel(),
        feed = feed ?? [fakePost('p1'), fakePost('p2')],
        commentList = commentList ?? [];

  Channel channel;
  List<ChannelPost> feed;
  List<ChannelComment> commentList;
  List<ChannelAdmin> admins0 = [
    const ChannelAdmin(user: owner, role: ChannelRole.owner),
  ];
  List<Channel> listed = [];

  /// A page cursor: the posts after the first [pageSize] are on page two.
  int pageSize = 50;

  final calls = <String>[];
  ApiException? failWith;
  ApiException? failOnce;
  String videoStatusNow = 'ready';
  int videoPolls = 0;

  Future<T> _run<T>(String call, T Function() body) async {
    calls.add(call);
    if (failOnce != null) {
      final e = failOnce!;
      failOnce = null;
      throw e;
    }
    if (failWith != null) throw failWith!;
    return body();
  }

  @override
  Future<CursorPage<Channel>> recommended({String? cursor}) => _run(
        'recommended:${cursor ?? ''}',
        () => CursorPage(items: listed),
      );

  @override
  Future<List<Channel>> list(ChannelScope scope, {String? q}) =>
      _run('list:${scope.name}:${q ?? ''}', () => listed);

  @override
  Future<Channel> get(String ref) => _run('get:$ref', () => channel);

  @override
  Future<Channel> create(ChannelDraft d) => _run('create:${d.username}', () {
        return fakeChannel(
          title: d.title,
          username: normalizeChannelUsername(d.username),
          role: ChannelRole.owner,
        );
      });

  @override
  Future<Channel> update(String id, ChannelDraft d, {String? username}) =>
      _run('update:$id:${username ?? ''}', () => channel);

  @override
  Future<void> delete(String id) => _run('delete:$id', () {});

  @override
  Future<Channel> subscribe(Channel c) => _run('subscribe', () {
        return channel = c.copyWith(
          isSubscribed: true,
          subscriberCount: c.subscriberCount + 1,
        );
      });

  @override
  Future<Channel> unsubscribe(Channel c) => _run('unsubscribe', () {
        return channel = c.copyWith(
          isSubscribed: false,
          subscriberCount: c.subscriberCount - 1,
        );
      });

  @override
  Future<Channel> mute(Channel c, {required bool muted}) =>
      _run('mute:$muted', () {
        return channel = c.copyWith(isMuted: muted);
      });

  @override
  Future<List<ChannelAdmin>> admins(String id) => _run('admins', () => admins0);

  @override
  Future<List<ChannelAdmin>> addAdmin(String id, String username) =>
      _run('addAdmin:$username', () {
        return admins0 = [
          ...admins0,
          ChannelAdmin(
            user: ChannelPerson(
              id: 'u-$username',
              username: username,
              name: username,
            ),
            role: ChannelRole.admin,
          ),
        ];
      });

  @override
  Future<void> removeAdmin(String id, String userId) =>
      _run('removeAdmin:$userId', () {});

  @override
  Future<ChannelPage<ChannelPost>> posts(String id, {String? cursor}) =>
      _run('posts:${cursor ?? ''}', () {
        final from = cursor == null ? 0 : int.parse(cursor);
        final to = from + pageSize;
        return ChannelPage(
          feed.sublist(from, to.clamp(0, feed.length)),
          to < feed.length ? '$to' : null,
        );
      });

  @override
  Future<ChannelPost> post(String id, String postId) =>
      _run('post:$postId', () => feed.firstWhere((p) => p.id == postId));

  @override
  Future<ChannelPost> createPost(
    String id, {
    required String body,
    List<String> mediaFileIds = const [],
    String? videoAssetId,
  }) =>
      _run('createPost:$body:${mediaFileIds.join(',')}:${videoAssetId ?? ''}',
          () {
        final p = fakePost('new', body: body);
        feed = [p, ...feed];
        return p;
      });

  @override
  Future<ChannelPost> editPost(String id, String postId, String body) =>
      _run('editPost:$postId:$body', () {
        final p = fakePost(postId, body: body);
        feed = [
          for (final x in feed)
            if (x.id == postId) p else x,
        ];
        return p;
      });

  @override
  Future<void> removePost(String id, String postId) =>
      _run('removePost:$postId', () {});

  final viewed = <List<String>>[];

  final shares = <String>[];

  @override
  Future<void> sharePost(String id, String postId) =>
      _run('sharePost', () => shares.add(postId));

  @override
  Future<void> markViewed(String id, List<String> postIds) =>
      _run('markViewed', () => viewed.add(postIds));

  @override
  Future<ChannelPost> react(String id, String postId, String emoji) =>
      _run('react:$postId:$emoji', () {
        final base = feed.firstWhere((p) => p.id == postId);
        return base.withMyReaction(emoji);
      });

  @override
  Future<ChannelPost> unreact(String id, String postId) =>
      _run('unreact:$postId', () {
        final base = feed.firstWhere((p) => p.id == postId);
        return base.withMyReaction(null);
      });

  @override
  Future<ChannelPage<ChannelComment>> comments(
    String id,
    String postId, {
    String? cursor,
  }) =>
      _run('comments:${cursor ?? ''}', () {
        final from = cursor == null ? 0 : int.parse(cursor);
        final to = from + pageSize;
        return ChannelPage(
          commentList.sublist(from, to.clamp(0, commentList.length)),
          to < commentList.length ? '$to' : null,
        );
      });

  @override
  Future<ChannelComment> addComment(String id, String postId, String body) =>
      _run('addComment:$body', () {
        final c = ChannelComment(
          id: 'c-${commentList.length + 1}',
          author: owner,
          body: body,
          createdAt: DateTime(2026, 10, 20),
          canDelete: true,
        );
        commentList = [...commentList, c];
        return c;
      });

  @override
  Future<void> removeComment(String id, String postId, String commentId) =>
      _run('removeComment:$commentId', () {});

  @override
  Future<void> report({
    required String targetId,
    required String reason,
    bool post = false,
  }) =>
      _run('report:${post ? 'post' : 'channel'}:$targetId:$reason', () {});

  @override
  Future<String> uploadAvatar(Uint8List bytes, String mime) =>
      _run('uploadAvatar:$mime', () => 'avatar-file');

  @override
  Future<ChannelVideoUpload> createVideoUpload({
    required int sizeBytes,
    required int durationSec,
  }) =>
      _run(
        'createVideoUpload:$sizeBytes:$durationSec',
        () => const ChannelVideoUpload(
          videoAssetId: 'va-1',
          tusEndpoint: 'https://tus.test/upload',
          libraryId: 'lib',
          videoId: 'vid',
          signature: 'sig',
          expire: 1,
          maxDurationSec: 180,
        ),
      );

  final uploadedVideos = <int>[];

  @override
  Future<void> uploadVideo(
    XFile file,
    ChannelVideoUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) =>
      _run('uploadVideo', () async {
        onProgress?.call(0.5);
        onProgress?.call(1);
        uploadedVideos.add(await file.length());
      });

  @override
  Future<String> videoStatus(String videoAssetId) => _run('videoStatus', () {
        videoPolls++;
        return videoStatusNow;
      });

  @override
  Future<void> cancelVideo(String videoAssetId) => _run('cancelVideo', () {});
}

/// Provider overrides every channels test needs: English texts, the fake
/// repository, the signed-in user, and (optionally) a fake photo uploader.
List<Override> channelsOverrides(
  FakeChannelsRepository repo, {
  Translator translator = const StaticTranslatorEn(),
  ChannelPhotoUploader? uploader,
  String me = 'me',
}) =>
    [
      translatorProvider.overrideWithValue(translator),
      // The screens under test: channels are on, not «next update».
      channelsComingSoonProvider.overrideWithValue(false),
      channelsRepositoryProvider.overrideWithValue(repo),
      currentUserIdProvider.overrideWithValue(me),
      if (uploader != null)
        channelPhotoUploaderProvider.overrideWithValue(uploader),
    ];
