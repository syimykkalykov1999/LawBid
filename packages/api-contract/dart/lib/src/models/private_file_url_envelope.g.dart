// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_file_url_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateFileUrlEnvelope _$PrivateFileUrlEnvelopeFromJson(
  Map<String, dynamic> json,
) => PrivateFileUrlEnvelope(
  data: PrivateFileUrlDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PrivateFileUrlEnvelopeToJson(
  PrivateFileUrlEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
