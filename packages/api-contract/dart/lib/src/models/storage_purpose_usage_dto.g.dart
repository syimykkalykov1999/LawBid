// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_purpose_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoragePurposeUsageDto _$StoragePurposeUsageDtoFromJson(
  Map<String, dynamic> json,
) => StoragePurposeUsageDto(
  purpose: json['purpose'] as String,
  count: json['count'] as num,
  bytes: json['bytes'] as num,
);

Map<String, dynamic> _$StoragePurposeUsageDtoToJson(
  StoragePurposeUsageDto instance,
) => <String, dynamic>{
  'purpose': instance.purpose,
  'count': instance.count,
  'bytes': instance.bytes,
};
