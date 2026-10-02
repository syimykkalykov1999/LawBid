// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_video_upload_dto.dart';
import '../models/post_kind.dart';
import '../models/post_list_envelope.dart';
import '../models/video_asset_envelope.dart';
import '../models/video_upload_envelope.dart';

part 'videos_client.g.dart';

@RestApi()
abstract class VideosClient {
  factory VideosClient(Dio dio, {String? baseUrl}) = _VideosClient;

  /// Start a direct video upload (TUS credentials)
  @POST('/videos/uploads')
  Future<VideoUploadEnvelope> createVideoUpload({
    @Body() required CreateVideoUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My upload: status while Bunny encodes
  @GET('/videos/{id}')
  Future<VideoAssetEnvelope> getVideoAsset({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel an upload no post uses yet
  @DELETE('/videos/{id}')
  Future<void> cancelVideoUpload({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Video posts, newest first (full-screen reels).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [kind] - Owner 2026-09-30: only News / only regular posts (profile tabs).
  @GET('/reels')
  Future<PostListEnvelope> listReels({
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Query('kind') PostKind? kind,
    @Extras() Map<String, dynamic>? extras,
  });
}
