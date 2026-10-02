// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_official_sticker_dto.dart';
import '../models/admin_media_reason_dto.dart';
import '../models/admin_sticker_pack_envelope.dart';
import '../models/admin_sticker_pack_row_list_envelope.dart';
import '../models/admin_sticker_upload_dto.dart';
import '../models/admin_video_row_list_envelope.dart';
import '../models/admin_video_stats_envelope.dart';
import '../models/admin_video_status.dart';
import '../models/create_official_sticker_pack_dto.dart';
import '../models/file_envelope.dart';
import '../models/kind.dart';
import '../models/presigned_file_envelope.dart';
import '../models/status5.dart';

part 'admin_media_client.g.dart';

@RestApi()
abstract class AdminMediaClient {
  factory AdminMediaClient(Dio dio, {String? baseUrl}) = _AdminMediaClient;

  /// Video assets (reels), newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/media/videos')
  Future<AdminVideoRowListEnvelope> listAdminVideos({
    @Query('cursor') String? cursor,
    @Query('status') AdminVideoStatus? status,
    @Query('ownerId') String? ownerId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Counts by status, storage, uploads in 7 days
  @GET('/admin/media/videos/stats')
  Future<AdminVideoStatsEnvelope> getAdminVideoStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take a video down: its post is removed (author told why), the asset deleted
  @POST('/admin/media/videos/{id}/takedown')
  Future<void> takedownAdminVideo({
    @Path('id') required String id,
    @Body() required AdminMediaReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sticker packs (official and users), newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Title or short name.
  @GET('/admin/media/sticker-packs')
  Future<AdminStickerPackRowListEnvelope> listAdminStickerPacks({
    @Query('cursor') String? cursor,
    @Query('kind') Kind? kind,
    @Query('status') Status5? status,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create an official pack (shown in Featured)
  @POST('/admin/media/sticker-packs')
  Future<AdminStickerPackEnvelope> createAdminStickerPack({
    @Body() required CreateOfficialStickerPackDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A pack with its stickers and image links
  @GET('/admin/media/sticker-packs/{id}')
  Future<AdminStickerPackEnvelope> getAdminStickerPack({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide a pack (no installs or sends; the author is told why)
  @POST('/admin/media/sticker-packs/{id}/hide')
  Future<AdminStickerPackEnvelope> hideAdminStickerPack({
    @Path('id') required String id,
    @Body() required AdminMediaReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Make a hidden pack available again
  @POST('/admin/media/sticker-packs/{id}/unhide')
  Future<AdminStickerPackEnvelope> unhideAdminStickerPack({
    @Path('id') required String id,
    @Body() required AdminMediaReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add an uploaded (clean) image to an official pack
  @POST('/admin/media/sticker-packs/{id}/stickers')
  Future<AdminStickerPackEnvelope> addAdminSticker({
    @Path('id') required String id,
    @Body() required AddOfficialStickerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a sticker from an official pack (soft)
  @DELETE('/admin/media/sticker-packs/{id}/stickers/{stickerId}')
  Future<AdminStickerPackEnvelope> removeAdminSticker({
    @Path('id') required String id,
    @Path('stickerId') required String stickerId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 1 of a sticker image upload: presigned POST (then POST the file to S3)
  @POST('/admin/media/sticker-uploads')
  Future<PresignedFileEnvelope> presignAdminStickerUpload({
    @Body() required AdminStickerUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 2: verify the uploaded image; it is attachable once scanStatus = clean
  @POST('/admin/media/sticker-uploads/{fileId}/confirm')
  Future<FileEnvelope> confirmAdminStickerUpload({
    @Path('fileId') required String fileId,
    @Extras() Map<String, dynamic>? extras,
  });
}
