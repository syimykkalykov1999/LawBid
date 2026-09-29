// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'config_entry_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfigEntryEnvelope _$ConfigEntryEnvelopeFromJson(Map<String, dynamic> json) =>
    ConfigEntryEnvelope(
      data: ConfigEntryDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ConfigEntryEnvelopeToJson(
  ConfigEntryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
