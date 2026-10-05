// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_cleanup_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageCleanupResultEnvelope _$StorageCleanupResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StorageCleanupResultEnvelope(
  data: StorageCleanupResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StorageCleanupResultEnvelopeToJson(
  StorageCleanupResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
