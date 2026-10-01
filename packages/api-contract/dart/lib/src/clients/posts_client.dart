// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_post_dto.dart';
import '../models/post_deleted_envelope.dart';
import '../models/post_envelope.dart';
import '../models/post_kind.dart';
import '../models/post_list_envelope.dart';
import '../models/saved_post_item_list_envelope.dart';
import '../models/update_post_dto.dart';

part 'posts_client.g.dart';

@RestApi()
abstract class PostsClient {
  factory PostsClient(Dio dio, {String? baseUrl}) = _PostsClient;

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

  /// An attorney's posts, newest first (docs/05 §15).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [kind] - Owner 2026-09-30: only News / only regular posts (profile tabs).
  @GET('/attorneys/{id}/posts')
  Future<PostListEnvelope> listAttorneyPosts({
    @Path('id') required String id,
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Query('kind') PostKind? kind,
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

  /// Saved posts (docs/05 §4, "Моё → Сохранённое").
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/saved-items/posts')
  Future<SavedPostItemListEnvelope> listSavedPosts({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
