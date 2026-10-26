// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_r2_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageR2UsageDto _$StorageR2UsageDtoFromJson(Map<String, dynamic> json) =>
    StorageR2UsageDto(
      bytes: json['bytes'] as num,
      objects: json['objects'] as num,
      truncated: json['truncated'] as bool,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$StorageR2UsageDtoToJson(StorageR2UsageDto instance) =>
    <String, dynamic>{
      'bytes': instance.bytes,
      'objects': instance.objects,
      'truncated': instance.truncated,
      'updatedAt': instance.updatedAt.toIso8601String(),
    };
