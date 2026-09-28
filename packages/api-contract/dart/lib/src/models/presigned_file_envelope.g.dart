// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'presigned_file_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PresignedFileEnvelope _$PresignedFileEnvelopeFromJson(
  Map<String, dynamic> json,
) => PresignedFileEnvelope(
  data: PresignedFileDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PresignedFileEnvelopeToJson(
  PresignedFileEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
