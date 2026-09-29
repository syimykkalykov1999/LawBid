// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/comment_deleted_envelope.dart';
import '../models/comment_envelope.dart';
import '../models/comment_list_envelope.dart';
import '../models/create_comment_dto.dart';

part 'comments_client.g.dart';

@RestApi()
abstract class CommentsClient {
  factory CommentsClient(Dio dio, {String? baseUrl}) = _CommentsClient;

  /// Top-level comments, newest first (docs/05 §5.3).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/posts/{id}/comments')
  Future<CommentListEnvelope> listComments({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Comment or reply (docs/05 §5.1)
  @POST('/posts/{id}/comments')
  Future<CommentEnvelope> createComment({
    @Path('id') required String id,
    @Body() required CreateCommentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replies of a comment (docs/05 §5.3).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/comments/{id}/replies')
  Future<CommentListEnvelope> listReplies({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete own comment or one under own post (docs/05 §5.1)
  @DELETE('/comments/{id}')
  Future<CommentDeletedEnvelope> deleteComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Like a comment (idempotent)
  @POST('/comments/{id}/like')
  Future<void> likeComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a comment like (idempotent)
  @DELETE('/comments/{id}/like')
  Future<void> unlikeComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
