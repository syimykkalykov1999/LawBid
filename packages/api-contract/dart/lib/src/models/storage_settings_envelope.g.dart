// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageSettingsEnvelope _$StorageSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => StorageSettingsEnvelope(
  data: StorageSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StorageSettingsEnvelopeToJson(
  StorageSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
