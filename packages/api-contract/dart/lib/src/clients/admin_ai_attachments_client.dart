// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/ai_image_upload_dto.dart';
import '../models/ai_purged_envelope.dart';
import '../models/ai_retention_envelope.dart';
import '../models/file_envelope.dart';
import '../models/presigned_file_envelope.dart';
import '../models/purge_ai_retention_dto.dart';
import '../models/update_ai_retention_dto.dart';

part 'admin_ai_attachments_client.g.dart';

@RestApi()
abstract class AdminAiAttachmentsClient {
  factory AdminAiAttachmentsClient(Dio dio, {String? baseUrl}) =
      _AdminAiAttachmentsClient;

  /// Step 1 of an image for an AI: presigned POST (then POST the file to S3)
  @POST('/admin/ai-attachments/uploads')
  Future<PresignedFileEnvelope> presignAiImage({
    @Body() required AiImageUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Step 2: check the uploaded image (real type by its bytes, then antivirus)
  @POST('/admin/ai-attachments/uploads/{fileId}/confirm')
  Future<FileEnvelope> confirmAiImage({
    @Path('fileId') required String fileId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI pages: how many days records and images stay
  @GET('/admin/ai-attachments/retention')
  Future<AiRetentionEnvelope> getAiRetention({
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI pages: «Хранить N дней» (0 = keep forever)
  @PATCH('/admin/ai-attachments/retention')
  Future<AiRetentionEnvelope> updateAiRetention({
    @Body() required UpdateAiRetentionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI pages: «Очистить сейчас» (undecided and pending items always stay)
  @POST('/admin/ai-attachments/retention/purge')
  Future<AiPurgedEnvelope> purgeAiRetention({
    @Body() required PurgeAiRetentionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
