// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_table_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageTableUsageDto _$StorageTableUsageDtoFromJson(
  Map<String, dynamic> json,
) => StorageTableUsageDto(
  table: json['table'] as String,
  rows: json['rows'] as num,
  bytes: json['bytes'] as num,
);

Map<String, dynamic> _$StorageTableUsageDtoToJson(
  StorageTableUsageDto instance,
) => <String, dynamic>{
  'table': instance.table,
  'rows': instance.rows,
  'bytes': instance.bytes,
};
