// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_post_dto.dart';
import '../models/person_item_list_envelope.dart';
import '../models/pin_post_dto.dart';
import '../models/post_attachments_allowed_envelope.dart';
import '../models/post_comments_setting_dto.dart';
import '../models/post_counters_dto.dart';
import '../models/post_deleted_envelope.dart';
import '../models/post_envelope.dart';
import '../models/post_kind.dart';
import '../models/post_list_envelope.dart';
import '../models/post_media_filter.dart';
import '../models/saved_post_item_list_envelope.dart';
import '../models/update_post_dto.dart';

part 'posts_client.g.dart';

@RestApi()
abstract class PostsClient {
  factory PostsClient(Dio dio, {String? baseUrl}) = _PostsClient;

  /// May this account add documents / extra photos to a post or a reel
  @GET('/posts/attachments-allowed')
  Future<PostAttachmentsAllowedEnvelope> attachmentsAllowed({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Publish a post (verified attorney, docs/05 §3.1)
  @POST('/posts')
  Future<PostEnvelope> createPost({
    @Body() required CreatePostDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A post (docs/05 §3.5)
  @GET('/posts/{id}')
  Future<PostEnvelope> getPost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit the title, text or qualification of an own post
  @PATCH('/posts/{id}')
  Future<PostEnvelope> updatePost({
    @Path('id') required String id,
    @Body() required UpdatePostDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete an own post (soft, docs/05 §3.3)
  @DELETE('/posts/{id}')
  Future<PostDeletedEnvelope> deletePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide or show the like / view counter of an own post
  @PATCH('/posts/{id}/counters')
  Future<PostEnvelope> setPostCounters({
    @Path('id') required String id,
    @Body() required PostCountersDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn comments of an own post on / off (off: no new comments or replies, the existing ones are hidden)
  @PATCH('/posts/{id}/comments-setting')
  Future<PostEnvelope> setPostComments({
    @Path('id') required String id,
    @Body() required PostCommentsSettingDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Archive an own post (idempotent)
  @POST('/posts/{id}/archive')
  Future<PostEnvelope> archivePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show an archived own post in the profile again
  @DELETE('/posts/{id}/archive')
  Future<PostEnvelope> unarchivePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My archived posts, newest archived first (Settings → «Архив»).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/me/archived-posts')
  Future<PostListEnvelope> listArchivedPosts({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pin an own post to slot 1, 2 or 3
  @POST('/posts/{id}/pin')
  Future<PostEnvelope> pinPost({
    @Path('id') required String id,
    @Body() required PinPostDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unpin an own post
  @DELETE('/posts/{id}/pin')
  Future<PostEnvelope> unpinPost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// An attorney's posts, newest first (docs/05 §15).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [kind] - Owner 2026-09-30: only News / only regular posts (profile tabs).
  ///
  /// [media] - Owner 2026-10-18: the profile's Posts / Reels / briefs tabs.
  @GET('/attorneys/{id}/posts')
  Future<PostListEnvelope> listAttorneyPosts({
    @Path('id') required String id,
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Query('kind') PostKind? kind,
    @Query('media') PostMediaFilter? media,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Like a post (idempotent, docs/05 §4)
  @POST('/posts/{id}/like')
  Future<void> likePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a like (idempotent, docs/05 §4)
  @DELETE('/posts/{id}/like')
  Future<void> unlikePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Count a completed share (OQ-037)
  @POST('/posts/{id}/share')
  Future<void> sharePost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Count a view of a video post / reel (idempotent, one per viewer)
  @POST('/posts/{id}/view')
  Future<void> viewPost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Repost a post, Threads-style (idempotent, owner 2026-10-07)
  @POST('/posts/{id}/repost')
  Future<void> repostPost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Undo a repost (idempotent, owner 2026-10-07)
  @DELETE('/posts/{id}/repost')
  Future<void> unrepostPost({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who reposted a post, newest first (owner 2026-10-18).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/posts/{id}/reposts')
  Future<PersonItemListEnvelope> listReposters({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A user's Reposts profile tab, newest first (owner 2026-10-18).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/{id}/reposts')
  Future<PostListEnvelope> listUserReposts({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Saved posts (docs/05 §4, "Моё → Сохранённое").
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/saved-items/posts')
  Future<SavedPostItemListEnvelope> listSavedPosts({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
