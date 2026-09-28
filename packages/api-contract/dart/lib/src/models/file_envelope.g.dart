// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'file_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FileEnvelope _$FileEnvelopeFromJson(Map<String, dynamic> json) => FileEnvelope(
  data: FileDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FileEnvelopeToJson(FileEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
