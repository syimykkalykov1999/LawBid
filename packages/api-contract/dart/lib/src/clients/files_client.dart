// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/file_envelope.dart';
import '../models/presign_file_dto.dart';
import '../models/presigned_file_envelope.dart';

part 'files_client.g.dart';

@RestApi()
abstract class FilesClient {
  factory FilesClient(Dio dio, {String? baseUrl}) = _FilesClient;

  @POST('/files/presign')
  Future<PresignedFileEnvelope> presign({
    @Body() required PresignFileDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Safe to retry: confirming an already confirmed file returns it.
  @POST('/files/{id}/confirm')
  Future<FileEnvelope> confirm({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Poll after confirm until scanStatus leaves `pending`.
  ///
  /// The name has been replaced because it contains a keyword. Original name: `get`.
  @GET('/files/{id}')
  Future<FileEnvelope> getFilesId({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
