// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_case_file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateCaseFileDto _$PrivateCaseFileDtoFromJson(Map<String, dynamic> json) =>
    PrivateCaseFileDto(
      fileId: json['fileId'] as String,
      mime: json['mime'] as String,
      sizeBytes: json['sizeBytes'] as num,
      description: json['description'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$PrivateCaseFileDtoToJson(PrivateCaseFileDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
      'description': ?instance.description,
      'createdAt': instance.createdAt.toIso8601String(),
    };
