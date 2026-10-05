// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageOverviewEnvelope _$StorageOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => StorageOverviewEnvelope(
  data: StorageOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StorageOverviewEnvelopeToJson(
  StorageOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
