// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'presigned_file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PresignedFileDto _$PresignedFileDtoFromJson(Map<String, dynamic> json) =>
    PresignedFileDto(
      fileId: json['fileId'] as String,
      upload: PresignedUploadDto.fromJson(
        json['upload'] as Map<String, dynamic>,
      ),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$PresignedFileDtoToJson(PresignedFileDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'upload': instance.upload.toJson(),
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
