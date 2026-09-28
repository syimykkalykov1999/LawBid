// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'presign_file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PresignFileDto _$PresignFileDtoFromJson(Map<String, dynamic> json) =>
    PresignFileDto(
      purpose: FilePurpose.fromJson(json['purpose'] as String),
      mime: json['mime'] as String,
      sizeBytes: json['sizeBytes'] as num,
      sha256: json['sha256'] as String,
    );

Map<String, dynamic> _$PresignFileDtoToJson(PresignFileDto instance) =>
    <String, dynamic>{
      'purpose': instance.purpose.toJson(),
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
      'sha256': instance.sha256,
    };
