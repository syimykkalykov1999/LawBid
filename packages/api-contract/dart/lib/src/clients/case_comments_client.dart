// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_comment_envelope.dart';
import '../models/case_comment_list_envelope.dart';
import '../models/comment_deleted_envelope.dart';
import '../models/create_comment_dto.dart';

part 'case_comments_client.g.dart';

@RestApi()
abstract class CaseCommentsClient {
  factory CaseCommentsClient(Dio dio, {String? baseUrl}) = _CaseCommentsClient;

  /// Top-level comments of a case, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/cases/{id}/comments')
  Future<CaseCommentListEnvelope> listCaseComments({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Comment on a case or reply
  @POST('/cases/{id}/comments')
  Future<CaseCommentEnvelope> createCaseComment({
    @Path('id') required String id,
    @Body() required CreateCommentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Count a completed share of a case (OQ-037)
  @POST('/cases/{id}/share')
  Future<void> shareCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replies of a case comment.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/case-comments/{id}/replies')
  Future<CaseCommentListEnvelope> listCaseCommentReplies({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete own comment or one under own case
  @DELETE('/case-comments/{id}')
  Future<CommentDeletedEnvelope> deleteCaseComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Like a case comment (idempotent)
  @POST('/case-comments/{id}/like')
  Future<void> likeCaseComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a case comment like (idempotent)
  @DELETE('/case-comments/{id}/like')
  Future<void> unlikeCaseComment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
